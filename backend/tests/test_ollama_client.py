import json

import httpx
import pytest

from app.services.ollama_client import RealOllamaClient

CHAT_URL = "http://fake-ollama:11434/api/chat"
TAGS_URL = "http://fake-ollama:11434/api/tags"


def _ndjson_response(objects: list[dict]) -> httpx.Response:
    body = "\n".join(json.dumps(o) for o in objects)
    return httpx.Response(200, content=body.encode("utf-8"))


async def test_stream_chat_parses_content_and_final_stats() -> None:
    lines = [
        {"message": {"role": "assistant", "content": "Hel"}, "done": False},
        {"message": {"role": "assistant", "content": "lo"}, "done": False},
        {
            "message": {"role": "assistant", "content": ""},
            "done": True,
            "eval_count": 20,
            "eval_duration": 2_000_000_000,
        },
    ]

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url == CHAT_URL
        payload = json.loads(request.content)
        assert payload == {
            "model": "qwen2.5-coder:7b",
            "messages": [{"role": "user", "content": "hi"}],
            "stream": True,
        }
        return _ndjson_response(lines)

    client = RealOllamaClient(
        "http://fake-ollama:11434", timeout=5.0, transport=httpx.MockTransport(handler)
    )
    chunks = [c async for c in client.stream_chat("qwen2.5-coder:7b", [{"role": "user", "content": "hi"}])]

    assert [c.content for c in chunks] == ["Hel", "lo", ""]
    assert chunks[-1].done is True
    assert chunks[-1].eval_count == 20
    assert chunks[-1].eval_duration == 2_000_000_000


async def test_stream_chat_raises_on_a_non_2xx_response() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, content=b"internal error")

    client = RealOllamaClient(
        "http://fake-ollama:11434", timeout=5.0, transport=httpx.MockTransport(handler)
    )
    with pytest.raises(httpx.HTTPStatusError):
        async for _ in client.stream_chat("qwen2.5-coder:7b", [{"role": "user", "content": "hi"}]):
            pass


async def test_list_models_extracts_names_from_tags_response() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url == TAGS_URL
        return httpx.Response(
            200,
            json={
                "models": [
                    {"name": "qwen2.5-coder:7b", "size": 123},
                    {"name": "llama3.1:8b", "size": 456},
                ]
            },
        )

    client = RealOllamaClient(
        "http://fake-ollama:11434", timeout=5.0, transport=httpx.MockTransport(handler)
    )
    assert await client.list_models() == ["qwen2.5-coder:7b", "llama3.1:8b"]


async def test_is_healthy_true_on_200() -> None:
    client = RealOllamaClient(
        "http://fake-ollama:11434",
        timeout=5.0,
        transport=httpx.MockTransport(lambda r: httpx.Response(200, json={"models": []})),
    )
    assert await client.is_healthy() is True


async def test_is_healthy_false_on_connection_error() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection refused", request=request)

    client = RealOllamaClient(
        "http://fake-ollama:11434", timeout=5.0, transport=httpx.MockTransport(handler)
    )
    assert await client.is_healthy() is False
