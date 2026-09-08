"""Cliente do Liberty AI Gateway.

O gateway responde no protocolo HTTP da OpenAI, então este pacote é o cliente
da OpenAI com o endereço do gateway e a chave do projeto já resolvidos. Toda a
superfície continua sendo a do `openai`: `responses`, `chat`, `audio`,
`embeddings`, `realtime`. Não existe camada nossa no meio da chamada.

O pacote adiciona o endereço, o nome da variável de ambiente e o cabeçalho que
identifica o cliente nos logs do gateway.
"""

from __future__ import annotations

import os
from typing import Any, AsyncIterable, AsyncIterator, Mapping

from openai import AsyncOpenAI, OpenAI

from ._errors import MissingAPIKey
from ._version import __version__

__all__ = ["AsyncLiberty", "Liberty", "BASE_URL"]

BASE_URL = "https://gateway.libertyti.com.br/v1"

ENV_API_KEY = "LIBERTY_API_KEY"
ENV_BASE_URL = "LIBERTY_BASE_URL"

# Nomes da primeira geração da integração. Continuam valendo para não obrigar
# um deploy de cada produto no dia em que este pacote entra.
ENV_API_KEY_ANTIGA = "LIBERTY_GATEWAY_KEY"
ENV_BASE_URL_ANTIGA = "LIBERTY_GATEWAY_URL"

_FALTA_CHAVE = (
    f"Falta a chave do projeto. Defina {ENV_API_KEY} no ambiente, ou passe "
    "api_key= no construtor. A chave nasce na tela Chaves do console e começa "
    "com sk-liberty-."
)


def _primeira_env(*nomes: str) -> str | None:
    for nome in nomes:
        valor = os.environ.get(nome)
        if valor:
            return valor
    return None


def _resolver_chave(api_key: str | None) -> str:
    chave = api_key or _primeira_env(ENV_API_KEY, ENV_API_KEY_ANTIGA)
    if not chave:
        raise MissingAPIKey(_FALTA_CHAVE)
    return chave


def _resolver_endereco(base_url: str | None) -> str:
    # A URL é constante do cliente, não configuração do produto. A env existe
    # para homologação e instalação no cliente, e some do .env de produção.
    return base_url or _primeira_env(ENV_BASE_URL, ENV_BASE_URL_ANTIGA) or BASE_URL


def _cabecalhos(extra: Any) -> dict[str, str]:
    # Identifica o cliente nos logs do gateway. Header do chamador ganha, para
    # o produto conseguir sobrescrever qualquer coisa nossa.
    cabecalhos = {"x-liberty-client": f"liberty-python/{__version__}"}
    if isinstance(extra, Mapping):
        cabecalhos.update(extra)
    return cabecalhos


def _websocket(endereco: str) -> str:
    endereco = endereco.rstrip("/")
    for http, ws in (("https://", "wss://"), ("http://", "ws://")):
        if endereco.startswith(http):
            return ws + endereco[len(http) :]
    return endereco


class _Comum:
    """O que Liberty e AsyncLiberty compartilham.

    Fica antes do cliente da OpenAI na MRO, então `__init__` daqui resolve
    ambiente e delega o resto para `OpenAI.__init__` sem copiar nada.
    """

    def __init__(
        self,
        *,
        api_key: str | None = None,
        base_url: str | None = None,
        default_headers: Any = None,
        **kwargs: Any,
    ) -> None:
        super().__init__(  # type: ignore[call-arg]
            api_key=_resolver_chave(api_key),
            base_url=_resolver_endereco(base_url),
            default_headers=_cabecalhos(default_headers),
            **kwargs,
        )

    def realtime_url(self, *, intent: str = "transcription") -> str:
        """Endereço do WebSocket de transcrição ao vivo.

        A URL não leva `?model=`: quem escolhe o modelo é o apelido
        configurado no gateway. Passe o apelido no `session.update`.
        """
        return f"{_websocket(str(self.base_url))}/realtime?intent={intent}"

    def realtime_headers(self) -> dict[str, str]:
        """Cabeçalho de autenticação para a biblioteca de WebSocket.

        Nome próprio, e não `auth_headers`: aquele é property do cliente da
        OpenAI, e sobrescrevê-lo cala a autenticação de todas as outras rotas.
        """
        return {"Authorization": f"Bearer {self.api_key}"}


class Liberty(_Comum, OpenAI):
    """Cliente síncrono.

        from liberty import Liberty

        client = Liberty()
        resposta = client.responses.create(model="liberty-<apelido>", input="Olá")
    """


class AsyncLiberty(_Comum, AsyncOpenAI):
    """Cliente assíncrono, mesma superfície do `AsyncOpenAI`."""

    def transcribe_stream(
        self,
        audio: AsyncIterable[bytes],
        *,
        model: str,
        language: str | None = None,
        prompt: str | None = None,
        sample_rate: int = 24000,
    ) -> AsyncIterator[str]:
        """Transcreve áudio ao vivo e devolve o texto em pedaços.

            async for texto in client.transcribe_stream(
                pedacos, model="liberty-<apelido-de-transcricao>", language="pt"
            ):
                print(texto, end="", flush=True)

        `audio` entrega PCM16 mono cru, e cada pedaço é um trecho fechado.
        Detalhe em `liberty._realtime`.
        """
        from ._realtime import transcribe_stream

        return transcribe_stream(
            self,
            audio,
            model=model,
            language=language,
            prompt=prompt,
            sample_rate=sample_rate,
        )
