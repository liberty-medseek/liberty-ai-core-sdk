"""Erros do cliente.

Só entram aqui os erros que o gateway produz e que o produto resolve mudando
alguma coisa: chave que falta, modelo que a chave não pode pedir, teto de gasto
estourado. Erro de rede e erro do provider continuam sendo os do `openai`.
"""

from __future__ import annotations

from typing import Any

__all__ = ["LibertyError", "MissingAPIKey", "TranscriptionFailed", "explain"]


class LibertyError(Exception):
    """Base dos erros levantados por este pacote."""


class MissingAPIKey(LibertyError):
    """Nem o argumento nem a variável de ambiente trouxeram a chave."""


class TranscriptionFailed(LibertyError):
    """A sessão ao vivo recusou o áudio ou caiu no meio do trecho."""


# Código do gateway -> o que a pessoa faz a respeito. O texto assume que quem lê
# tem acesso ao console; quem não tem precisa falar com o dono do projeto.
_ACOES: dict[str, str] = {
    "key_model_access_denied": (
        "A chave deste projeto não tem acesso ao modelo pedido. "
        "Libere o apelido na tela Chaves do console."
    ),
    "budget_exceeded": (
        "O projeto bateu o teto de gasto da janela atual. "
        "Aumente o teto na tela Chaves ou espere a janela virar."
    ),
    "rate_limit_error": (
        "O projeto passou do RPM contratado. "
        "Repita com backoff ou aumente o limite na tela Chaves."
    ),
    "invalid_api_key": (
        "O gateway recusou a chave. "
        "Confira LIBERTY_API_KEY e, se a chave foi rotacionada, pegue o valor novo na tela Chaves."
    ),
}


def _corpo(erro: Any) -> dict[str, Any]:
    corpo = getattr(erro, "body", None)
    if isinstance(corpo, dict):
        interno = corpo.get("error")
        return interno if isinstance(interno, dict) else corpo
    return {}


def explain(erro: Any) -> str | None:
    """Traduz um erro do gateway na ação que resolve.

    Devolve `None` quando o erro não é um dos que o console resolve, para o
    chamador cair no tratamento que já tinha.

        try:
            resposta = client.responses.create(model=..., input=...)
        except openai.APIStatusError as erro:
            log.error(liberty.explain(erro) or str(erro))
    """
    corpo = _corpo(erro)
    codigo = corpo.get("type") or corpo.get("code")
    acao = _ACOES.get(str(codigo)) if codigo is not None else None
    if acao is None:
        return None

    mensagem = corpo.get("message")
    return f"{acao} ({mensagem})" if mensagem else acao
