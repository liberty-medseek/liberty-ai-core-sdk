/**
 * Erros do cliente.
 *
 * Só entram aqui os erros que o gateway produz e que o produto resolve mudando
 * alguma coisa: chave que falta, modelo que a chave não pode pedir, teto de
 * gasto estourado. Erro de rede e erro do provider continuam sendo os do
 * `openai`.
 */

export class LibertyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class MissingAPIKey extends LibertyError {}

/** A sessão ao vivo recusou o áudio ou caiu no meio do trecho. */
export class TranscriptionFailed extends LibertyError {}

/**
 * Código do gateway para a ação que resolve. O texto assume que quem lê tem
 * acesso ao console; quem não tem precisa falar com o dono do projeto.
 */
const ACOES: Record<string, string> = {
  key_model_access_denied:
    'A chave deste projeto não tem acesso ao modelo pedido. Libere o apelido na tela Chaves do console.',
  budget_exceeded:
    'O projeto bateu o teto de gasto da janela atual. Aumente o teto na tela Chaves ou espere a janela virar.',
  rate_limit_error:
    'O projeto passou do RPM contratado. Repita com backoff ou aumente o limite na tela Chaves.',
  invalid_api_key:
    'O gateway recusou a chave. Confira LIBERTY_API_KEY e, se a chave foi rotacionada, pegue o valor novo na tela Chaves.',
};

function corpo(error: unknown): Record<string, unknown> {
  const bruto = (error as { error?: unknown })?.error;
  if (bruto && typeof bruto === 'object') return bruto as Record<string, unknown>;
  if (error && typeof error === 'object') return error as Record<string, unknown>;
  return {};
}

/**
 * Traduz um erro do gateway na ação que resolve.
 *
 * Devolve `null` quando o erro não é um dos que o console resolve, para o
 * chamador cair no tratamento que já tinha.
 *
 *     catch (erro) {
 *       log.error(explain(erro) ?? String(erro));
 *     }
 */
export function explain(error: unknown): string | null {
  const dados = corpo(error);
  const codigo = dados['type'] ?? dados['code'];
  const acao = typeof codigo === 'string' ? ACOES[codigo] : undefined;
  if (!acao) return null;

  const mensagem = dados['message'];
  return typeof mensagem === 'string' && mensagem ? `${acao} (${mensagem})` : acao;
}
