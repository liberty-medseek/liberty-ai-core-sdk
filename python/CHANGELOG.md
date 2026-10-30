# Changelog

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o
versionamento é [semântico](https://semver.org/lang/pt-BR/).

## [0.1.1]

- O endereço embutido passa a ser
  `https://liberty-ai-core-dev.libertyti.com.br/v1`, o host onde o gateway
  atende. O endereço da 0.1.0 nunca respondeu, então quem a instalou só
  conectava definindo `LIBERTY_BASE_URL`.
- `openai` aceita a 3.x (`>=2,<4`). Com o teto em `<3`, o pacote não instalava
  junto de produto que já usa a 3.x.

## [0.1.0]

Primeira versão.

- `Liberty` e `AsyncLiberty`, com o endereço do gateway embutido e a chave lida
  de `LIBERTY_API_KEY`.
- `LIBERTY_GATEWAY_KEY` e `LIBERTY_GATEWAY_URL` continuam sendo lidos, para a
  integração da primeira geração seguir de pé sem deploy.
- `explain`, que traduz os erros do gateway resolvidos no console.
- `transcribe_stream`, que abre a sessão de transcrição ao vivo, manda o áudio
  em trechos e devolve o texto em pedaços. `realtime_url` e `realtime_headers`
  continuam expostos para quem quiser o protocolo na mão.
- `websockets` entra como dependência, então a sessão ao vivo funciona com um
  `pip install` só.
- Cabeçalho `x-liberty-client` em toda chamada.
