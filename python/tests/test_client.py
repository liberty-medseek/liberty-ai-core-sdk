"""O que estes testes protegem.

O pacote é fino, então o risco não está na lógica: está no contrato com o
`openai`. `copy()` e `with_options()` reconstroem o cliente chamando
`self.__class__(...)` com um conjunto fixo de argumentos. Se o `__init__` daqui
parar de aceitar algum deles, quem usa `with_options(timeout=...)` quebra em
produção e não em teste. Por isso o teste de cópia existe.
"""

from __future__ import annotations

import pathlib

import httpx
import pytest

from liberty import BASE_URL, AsyncLiberty, Liberty, MissingAPIKey, __version__, explain

CHAVE = "sk-liberty-teste"


@pytest.fixture(autouse=True)
def ambiente_limpo(monkeypatch: pytest.MonkeyPatch) -> None:
    for nome in (
        "LIBERTY_API_KEY",
        "LIBERTY_BASE_URL",
        "LIBERTY_GATEWAY_KEY",
        "LIBERTY_GATEWAY_URL",
        "OPENAI_API_KEY",
        "OPENAI_BASE_URL",
    ):
        monkeypatch.delenv(nome, raising=False)


def test_endereco_vem_do_pacote(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("LIBERTY_API_KEY", CHAVE)
    client = Liberty()
    assert str(client.base_url).rstrip("/") == BASE_URL
    assert client.api_key == CHAVE


def test_env_antiga_continua_valendo(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("LIBERTY_GATEWAY_KEY", CHAVE)
    monkeypatch.setenv("LIBERTY_GATEWAY_URL", "https://homolog.example/v1")
    client = Liberty()
    assert client.api_key == CHAVE
    assert str(client.base_url).rstrip("/") == "https://homolog.example/v1"


def test_env_nova_ganha_da_antiga(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("LIBERTY_API_KEY", CHAVE)
    monkeypatch.setenv("LIBERTY_GATEWAY_KEY", "sk-liberty-velha")
    assert Liberty().api_key == CHAVE


def test_argumento_ganha_da_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("LIBERTY_API_KEY", "sk-liberty-env")
    client = Liberty(api_key=CHAVE, base_url="https://local.example/v1")
    assert client.api_key == CHAVE
    assert str(client.base_url).rstrip("/") == "https://local.example/v1"


def test_sem_chave_o_erro_diz_o_que_fazer() -> None:
    with pytest.raises(MissingAPIKey) as capturado:
        Liberty()
    assert "LIBERTY_API_KEY" in str(capturado.value)
    assert "tela Chaves" in str(capturado.value)


def test_nao_cai_na_env_da_openai(monkeypatch: pytest.MonkeyPatch) -> None:
    """A key do provider nunca autentica no gateway, então não serve de fallback."""
    monkeypatch.setenv("OPENAI_API_KEY", "sk-proj-da-openai")
    with pytest.raises(MissingAPIKey):
        Liberty()


def test_cabecalho_identifica_o_cliente() -> None:
    client = Liberty(api_key=CHAVE)
    assert client._custom_headers["x-liberty-client"] == f"liberty-python/{__version__}"


def test_cabecalho_do_produto_ganha() -> None:
    client = Liberty(api_key=CHAVE, default_headers={"x-liberty-client": "meu-app/2"})
    assert client._custom_headers["x-liberty-client"] == "meu-app/2"


def test_copy_preserva_a_classe() -> None:
    client = Liberty(api_key=CHAVE)
    copia = client.with_options(timeout=1.0, max_retries=5)
    assert isinstance(copia, Liberty)
    assert copia.api_key == CHAVE
    assert str(copia.base_url).rstrip("/") == BASE_URL
    assert copia._custom_headers["x-liberty-client"] == f"liberty-python/{__version__}"


def test_cliente_assincrono() -> None:
    client = AsyncLiberty(api_key=CHAVE)
    assert str(client.base_url).rstrip("/") == BASE_URL
    assert isinstance(client.with_options(max_retries=2), AsyncLiberty)


def test_nao_sobrescreve_a_property_da_openai() -> None:
    """`auth_headers` é property do cliente da OpenAI. Se este pacote a
    transformar em método, quem ler `client.auth_headers` recebe uma função."""
    client = Liberty(api_key=CHAVE)
    assert client.auth_headers == {"Authorization": f"Bearer {CHAVE}"}


def test_realtime_troca_o_esquema() -> None:
    client = Liberty(api_key=CHAVE)
    assert client.realtime_url() == (
        "wss://gateway.libertyti.com.br/v1/realtime?intent=transcription"
    )
    assert client.realtime_headers() == {"Authorization": f"Bearer {CHAVE}"}


def test_realtime_em_http_local() -> None:
    client = Liberty(api_key=CHAVE, base_url="http://localhost:4000/v1")
    assert client.realtime_url() == "ws://localhost:4000/v1/realtime?intent=transcription"


def _erro(codigo: str, mensagem: str) -> httpx.HTTPStatusError:
    from openai import APIStatusError

    resposta = httpx.Response(
        403,
        request=httpx.Request("POST", "https://gateway.libertyti.com.br/v1/responses"),
        json={"error": {"message": mensagem, "type": codigo, "code": "403"}},
    )
    return APIStatusError(mensagem, response=resposta, body={"error": {"type": codigo, "message": mensagem}})


def test_explain_traduz_modelo_bloqueado() -> None:
    texto = explain(_erro("key_model_access_denied", "key not allowed to access model"))
    assert texto is not None
    assert "tela Chaves" in texto
    assert "key not allowed to access model" in texto


def test_explain_ignora_o_que_o_console_nao_resolve() -> None:
    assert explain(_erro("server_error", "upstream timeout")) is None
    assert explain(ValueError("qualquer coisa")) is None


def test_a_chamada_sai_para_o_gateway(monkeypatch: pytest.MonkeyPatch) -> None:
    """O teste que justifica o pacote: sem base_url no produto, a chamada sai
    para o gateway e não para api.openai.com."""
    monkeypatch.setenv("LIBERTY_API_KEY", CHAVE)
    vistas: list[httpx.Request] = []

    def responder(request: httpx.Request) -> httpx.Response:
        vistas.append(request)
        return httpx.Response(
            200,
            json={
                "id": "resp_1",
                "object": "response",
                "created_at": 0,
                "model": "liberty-modelo-a",
                "status": "completed",
                "output": [],
                "parallel_tool_calls": False,
                "tool_choice": "auto",
                "tools": [],
            },
        )

    client = Liberty(http_client=httpx.Client(transport=httpx.MockTransport(responder)))
    client.responses.create(model="liberty-modelo-a", input="Olá")

    (requisicao,) = vistas
    assert str(requisicao.url) == "https://gateway.libertyti.com.br/v1/responses"
    assert requisicao.headers["authorization"] == f"Bearer {CHAVE}"
    assert requisicao.headers["x-liberty-client"] == f"liberty-python/{__version__}"


def test_pacote_marcado_como_tipado() -> None:
    """Sem `py.typed` o mypy e o pyright ignoram o pacote em silêncio, e quem
    integra perde tipo e autocomplete sem nenhum erro que denuncie o motivo."""
    import liberty

    marcador = pathlib.Path(liberty.__file__).parent / "py.typed"
    assert marcador.is_file()


def test_versao_bate_com_o_changelog() -> None:
    """Tag errada não pode virar release errado."""
    raiz = pathlib.Path(__file__).resolve().parents[1]
    changelog = (raiz / "CHANGELOG.md").read_text(encoding="utf-8")
    assert f"## [{__version__}]" in changelog


def test_lista_os_apelidos_que_a_chave_alcanca() -> None:
    """Exemplo do README: o catálogo vivo por chave."""
    vistas: list[httpx.Request] = []

    def responder(request: httpx.Request) -> httpx.Response:
        vistas.append(request)
        return httpx.Response(
            200,
            json={
                "object": "list",
                "data": [
                    {"id": "liberty-modelo-a", "object": "model", "created": 0, "owned_by": "liberty"},
                    {"id": "liberty-modelo-b", "object": "model", "created": 0, "owned_by": "liberty"},
                ],
            },
        )

    client = Liberty(
        api_key=CHAVE, http_client=httpx.Client(transport=httpx.MockTransport(responder))
    )
    assert [m.id for m in client.models.list()] == [
        "liberty-modelo-a",
        "liberty-modelo-b",
    ]
    assert str(vistas[0].url) == "https://gateway.libertyti.com.br/v1/models"


def test_with_options_troca_timeout_sem_perder_a_classe() -> None:
    perfil = Liberty(api_key=CHAVE).with_options(timeout=20.0, max_retries=1)
    assert isinstance(perfil, Liberty)
    assert perfil.timeout == 20.0
    assert perfil.max_retries == 1
