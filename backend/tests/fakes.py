from collections.abc import AsyncIterator

import httpx

from app.services.ollama_client import ChatChunk


class FakeOllamaClient:
    """Stands in for a real Ollama instance -- yields a canned sequence of ChatChunks, records
    what it was called with, and can simulate Ollama being unreachable (`raise_error=True`)."""

    def __init__(
        self,
        chunks: list[ChatChunk] | None = None,
        models: list[str] | None = None,
        healthy: bool = True,
        raise_error: bool = False,
    ) -> None:
        self.chunks = (
            chunks
            if chunks is not None
            else [
                ChatChunk(content="Hello"),
                ChatChunk(content=" there"),
                ChatChunk(content="", done=True, eval_count=10, eval_duration=1_000_000_000),
            ]
        )
        self.models = models if models is not None else ["qwen2.5-coder:7b"]
        self.healthy = healthy
        self.raise_error = raise_error
        self.received_model: str | None = None
        self.received_messages: list[dict[str, str]] | None = None

    async def stream_chat(
        self, model: str, messages: list[dict[str, str]]
    ) -> AsyncIterator[ChatChunk]:
        self.received_model = model
        self.received_messages = messages
        if self.raise_error:
            raise httpx.ConnectError("connection refused")
        for chunk in self.chunks:
            yield chunk

    async def list_models(self) -> list[str]:
        return self.models

    async def is_healthy(self) -> bool:
        return self.healthy
