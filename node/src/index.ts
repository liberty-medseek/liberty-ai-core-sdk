/**
 * Cliente do Liberty AI Gateway.
 *
 *     import { Liberty } from '@libertyti/ai';
 *
 *     const client = new Liberty();
 *
 *     const resposta = await client.responses.create({
 *       model: 'liberty-<apelido>',
 *       input: 'Resuma o texto abaixo em uma frase.',
 *     });
 *     console.log(resposta.output_text);
 *
 * A chave vem de `LIBERTY_API_KEY`. O endereço já vem no pacote.
 */

export { BASE_URL, ENV_API_KEY, ENV_BASE_URL, Liberty } from './client.js';
export { LibertyError, MissingAPIKey, TranscriptionFailed, explain } from './errors.js';
export type { TranscribeOptions } from './realtime.js';
export { VERSION } from './version.js';
