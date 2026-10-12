import json
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Literal, Protocol

import httpx

from app.config import get_settings

# Ollama's `think` request field. False disables reasoning; a level enables it at that effort --
# Qwen3.8's renderer adds a "keep it brief" / "think carefully" instruction for low / high, and
# gpt-oss maps it to its native reasoning effort. Left unset, Ollama turns reasoning *on*
# (at Qwen3.8's highest effort), so this app always sends it explicitly.
Think = bool | Literal["low", "medium", "high"]


@dataclass
class ChatChunk:
    content: str
    done: bool = False
    eval_count: int | None = None
    eval_duration: int | None = None
    thinking: str = ""


@dataclass
class ModelInfo:
    name: str
    supports_thinking: bool = False


class OllamaClient(Protocol):
    def stream_chat(
        self, model: str, messages: list[dict[str, str]], think: Think = False
    ) -> AsyncIterator[ChatChunk]: ...

    async def list_models(self) -> list[ModelInfo]: ...

    async def is_healthy(self) -> bool: ...


class RealOllamaClient:
    """Talks to a real, locally-running Ollama instance over its native REST API (not the
    OpenAI-compatible shim) -- `/api/chat` for streaming completions, `/api/tags` for the
    locally-pulled model list. A fresh httpx.AsyncClient per call, not a held connection pool:
    simplest thing that works for a single local user's request volume, and avoids any
    client-lifecycle-vs-FastAPI-request-lifecycle edge cases."""

    def __init__(
        self, base_url: str, timeout: float, transport: httpx.AsyncBaseTransport | None = None
    ) -> None:
        self._base_url = base_url
        self._timeout = timeout
        # None (the default) means httpx.AsyncClient uses its real network transport -- only
        # ever overridden in tests, via httpx.MockTransport, to exercise this class's actual
        # request/parsing logic without a real Ollama instance.
        self._transport = transport

    async def stream_chat(
        self, model: str, messages: list[dict[str, str]], think: Think = False
    ) -> AsyncIterator[ChatChunk]:
        async with httpx.AsyncClient(
            timeout=self._timeout, transport=self._transport
        ) as client, client.stream(
            "POST",
            f"{self._base_url}/api/chat",
            # think=False is ignored by models without thinking support, but any level is a 400
            # for them -- callers only pass a level for models list_models() flags as capable.
            json={"model": model, "messages": messages, "stream": True, "think": think},
        ) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if not line:
                    continue
                obj = json.loads(line)
                message = obj.get("message") or {}
                yield ChatChunk(
                    content=message.get("content", ""),
                    done=obj.get("done", False),
                    eval_count=obj.get("eval_count"),
                    eval_duration=obj.get("eval_duration"),
                    thinking=message.get("thinking", ""),
                )

    async def list_models(self) -> list[ModelInfo]:
        async with httpx.AsyncClient(timeout=self._timeout, transport=self._transport) as client:
            response = await client.get(f"{self._base_url}/api/tags")
            response.raise_for_status()
            return [
                ModelInfo(
                    name=m["name"],
                    # Older Ollama versions omit `capabilities` from /api/tags -- treated as
                    # non-thinking, which just hides the effort picker for that model.
                    supports_thinking="thinking" in (m.get("capabilities") or []),
                )
                for m in response.json().get("models", [])
            ]

    async def is_healthy(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=5.0, transport=self._transport) as client:
                response = await client.get(f"{self._base_url}/api/tags")
                return response.status_code == 200
        except httpx.HTTPError:
            return False


def get_ollama_client() -> OllamaClient:
    settings = get_settings()
    return RealOllamaClient(settings.ollama_base_url, settings.ollama_timeout_seconds)
