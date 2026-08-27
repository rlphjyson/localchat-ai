import json
import logging
from collections.abc import AsyncIterator
from datetime import UTC, datetime

import httpx
from fastapi import Request
from sqlalchemy import Engine
from sqlmodel import Session

from app.models import Conversation, Message
from app.services.ollama_client import OllamaClient

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = (
    "You are a helpful, knowledgeable assistant running entirely on the user's own machine via a "
    "self-hosted local model. Be direct and concise. When answering coding questions, prefer "
    "complete, runnable code blocks with the language tagged for syntax highlighting."
)


def sse_event(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


async def stream_chat_response(
    conversation_id: str,
    model: str,
    history: list[dict[str, str]],
    ollama: OllamaClient,
    engine: Engine,
    request: Request,
) -> AsyncIterator[str]:
    """Streams the assistant's reply as SSE token events, then persists the complete (or partial,
    if stopped) response in its own Session (the request-scoped one is long gone by the time this
    generator is actually driven -- same "background work opens its own Session" idiom used
    throughout this series).

    A real, live-caught bug: checking request.is_disconnected() between chunks is not enough on
    its own. When a client aborts the fetch (the Stop button), the ASGI server cancels this
    generator's task outright -- asyncio.CancelledError gets raised inside the `async for` loop
    itself, which is NOT an httpx.HTTPError, so it wasn't caught, and propagated straight out of
    the generator, skipping the persistence code entirely. Confirmed live: a client-aborted
    stream left only the user's message saved, the assistant's (real, partially-generated) reply
    silently dropped. Fixed by moving persistence into a `finally` block, so it runs no matter
    how this generator exits -- normal completion, the httpx-error path below, or a bare
    cancellation from the client disconnecting."""
    full_text: list[str] = []
    tokens_per_second: float | None = None

    try:
        try:
            async for chunk in ollama.stream_chat(model, history):
                if await request.is_disconnected():
                    break
                if chunk.content:
                    full_text.append(chunk.content)
                    yield sse_event("token", {"text": chunk.content})
                if chunk.done and chunk.eval_count and chunk.eval_duration:
                    tokens_per_second = chunk.eval_count / (chunk.eval_duration / 1e9)
        except httpx.HTTPError as exc:
            logger.exception("Ollama request failed for conversation %s", conversation_id)
            yield sse_event("error", {"message": f"Couldn't reach Ollama: {exc}"})
            return

        yield sse_event("done", {"tokens_per_second": tokens_per_second})
    finally:
        assistant_text = "".join(full_text)
        if assistant_text:
            with Session(engine) as session:
                session.add(
                    Message(conversation_id=conversation_id, role="assistant", content=assistant_text)
                )
                conversation = session.get(Conversation, conversation_id)
                if conversation is not None:
                    conversation.updated_at = datetime.now(UTC)
                    session.add(conversation)
                session.commit()
