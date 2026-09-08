"""Sessão de transcrição ao vivo.

A rota é WebSocket, não HTTP, então ela não cabe em `audio.transcriptions`. O
que muda para quem integra é a latência: o arquivo só volta texto no fim, e a
sessão devolve trecho enquanto a pessoa fala.

O protocolo tem quatro passos: abrir, configurar a sessão, mandar áudio em
pedaços e ler os eventos de volta. `transcribe_stream` faz os quatro.
"""

from __future__ import annotations

import asyncio
import base64
from typing import TYPE_CHECKING, Any, AsyncIterable, AsyncIterator, cast

from ._errors import TranscriptionFailed

if TYPE_CHECKING:
    from ._client import AsyncLiberty

DELTA = "conversation.item.input_audio_transcription.delta"
CONCLUIDO = "conversation.item.input_audio_transcription.completed"
FALHOU = "conversation.item.input_audio_transcription.failed"


async def transcribe_stream(
    client: AsyncLiberty,
    audio: AsyncIterable[bytes],
    *,
    model: str,
    language: str | None = None,
    prompt: str | None = None,
    sample_rate: int = 24000,
) -> AsyncIterator[str]:
    """Transcreve áudio ao vivo e devolve o texto em pedaços.

    `audio` entrega PCM16 mono cru. Cada pedaço que sai dele é um trecho
    fechado: o cliente manda e pede a transcrição daquele trecho, então quem
    decide onde cortar é quem produz o áudio. Corte na pausa da fala.

        async for texto in client.transcribe_stream(pedacos, model="liberty-<apelido-de-transcricao>"):
            print(texto, end="", flush=True)

    Levanta `TranscriptionFailed` se a sessão recusar o áudio.
    """
    transcricao: dict[str, Any] = {"model": model}
    if language:
        transcricao["language"] = language
    if prompt:
        transcricao["prompt"] = prompt

    # `intent=transcription` no lugar de `model=`: esta rota recusa modelo na
    # query, e quem resolve o modelo é o apelido dentro da sessão.
    async with client.realtime.connect(extra_query={"intent": "transcription"}) as conexao:
        await conexao.session.update(
            session=cast(
                Any,
                {
                    "type": "transcription",
                    "audio": {
                        "input": {
                            "format": {"type": "audio/pcm", "rate": sample_rate},
                            "transcription": transcricao,
                            # server_vad não vale nesta rota: quem corta o
                            # trecho é quem manda o áudio.
                            "turn_detection": None,
                        }
                    },
                },
            )
        )

        enviados = 0
        fim_do_audio = asyncio.Event()

        async def enviar() -> None:
            nonlocal enviados
            try:
                async for pedaco in audio:
                    if not pedaco:
                        continue
                    await conexao.input_audio_buffer.append(
                        audio=base64.b64encode(pedaco).decode()
                    )
                    await conexao.input_audio_buffer.commit()
                    enviados += 1
            finally:
                fim_do_audio.set()
                # Sem trecho enviado não vem evento nenhum, e o laço de leitura
                # esperaria para sempre. Fechar encerra a iteração.
                if enviados == 0:
                    await conexao.close()

        produtor = asyncio.create_task(enviar())
        concluidos = 0
        try:
            async for evento in conexao:
                if evento.type == DELTA:
                    yield evento.delta
                elif evento.type == CONCLUIDO:
                    concluidos += 1
                    if fim_do_audio.is_set() and concluidos >= enviados:
                        break
                elif evento.type == FALHOU:
                    raise TranscriptionFailed(str(getattr(evento, "error", evento)))
                elif evento.type == "error":
                    raise TranscriptionFailed(str(getattr(evento, "error", evento)))
            await produtor
        finally:
            produtor.cancel()
