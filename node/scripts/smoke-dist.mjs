/**
 * Fuma o artefato construído, não o `src`.
 *
 * Existe por causa de um bug real na 0.1.0: os testes do `src` passavam, e o
 * pacote publicado saía sem os métodos da subclasse. O `module.exports` do
 * `openai` em CJS é uma função wrapper, a classe fica em `.default`, e o
 * interop do bundler apontava para o wrapper. O `super()` devolvia um `OpenAI`
 * pronto, que substituía o `this`.
 *
 * Roda nos dois formatos porque só o CJS quebrava.
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ESPERADO = 'https://gateway.libertyti.com.br/v1';
const METODOS = ['transcribeStream', 'realtimeURL', 'realtimeHeaders', 'responses', 'embeddings'];

const falhas = [];

function checar(formato, Liberty) {
  if (typeof Liberty !== 'function') {
    falhas.push(`${formato}: Liberty não é construtor`);
    return;
  }
  const client = new Liberty({ apiKey: 'sk-liberty-smoke' });
  if (client.constructor.name !== 'Liberty') {
    falhas.push(`${formato}: construtor virou ${client.constructor.name}, a subclasse se perdeu`);
  }
  for (const metodo of METODOS) {
    if (!client[metodo]) falhas.push(`${formato}: falta ${metodo}`);
  }
  if (client.baseURL !== ESPERADO) falhas.push(`${formato}: baseURL é ${client.baseURL}`);
}

checar('cjs', require('../dist/index.cjs').Liberty);
checar('esm', (await import('../dist/index.js')).Liberty);

if (falhas.length) {
  console.error('dist quebrado:\n  ' + falhas.join('\n  '));
  process.exit(1);
}
console.log('dist ok: cjs e esm expõem Liberty com a superfície completa');
