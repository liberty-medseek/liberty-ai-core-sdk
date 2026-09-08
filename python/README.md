# liberty-ai

Cliente Python do Liberty AI Gateway.

```bash
pip install liberty-ai
```

```python
from liberty import Liberty

client = Liberty()

resposta = client.responses.create(
    model="liberty-<apelido>",
    input="Resuma o texto abaixo em uma frase.",
)
print(resposta.output_text)
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
`Liberty` herda de `OpenAI`, então tudo que o `openai` expõe continua valendo:
`responses`, `chat.completions`, `audio.transcriptions`, `embeddings`,
`with_options`, streaming, tool calling. O pacote traz `py.typed`, então tipo e
autocomplete funcionam no mypy e no pyright.

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

```python
for modelo in client.models.list():
    print(modelo.id)
```

## Tempo limite e repetição

Os defaults são os do SDK da OpenAI: 2 repetições e 600 s de timeout. O pacote
não os altera. Chamada de raciocínio longo cabe nesse teto; requisição de
usuário esperando na tela costuma querer menos:

```python
resposta = client.with_options(timeout=20.0, max_retries=1).responses.create(...)
```

`with_options` devolve outro `Liberty`, então dá para guardar um cliente por
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

```python
import openai
import liberty

try:
    resposta = client.responses.create(model="liberty-<apelido>", input=texto)
except openai.APIStatusError as erro:
    log.error(liberty.explain(erro) or str(erro))
```

`explain` devolve a ação para os erros que alguém resolve no console: modelo
fora da chave, teto de gasto estourado, RPM estourado, chave recusada. Para
qualquer outro erro devolve `None`, e o tratamento do produto continua valendo.

## Transcrição ao vivo

`transcribe_stream` abre a sessão, configura, manda o áudio e lê o texto de
volta:

```python
from liberty import AsyncLiberty

client = AsyncLiberty()

async for texto in client.transcribe_stream(
    pedacos, model="liberty-<apelido-de-transcricao>", language="pt"
):
    print(texto, end="", flush=True)
```

`pedacos` é um iterável assíncrono de PCM16 mono cru. Cada pedaço que sai dele é
um trecho fechado: o cliente manda e pede a transcrição daquele trecho, então
quem decide onde cortar é quem produz o áudio. Corte na pausa da fala.

O corte por VAD do servidor fica desligado de propósito. Ligá-lo tiraria de você
o controle de onde o trecho termina, que nesta rota é a única forma de alinhar o
texto com o que a pessoa falou.

Sessão que recusa o áudio levanta `TranscriptionFailed`.

Para controlar o protocolo direto, `realtime_url()` e `realtime_headers()`
montam o endereço e o cabeçalho, e o resto é seu.

## Saída de emergência

O gateway é ponto único de falha. O pacote não traz bypass automático, porque o
apelido do gateway não existe no provedor. O bypass precisa do mapa de apelido
para modelo real, e esse mapa é do produto.

Com esse mapa, a saída é um cliente do provedor, com a credencial dele no
ambiente do produto.

## Desenvolvimento

```bash
python3 -m venv .venv
.venv/bin/pip install -e '.[dev]'
.venv/bin/pytest
```
