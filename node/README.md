# @libertyti/ai

Cliente TypeScript do Liberty AI Gateway.

```bash
npm install @libertyti/ai
```

```ts
import { Liberty } from '@libertyti/ai';

const client = new Liberty();

const resposta = await client.responses.create({
  model: 'liberty-<apelido>',
  input: 'Resuma o texto abaixo em uma frase.',
});
console.log(resposta.output_text);
```

> Nos exemplos, `liberty-<apelido>` é um marcador. Os apelidos reais que a sua
> chave alcança saem de `client.models.list()` e da tela Modelos do console.

O `.env` do produto tem uma linha:

```
LIBERTY_API_KEY=sk-liberty-...
```

A chave nasce na tela Chaves do console, uma por projeto. Ela autentica o
projeto no gateway. As credenciais dos provedores ficam só no ambiente do
gateway, e o produto não as vê.

## O que o pacote é

O gateway responde no protocolo HTTP da OpenAI. Este pacote é o cliente oficial
da OpenAI com o endereço do gateway e a chave do projeto já resolvidos.
`Liberty` estende `OpenAI`, então tudo que o `openai` expõe continua valendo:
`responses`, `chat.completions`, `audio.transcriptions`, `embeddings`,
`withOptions`, streaming, tool calling.

O `openai` vem junto como dependência, então a instalação é um comando só. Um
produto que já use `openai` direto continua com a própria cópia.

O pacote adiciona o endereço, o nome da variável de ambiente e um cabeçalho que
identifica o cliente nos logs do gateway. Nenhuma chamada passa por código
nosso: ele resolve a chave e o endereço no construtor.

## Apelido de modelo

O `model` é o apelido do gateway, não o nome do modelo no provedor. Um apelido
pode apontar para qualquer provedor que o gateway atenda, e o código do produto
é o mesmo em todos. Trocar o provedor por trás de um apelido é mudança de
configuração do gateway, sem deploy do produto.

O catálogo de apelidos está na tela Modelos do console.

## Modelos que a chave alcança

O catálogo está na tela Modelos do console. Para os apelidos que uma chave
específica alcança, pergunte ao gateway:

```ts
for await (const modelo of client.models.list()) {
  console.log(modelo.id);
}
```

## Tempo limite e repetição

Os defaults são os do SDK da OpenAI: 2 repetições e 600000 ms de timeout. O
pacote não os altera. Chamada de raciocínio longo cabe nesse teto; requisição de
usuário esperando na tela costuma querer menos:

```ts
const resposta = await client
  .withOptions({ timeout: 20_000, maxRetries: 1 })
  .responses.create({ model, input });
```

`withOptions` devolve outro `Liberty`, então dá para guardar um cliente por
perfil de chamada.

## Variáveis de ambiente

| Variável | Para que serve |
|---|---|
| `LIBERTY_API_KEY` | A chave do projeto. Obrigatória. |
| `LIBERTY_BASE_URL` | Outro endereço de gateway. Homologação e instalação no cliente. Fora disso, não entra no `.env`. |

`LIBERTY_GATEWAY_KEY` e `LIBERTY_GATEWAY_URL` são os nomes da primeira geração
da integração e continuam funcionando. Os nomes novos ganham quando os dois
estão definidos.

`OPENAI_API_KEY` não serve de reserva: aquela é a credencial do provider e o
gateway não a aceita. Um projeto que tenha as duas no ambiente continua
autenticando com a do Liberty.

## Erro que o console resolve

```ts
import { explain } from '@libertyti/ai';

try {
  const resposta = await client.responses.create({ model, input });
} catch (erro) {
  log.error(explain(erro) ?? String(erro));
}
```

`explain` devolve a ação para os erros que alguém resolve no console: modelo
fora da chave, teto de gasto estourado, RPM estourado, chave recusada. Para
qualquer outro erro devolve `null`, e o tratamento do produto continua valendo.

## Transcrição ao vivo

`transcribeStream` abre a sessão, configura, manda o áudio e lê o texto de
volta:

```ts
import { Liberty } from '@libertyti/ai';

const client = new Liberty();

for await (const texto of client.transcribeStream(pedacos, {
  model: 'liberty-<apelido-de-transcricao>',
  language: 'pt',
})) {
  process.stdout.write(texto);
}
```

`pedacos` é um iterável assíncrono de PCM16 mono cru. Cada pedaço que sai dele é
um trecho fechado: o cliente manda e pede a transcrição daquele trecho, então
quem decide onde cortar é quem produz o áudio. Corte na pausa da fala.

O corte por VAD do servidor fica desligado de propósito. Ligá-lo tiraria de você
o controle de onde o trecho termina, que nesta rota é a única forma de alinhar o
texto com o que a pessoa falou.

Sessão que recusa o áudio levanta `TranscriptionFailed`.

No browser não dá: `WebSocket` do navegador não manda cabeçalho, então a sessão
precisa de um proxy seu que injete o `Authorization`. Em Node funciona direto.

Para controlar o protocolo direto, `realtimeURL()` e `realtimeHeaders()` montam
o endereço e o cabeçalho, e o resto é seu.

## Saída de emergência

O gateway é ponto único de falha. O pacote não traz bypass automático, porque o
apelido do gateway não existe no provedor. O bypass precisa do mapa de apelido
para modelo real, e esse mapa é do produto.

Com esse mapa, a saída é um cliente do provedor, com a credencial dele no
ambiente do produto.

## Desenvolvimento

```bash
npm install
npm run check   # typecheck + testes
npm run build
```
