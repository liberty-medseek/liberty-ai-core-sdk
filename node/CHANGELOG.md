# Changelog

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o
versionamento é [semântico](https://semver.org/lang/pt-BR/).

## [0.1.1]

- Corrige a subclasse sumindo no build CJS. O `module.exports` do `openai` é uma
  função wrapper e a classe fica em `.default`; o interop do bundler apontava
  para o wrapper, e o `super()` devolvia um `OpenAI` pronto que substituía o
  `this`. Em CJS, `new Liberty()` não tinha `transcribeStream`, `realtimeURL`
  nem `realtimeHeaders`. O import passa a ser o export nomeado.
- Teste novo roda contra o `dist` construído, nos dois formatos. Os testes
  anteriores só olhavam o `src`, então não viam falha de empacotamento.

## [0.1.0]

Primeira versão.

- `Liberty`, com o endereço do gateway embutido e a chave lida de
  `LIBERTY_API_KEY`.
- `LIBERTY_GATEWAY_KEY` e `LIBERTY_GATEWAY_URL` continuam sendo lidos, para a
  integração da primeira geração seguir de pé sem deploy.
- `explain`, que traduz os erros do gateway resolvidos no console.
- `transcribeStream`, que abre a sessão de transcrição ao vivo, manda o áudio
  em trechos e devolve o texto em pedaços. `realtimeURL` e `realtimeHeaders`
  continuam expostos para quem quiser o protocolo na mão.
- `ws` entra como dependência: o helper de realtime do `openai` exige `model` na
  query, e esta rota recusa modelo na query.
- Cabeçalho `x-liberty-client` em toda chamada.
