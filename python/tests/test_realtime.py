"""Sessão ao vivo contra um gateway de mentira, falando WebSocket de verdade.

Mock de objeto não serviria: o que quebra nesta rota é a URL, o cabeçalho e a
ordem das mensagens, e nada disso aparece se o socket for falso. O servidor
daqui aceita conexão real e responde o protocolo.
"""

from __future__ import annotations

import asyncio
import base64
import json
from typing import Any, AsyncIterator

import pytest
import websockets

from liberty import AsyncLiberty, TranscriptionFailed

DELTA = "conversation.item.input_audio_transcription.delta"
CONCLUIDO = "conversation.item.input_audio_transcription.completed"
FALHOU = "conversation.item.input_audio_transcription.failed"

CHAVE = "sk-liberty-teste"


class GatewayDeMentira:
    """Responde o mínimo do protocolo e guarda o que recebeu."""

    def __init__(self, *, falhar: bool = False) -> None:
        self.falhar = falhar
        self.caminho = ""
        self.autorizacao = ""
        self.sessao: dict[str, Any] = {}
        self.audio: list[bytes] = []
        self.commits = 0

    async def handler(self, ws: Any) -> None:
        self.caminho = ws.request.path
        self.autorizacao = ws.request.headers.get("authorization", "")
        await ws.send(json.dumps({"type": "session.created", "event_id": "e0", "session": {}}))

        async for bruto in ws:
            evento = json.loads(bruto)
            tipo = evento.get("type")

            if tipo == "session.update":
                self.sessao = evento["session"]
            elif tipo == "input_audio_buffer.append":
                self.audio.append(base64.b64decode(evento["audio"]))
            elif tipo == "input_audio_buffer.commit":
                self.commits += 1
                if self.falhar:
                    await ws.send(
                        json.dumps(
                            {
                                "type": FALHOU,
                                "event_id": f"e{self.commits}",
                                "item_id": f"i{self.commits}",
                                "content_index": 0,
                                "error": {"message": "audio muito curto"},
                            }
                        )
                    )
                    continue
                await ws.send(
                    json.dumps(
                        {
                            "type": DELTA,
                            "event_id": f"d{self.commits}",
                            "item_id": f"i{self.commits}",
                            "content_index": 0,
                            "delta": f"trecho{self.commits} ",
                        }
                    )
                )
                await ws.send(
                    json.dumps(
                        {
                            "type": CONCLUIDO,
                            "event_id": f"c{self.commits}",
                            "item_id": f"i{self.commits}",
                            "content_index": 0,
                            "transcript": f"trecho{self.commits} ",
                        }
                    )
                )


async def _pedacos(*valores: bytes) -> AsyncIterator[bytes]:
    for v in valores:
        yield v


async def _com_gateway(gateway: GatewayDeMentira):
    servidor = await websockets.serve(gateway.handler, "127.0.0.1", 0)
    porta = servidor.sockets[0].getsockname()[1]
    cliente = AsyncLiberty(api_key=CHAVE, base_url=f"http://127.0.0.1:{porta}/v1")
    return servidor, cliente


@pytest.mark.asyncio
async def test_transcreve_dois_trechos_e_termina() -> None:
    gateway = GatewayDeMentira()
    servidor, cliente = await _com_gateway(gateway)
    try:
        saida = [
            texto
            async for texto in cliente.transcribe_stream(
                _pedacos(b"\x01\x02", b"\x03\x04"),
                model="liberty-transcricao-teste",
                language="pt",
            )
        ]
    finally:
        servidor.close()
        await servidor.wait_closed()

    assert saida == ["trecho1 ", "trecho2 "]
    assert gateway.commits == 2
    assert gateway.audio == [b"\x01\x02", b"\x03\x04"]


@pytest.mark.asyncio
async def test_url_leva_intent_e_nao_leva_model() -> None:
    """A OpenAI recusa `model=` na query desta rota, e o gateway resolve o
    modelo pelo apelido de dentro da sessão."""
    gateway = GatewayDeMentira()
    servidor, cliente = await _com_gateway(gateway)
    try:
        async for _ in cliente.transcribe_stream(
            _pedacos(b"\x01"), model="liberty-transcricao-teste"
        ):
            pass
    finally:
        servidor.close()
        await servidor.wait_closed()

    assert "intent=transcription" in gateway.caminho
    assert "model=" not in gateway.caminho
    assert gateway.caminho.startswith("/v1/realtime")
    assert gateway.autorizacao == f"Bearer {CHAVE}"


@pytest.mark.asyncio
async def test_sessao_leva_apelido_idioma_e_corte_manual() -> None:
    gateway = GatewayDeMentira()
    servidor, cliente = await _com_gateway(gateway)
    try:
        async for _ in cliente.transcribe_stream(
            _pedacos(b"\x01"),
            model="liberty-transcricao-teste",
            language="pt",
            prompt="vocabulário do domínio",
            sample_rate=16000,
        ):
            pass
    finally:
        servidor.close()
        await servidor.wait_closed()

    entrada = gateway.sessao["audio"]["input"]
    assert gateway.sessao["type"] == "transcription"
    assert entrada["format"] == {"type": "audio/pcm", "rate": 16000}
    assert entrada["transcription"] == {
        "model": "liberty-transcricao-teste",
        "language": "pt",
        "prompt": "vocabulário do domínio",
    }
    # server_vad cortaria o trecho no servidor, e aqui quem corta é o chamador.
    assert entrada["turn_detection"] is None


@pytest.mark.asyncio
async def test_audio_vazio_nao_trava() -> None:
    """Sem trecho não vem evento, então o laço de leitura esperaria para sempre."""
    gateway = GatewayDeMentira()
    servidor, cliente = await _com_gateway(gateway)
    try:
        saida = [
            texto
            async for texto in cliente.transcribe_stream(
                _pedacos(), model="liberty-transcricao-teste"
            )
        ]
    finally:
        servidor.close()
        await servidor.wait_closed()

    assert saida == []
    assert gateway.commits == 0


@pytest.mark.asyncio
async def test_falha_da_sessao_vira_erro_tipado() -> None:
    gateway = GatewayDeMentira(falhar=True)
    servidor, cliente = await _com_gateway(gateway)
    try:
        with pytest.raises(TranscriptionFailed) as capturado:
            async for _ in cliente.transcribe_stream(
                _pedacos(b"\x01"), model="liberty-transcricao-teste"
            ):
                pass
    finally:
        servidor.close()
        await servidor.wait_closed()

    assert "audio muito curto" in str(capturado.value)
