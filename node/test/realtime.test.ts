/**
 * Sessão ao vivo contra um gateway de mentira, falando WebSocket de verdade.
 *
 * Mock de objeto não serviria: o que quebra nesta rota é a URL, o cabeçalho e a
 * ordem das mensagens, e nada disso aparece se o socket for falso.
 */

import { WebSocketServer, type WebSocket } from 'ws';
import { afterEach, describe, expect, it } from 'vitest';

import { Liberty, TranscriptionFailed } from '../src/index.js';

const DELTA = 'conversation.item.input_audio_transcription.delta';
const CONCLUIDO = 'conversation.item.input_audio_transcription.completed';
const FALHOU = 'conversation.item.input_audio_transcription.failed';

const CHAVE = 'sk-liberty-teste';

class GatewayDeMentira {
  caminho = '';
  autorizacao = '';
  sessao: any = {};
  audio: Buffer[] = [];
  commits = 0;

  constructor(private readonly falhar = false) {}

  montar(ws: WebSocket, url: string, autorizacao: string) {
    this.caminho = url;
    this.autorizacao = autorizacao;
    ws.send(JSON.stringify({ type: 'session.created', event_id: 'e0', session: {} }));

    ws.on('message', (bruto) => {
      const evento = JSON.parse(bruto.toString());
      if (evento.type === 'session.update') {
        this.sessao = evento.session;
      } else if (evento.type === 'input_audio_buffer.append') {
        this.audio.push(Buffer.from(evento.audio, 'base64'));
      } else if (evento.type === 'input_audio_buffer.commit') {
        this.commits += 1;
        if (this.falhar) {
          ws.send(
            JSON.stringify({
              type: FALHOU,
              event_id: `e${this.commits}`,
              item_id: `i${this.commits}`,
              content_index: 0,
              error: { message: 'audio muito curto' },
            }),
          );
          return;
        }
        ws.send(
          JSON.stringify({
            type: DELTA,
            event_id: `d${this.commits}`,
            item_id: `i${this.commits}`,
            content_index: 0,
            delta: `trecho${this.commits} `,
          }),
        );
        ws.send(
          JSON.stringify({
            type: CONCLUIDO,
            event_id: `c${this.commits}`,
            item_id: `i${this.commits}`,
            content_index: 0,
            transcript: `trecho${this.commits} `,
          }),
        );
      }
    });
  }
}

let servidor: WebSocketServer | null = null;

afterEach(async () => {
  if (servidor) {
    await new Promise<void>((r) => servidor!.close(() => r()));
    servidor = null;
  }
});

async function subir(gateway: GatewayDeMentira): Promise<Liberty> {
  servidor = new WebSocketServer({ port: 0 });
  servidor.on('connection', (ws, req) => {
    gateway.montar(ws, req.url ?? '', req.headers.authorization ?? '');
  });
  await new Promise<void>((r) => servidor!.once('listening', () => r()));
  const porta = (servidor.address() as { port: number }).port;
  return new Liberty({ apiKey: CHAVE, baseURL: `http://127.0.0.1:${porta}/v1` });
}

async function* pedacos(...valores: Uint8Array[]): AsyncIterable<Uint8Array> {
  for (const v of valores) yield v;
}

async function coletar(iteravel: AsyncIterable<string>): Promise<string[]> {
  const saida: string[] = [];
  for await (const texto of iteravel) saida.push(texto);
  return saida;
}

describe('sessão ao vivo', () => {
  it('transcreve dois trechos e termina', async () => {
    const gateway = new GatewayDeMentira();
    const client = await subir(gateway);

    const saida = await coletar(
      client.transcribeStream(pedacos(new Uint8Array([1, 2]), new Uint8Array([3, 4])), {
        model: 'liberty-transcricao-teste',
        language: 'pt',
      }),
    );

    expect(saida).toEqual(['trecho1 ', 'trecho2 ']);
    expect(gateway.commits).toBe(2);
    expect(gateway.audio.map((b) => [...b])).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it('a URL leva intent e não leva model', async () => {
    // A OpenAI recusa `model=` na query desta rota, e o gateway resolve o
    // modelo pelo apelido de dentro da sessão.
    const gateway = new GatewayDeMentira();
    const client = await subir(gateway);

    await coletar(
      client.transcribeStream(pedacos(new Uint8Array([1])), {
        model: 'liberty-transcricao-teste',
      }),
    );

    expect(gateway.caminho).toContain('intent=transcription');
    expect(gateway.caminho).not.toContain('model=');
    expect(gateway.caminho.startsWith('/v1/realtime')).toBe(true);
    expect(gateway.autorizacao).toBe(`Bearer ${CHAVE}`);
  });

  it('a sessão leva apelido, idioma e corte manual', async () => {
    const gateway = new GatewayDeMentira();
    const client = await subir(gateway);

    await coletar(
      client.transcribeStream(pedacos(new Uint8Array([1])), {
        model: 'liberty-transcricao-teste',
        language: 'pt',
        prompt: 'vocabulário do domínio',
        sampleRate: 16000,
      }),
    );

    const entrada = gateway.sessao.audio.input;
    expect(gateway.sessao.type).toBe('transcription');
    expect(entrada.format).toEqual({ type: 'audio/pcm', rate: 16000 });
    expect(entrada.transcription).toEqual({
      model: 'liberty-transcricao-teste',
      language: 'pt',
      prompt: 'vocabulário do domínio',
    });
    expect(entrada.turn_detection).toBeNull();
  });

  it('áudio vazio não trava', async () => {
    const gateway = new GatewayDeMentira();
    const client = await subir(gateway);

    const saida = await coletar(
      client.transcribeStream(pedacos(), { model: 'liberty-transcricao-teste' }),
    );

    expect(saida).toEqual([]);
    expect(gateway.commits).toBe(0);
  });

  it('falha da sessão vira erro tipado', async () => {
    const gateway = new GatewayDeMentira(true);
    const client = await subir(gateway);

    await expect(
      coletar(client.transcribeStream(pedacos(new Uint8Array([1])), {
        model: 'liberty-transcricao-teste',
      })),
    ).rejects.toThrow(TranscriptionFailed);
  });
});
