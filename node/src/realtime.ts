/**
 * Sessão de transcrição ao vivo.
 *
 * A rota é WebSocket, não HTTP, então ela não cabe em `audio.transcriptions`.
 * O que muda para quem integra é a latência: o arquivo só volta texto no fim, e
 * a sessão devolve trecho enquanto a pessoa fala.
 *
 * O helper de realtime do `openai` não serve aqui: ele exige `model` e o crava
 * na query, e esta rota recusa modelo na query. Por isso o socket é montado
 * neste módulo, com `realtimeURL()` e `realtimeHeaders()` do cliente.
 */

import WebSocket from 'ws';

import type { Liberty } from './client.js';
import { TranscriptionFailed } from './errors.js';

const DELTA = 'conversation.item.input_audio_transcription.delta';
const CONCLUIDO = 'conversation.item.input_audio_transcription.completed';
const FALHOU = 'conversation.item.input_audio_transcription.failed';

export type TranscribeOptions = {
  /** Apelido do gateway, por exemplo `liberty-<apelido-de-transcricao>`. */
  model: string;
  language?: string;
  prompt?: string;
  /** Taxa do PCM16 mono que você manda. */
  sampleRate?: number;
};

export async function* transcribeStream(
  client: Liberty,
  audio: AsyncIterable<Uint8Array>,
  { model, language, prompt, sampleRate = 24000 }: TranscribeOptions,
): AsyncGenerator<string> {
  const transcription: Record<string, string> = { model };
  if (language) transcription['language'] = language;
  if (prompt) transcription['prompt'] = prompt;

  const ws = new WebSocket(client.realtimeURL(), { headers: client.realtimeHeaders() });

  const fila: string[] = [];
  let acordar: (() => void) | null = null;
  let falha: Error | null = null;
  let terminou = false;
  let enviados = 0;
  let concluidos = 0;
  let audioAcabou = false;

  const sinalizar = () => {
    const pendente = acordar;
    acordar = null;
    pendente?.();
  };

  const encerrarSePossivel = () => {
    if (audioAcabou && concluidos >= enviados) {
      terminou = true;
      sinalizar();
    }
  };

  ws.on('message', (bruto) => {
    let evento: { type?: string; delta?: string; error?: unknown };
    try {
      evento = JSON.parse(bruto.toString());
    } catch {
      return;
    }
    if (evento.type === DELTA && typeof evento.delta === 'string') {
      fila.push(evento.delta);
      sinalizar();
    } else if (evento.type === CONCLUIDO) {
      concluidos += 1;
      encerrarSePossivel();
    } else if (evento.type === FALHOU || evento.type === 'error') {
      falha = new TranscriptionFailed(JSON.stringify(evento.error ?? evento));
      sinalizar();
    }
  });
  ws.on('error', (erro) => {
    falha = erro;
    sinalizar();
  });
  ws.on('close', () => {
    terminou = true;
    sinalizar();
  });

  await new Promise<void>((resolver, rejeitar) => {
    ws.once('open', resolver);
    ws.once('error', rejeitar);
  });

  ws.send(
    JSON.stringify({
      type: 'session.update',
      session: {
        type: 'transcription',
        audio: {
          input: {
            format: { type: 'audio/pcm', rate: sampleRate },
            transcription,
            // server_vad cortaria o trecho no servidor, e aqui quem corta é
            // quem manda o áudio.
            turn_detection: null,
          },
        },
      },
    }),
  );

  const produtor = (async () => {
    for await (const pedaco of audio) {
      if (!pedaco.length) continue;
      ws.send(
        JSON.stringify({
          type: 'input_audio_buffer.append',
          audio: Buffer.from(pedaco).toString('base64'),
        }),
      );
      ws.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
      enviados += 1;
    }
    audioAcabou = true;
    // Sem trecho não vem evento nenhum, e o laço de leitura esperaria para
    // sempre. Fechar encerra a iteração.
    if (enviados === 0) ws.close();
    encerrarSePossivel();
  })();

  try {
    for (;;) {
      while (fila.length) yield fila.shift() as string;
      if (falha) throw falha;
      if (terminou) break;
      await new Promise<void>((resolver) => {
        acordar = resolver;
      });
    }
    await produtor;
  } finally {
    ws.close();
  }
}
