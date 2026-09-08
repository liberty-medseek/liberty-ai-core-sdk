"""Cliente do Liberty AI Gateway.

    from liberty import Liberty

    client = Liberty()

    resposta = client.responses.create(
        model="liberty-<apelido>",
        input="Resuma o texto abaixo em uma frase.",
    )
    print(resposta.output_text)

A chave vem de `LIBERTY_API_KEY`. O endereço já vem no pacote.
"""

from ._client import BASE_URL, AsyncLiberty, Liberty
from ._errors import LibertyError, MissingAPIKey, TranscriptionFailed, explain
from ._version import __version__

__all__ = [
    "AsyncLiberty",
    "BASE_URL",
    "Liberty",
    "LibertyError",
    "MissingAPIKey",
    "TranscriptionFailed",
    "__version__",
    "explain",
]
