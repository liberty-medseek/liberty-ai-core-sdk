# liberty-ai-core-sdk

Clientes do Liberty AI Gateway, em Python e TypeScript.

| Pacote | Diretório | Instalação |
|---|---|---|
| `liberty-ai` | [`python/`](python) | `pip install liberty-ai` |
| `@libertyti/ai` | [`node/`](node) | `npm install @libertyti/ai` |

```python
from liberty import Liberty

client = Liberty()

resposta = client.responses.create(
    model="liberty-<apelido>",
    input="Resuma o texto abaixo em uma frase.",
)
```

```ts
import { Liberty } from '@libertyti/ai';

const client = new Liberty();

const resposta = await client.responses.create({
  model: 'liberty-<apelido>',
  input: 'Resuma o texto abaixo em uma frase.',
});
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

## O que estes pacotes são

O gateway responde no protocolo HTTP da OpenAI. Cada pacote é o cliente oficial
da OpenAI com o endereço do gateway e a chave do projeto já resolvidos, então
toda a superfície continua valendo: `responses`, `chat`, `audio`, `embeddings`,
streaming e tool calling.

O `model` é o apelido do gateway, não o nome do modelo no provedor. Um apelido
pode apontar para qualquer provedor que o gateway atenda, e o código do produto
é o mesmo em todos.

O README de cada pacote tem o resto: variáveis de ambiente, transcrição ao vivo,
tempo limite e saída de emergência.

## Versão

Os dois pacotes andam em lockstep. Uma tag `vX.Y.Z` publica os dois, e o CI
recusa a tag se a versão de qualquer um divergir dela. Isso publica uma release
idêntica no pacote que não mudou, e em troca `liberty-ai 0.2.0` e
`@libertyti/ai 0.2.0` sempre têm as mesmas funcionalidades.

## Desenvolvimento

```bash
cd python && python3 -m venv .venv && .venv/bin/pip install -e '.[dev]' && .venv/bin/pytest
cd node   && npm install && npm run check
```

## Publicar

```bash
git tag v0.1.0 && git push origin v0.1.0
```

O GitHub Actions testa os dois, confere a tag contra as versões e publica. O
PyPI usa trusted publishing, então não há token dele no repositório. O npm usa
o secret `NPM_TOKEN` e sai com provenance.
