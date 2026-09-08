/**
 * O que estes testes protegem.
 *
 * O pacote é fino, então o risco não está na lógica: está no contrato com o
 * `openai`. `withOptions()` reconstrói o cliente chamando o próprio construtor.
 * Se o construtor daqui parar de aceitar o que ele passa, quem usa
 * `withOptions({ timeout })` quebra em produção e não em teste.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { BASE_URL, Liberty, MissingAPIKey, VERSION, explain } from '../src/index.js';

const CHAVE = 'sk-liberty-teste';

const ENVS = [
  'LIBERTY_API_KEY',
  'LIBERTY_BASE_URL',
  'LIBERTY_GATEWAY_KEY',
  'LIBERTY_GATEWAY_URL',
  'OPENAI_API_KEY',
  'OPENAI_BASE_URL',
];

let salvas: Record<string, string | undefined> = {};

beforeEach(() => {
  salvas = Object.fromEntries(ENVS.map((nome) => [nome, process.env[nome]]));
  for (const nome of ENVS) delete process.env[nome];
});

afterEach(() => {
  for (const [nome, valor] of Object.entries(salvas)) {
    if (valor === undefined) delete process.env[nome];
    else process.env[nome] = valor;
  }
});

/** Captura a requisição que sai, que é o único jeito honesto de ver o header. */
async function capturar(options: ConstructorParameters<typeof Liberty>[0] = {}) {
  const vistas: Request[] = [];
  const client = new Liberty({
    ...options,
    fetch: async (url, init) => {
      vistas.push(new Request(url as string, init as RequestInit));
      return new Response(
        JSON.stringify({
          id: 'resp_1',
          object: 'response',
          created_at: 0,
          model: 'liberty-modelo-a',
          status: 'completed',
          output: [],
          parallel_tool_calls: false,
          tool_choice: 'auto',
          tools: [],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    },
  });
  await client.responses.create({ model: 'liberty-modelo-a', input: 'Olá' });
  return vistas[0]!;
}

describe('ambiente', () => {
  it('o endereço vem do pacote', () => {
    process.env['LIBERTY_API_KEY'] = CHAVE;
    const client = new Liberty();
    expect(client.baseURL).toBe(BASE_URL);
    expect(client.apiKey).toBe(CHAVE);
  });

  it('a env antiga continua valendo', () => {
    process.env['LIBERTY_GATEWAY_KEY'] = CHAVE;
    process.env['LIBERTY_GATEWAY_URL'] = 'https://homolog.example/v1';
    const client = new Liberty();
    expect(client.apiKey).toBe(CHAVE);
    expect(client.baseURL).toBe('https://homolog.example/v1');
  });

  it('a env nova ganha da antiga', () => {
    process.env['LIBERTY_API_KEY'] = CHAVE;
    process.env['LIBERTY_GATEWAY_KEY'] = 'sk-liberty-velha';
    expect(new Liberty().apiKey).toBe(CHAVE);
  });

  it('o argumento ganha da env', () => {
    process.env['LIBERTY_API_KEY'] = 'sk-liberty-env';
    const client = new Liberty({ apiKey: CHAVE, baseURL: 'https://local.example/v1' });
    expect(client.apiKey).toBe(CHAVE);
    expect(client.baseURL).toBe('https://local.example/v1');
  });

  it('sem chave, o erro diz o que fazer', () => {
    expect(() => new Liberty()).toThrow(MissingAPIKey);
    expect(() => new Liberty()).toThrow(/LIBERTY_API_KEY/);
    expect(() => new Liberty()).toThrow(/tela Chaves/);
  });

  it('não cai na env da OpenAI', () => {
    // A key do provider nunca autentica no gateway, então não serve de reserva.
    process.env['OPENAI_API_KEY'] = 'sk-proj-da-openai';
    expect(() => new Liberty()).toThrow(MissingAPIKey);
  });
});

describe('cabeçalho', () => {
  it('identifica o cliente', async () => {
    const requisicao = await capturar({ apiKey: CHAVE });
    expect(requisicao.headers.get('x-liberty-client')).toBe(`liberty-node/${VERSION}`);
  });

  it('o do produto ganha', async () => {
    const requisicao = await capturar({
      apiKey: CHAVE,
      defaultHeaders: { 'x-liberty-client': 'meu-app/2' },
    });
    expect(requisicao.headers.get('x-liberty-client')).toBe('meu-app/2');
  });
});

describe('withOptions', () => {
  it('preserva a classe e o ambiente', () => {
    const client = new Liberty({ apiKey: CHAVE });
    const copia = client.withOptions({ maxRetries: 5 });
    expect(copia).toBeInstanceOf(Liberty);
    expect(copia.apiKey).toBe(CHAVE);
    expect(copia.baseURL).toBe(BASE_URL);
    expect(copia.maxRetries).toBe(5);
  });
});

describe('realtime', () => {
  it('troca o esquema', () => {
    const client = new Liberty({ apiKey: CHAVE });
    expect(client.realtimeURL()).toBe(
      'wss://gateway.libertyti.com.br/v1/realtime?intent=transcription',
    );
    expect(client.realtimeHeaders()).toEqual({ Authorization: `Bearer ${CHAVE}` });
  });

  it('não sobrescreve o authHeaders do cliente da OpenAI', async () => {
    // Se este pacote redefinir authHeaders, a autenticação de todas as outras
    // rotas para de funcionar. O typecheck pega, e o teste também.
    process.env['LIBERTY_API_KEY'] = CHAVE;
    const requisicao = await capturar();
    expect(requisicao.headers.get('authorization')).toBe(`Bearer ${CHAVE}`);
  });

  it('funciona em http local', () => {
    const client = new Liberty({ apiKey: CHAVE, baseURL: 'http://localhost:4000/v1' });
    expect(client.realtimeURL()).toBe(
      'ws://localhost:4000/v1/realtime?intent=transcription',
    );
  });
});

describe('explain', () => {
  const erro = (type: string, message: string) => ({ error: { type, message, code: '403' } });

  it('traduz modelo bloqueado', () => {
    const texto = explain(erro('key_model_access_denied', 'key not allowed to access model'));
    expect(texto).toContain('tela Chaves');
    expect(texto).toContain('key not allowed to access model');
  });

  it('ignora o que o console não resolve', () => {
    expect(explain(erro('server_error', 'upstream timeout'))).toBeNull();
    expect(explain(new Error('qualquer coisa'))).toBeNull();
  });
});

describe('a chamada sai para o gateway', () => {
  it('usa o endereço do gateway e a chave do projeto', async () => {
    // O teste que justifica o pacote: sem baseURL no produto, a chamada sai
    // para o gateway e não para api.openai.com.
    process.env['LIBERTY_API_KEY'] = CHAVE;
    const requisicao = await capturar();
    expect(requisicao.url).toBe('https://gateway.libertyti.com.br/v1/responses');
    expect(requisicao.headers.get('authorization')).toBe(`Bearer ${CHAVE}`);
  });
});

describe('empacotamento', () => {
  it('a versão do código bate com o package.json e o changelog', async () => {
    // Tag errada não pode virar release errado.
    const { readFileSync } = await import('node:fs');
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    const changelog = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8');

    expect(VERSION).toBe(pkg.version);
    expect(changelog).toContain(`## [${VERSION}]`);
  });
});

describe('exemplos do README', () => {
  it('lista os apelidos que a chave alcança', async () => {
    const vistas: string[] = [];
    const client = new Liberty({
      apiKey: CHAVE,
      fetch: async (url) => {
        vistas.push(String(url));
        return new Response(
          JSON.stringify({
            object: 'list',
            data: [
              { id: 'liberty-modelo-a', object: 'model', created: 0, owned_by: 'liberty' },
              { id: 'liberty-modelo-b', object: 'model', created: 0, owned_by: 'liberty' },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      },
    });

    const ids: string[] = [];
    for await (const modelo of client.models.list()) ids.push(modelo.id);

    expect(ids).toEqual(['liberty-modelo-a', 'liberty-modelo-b']);
    expect(vistas[0]).toBe('https://gateway.libertyti.com.br/v1/models');
  });

  it('withOptions troca timeout e retries sem perder a classe', () => {
    const perfil = new Liberty({ apiKey: CHAVE }).withOptions({
      timeout: 20_000,
      maxRetries: 1,
    });
    expect(perfil).toBeInstanceOf(Liberty);
    expect(perfil.timeout).toBe(20_000);
    expect(perfil.maxRetries).toBe(1);
  });
});
