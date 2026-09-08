/**
 * Cliente do Liberty AI Gateway.
 *
 * O gateway responde no protocolo HTTP da OpenAI, então este pacote é o cliente
 * da OpenAI com o endereço do gateway e a chave do projeto já resolvidos. Toda
 * a superfície continua sendo a do `openai`: `responses`, `chat`, `audio`,
 * `embeddings`. Não existe camada nossa no meio da chamada.
 *
 * O pacote adiciona o endereço, o nome da variável de ambiente e o cabeçalho
 * que identifica o cliente nos logs do gateway.
 */

// Export NOMEADO de proposito. O `module.exports` do openai em CJS e uma
// funcao wrapper, e a classe fica em `.default`. O interop do esbuild aponta o
// default do bundle para o wrapper, entao `extends` no default faz o `super()`
// devolver um OpenAI pronto, que substitui o `this` e apaga esta subclasse.
// Com o nomeado, CJS e ESM resolvem a mesma classe.
import { OpenAI, type ClientOptions } from 'openai';

import { MissingAPIKey } from './errors.js';
import { transcribeStream, type TranscribeOptions } from './realtime.js';
import { VERSION } from './version.js';

// Endereço de produção. Trocar este valor é mudança de contrato: sai versão
// nova dos dois pacotes, e o console troca junto. Quem instalou a versão antiga
// continua batendo no endereço antigo até atualizar.
export const BASE_URL = 'https://gateway.libertyti.com.br/v1';

export const ENV_API_KEY = 'LIBERTY_API_KEY';
export const ENV_BASE_URL = 'LIBERTY_BASE_URL';

/**
 * Nomes da primeira geração da integração. Continuam valendo para não obrigar
 * um deploy de cada produto no dia em que este pacote entra.
 */
const ENV_API_KEY_ANTIGA = 'LIBERTY_GATEWAY_KEY';
const ENV_BASE_URL_ANTIGA = 'LIBERTY_GATEWAY_URL';

const FALTA_CHAVE =
  `Falta a chave do projeto. Defina ${ENV_API_KEY} no ambiente, ou passe apiKey ` +
  'no construtor. A chave nasce na tela Chaves do console e começa com sk-liberty-.';

function primeiraEnv(...nomes: string[]): string | undefined {
  for (const nome of nomes) {
    const valor = process.env[nome];
    if (valor) return valor;
  }
  return undefined;
}

function websocket(endereco: string): string {
  const limpo = endereco.replace(/\/+$/, '');
  if (limpo.startsWith('https://')) return `wss://${limpo.slice('https://'.length)}`;
  if (limpo.startsWith('http://')) return `ws://${limpo.slice('http://'.length)}`;
  return limpo;
}

export class Liberty extends OpenAI {
  constructor(options: ClientOptions = {}) {
    const apiKey = options.apiKey ?? primeiraEnv(ENV_API_KEY, ENV_API_KEY_ANTIGA);
    if (!apiKey) throw new MissingAPIKey(FALTA_CHAVE);

    super({
      ...options,
      apiKey,
      baseURL:
        options.baseURL ??
        primeiraEnv(ENV_BASE_URL, ENV_BASE_URL_ANTIGA) ??
        BASE_URL,
      // Header do produto ganha, para ele conseguir sobrescrever o nosso.
      defaultHeaders: {
        'x-liberty-client': `liberty-node/${VERSION}`,
        ...options.defaultHeaders,
      },
    });
  }

  /**
   * Transcreve áudio ao vivo e devolve o texto em pedaços.
   *
   *     for await (const texto of client.transcribeStream(pedacos, {
   *       model: 'liberty-<apelido-de-transcricao>',
   *       language: 'pt',
   *     })) {
   *       process.stdout.write(texto);
   *     }
   *
   * `audio` entrega PCM16 mono cru, e cada pedaço é um trecho fechado: o
   * cliente manda e pede a transcrição daquele trecho, então quem decide onde
   * cortar é quem produz o áudio. Corte na pausa da fala.
   */
  transcribeStream(
    audio: AsyncIterable<Uint8Array>,
    options: TranscribeOptions,
  ): AsyncGenerator<string> {
    return transcribeStream(this, audio, options);
  }

  /**
   * Endereço do WebSocket de transcrição ao vivo.
   *
   * A URL não leva `?model=`: quem escolhe o modelo é o apelido
   * configurado no gateway. Passe o apelido no `session.update`.
   */
  realtimeURL({ intent = 'transcription' }: { intent?: string } = {}): string {
    return `${websocket(this.baseURL)}/realtime?intent=${intent}`;
  }

  /**
   * Cabeçalho de autenticação para a biblioteca de WebSocket.
   *
   * Nome próprio, e não `authHeaders`: aquele é método do cliente da OpenAI, e
   * sobrescrevê-lo cala a autenticação de todas as outras rotas.
   */
  realtimeHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${this.apiKey}` };
  }
}
