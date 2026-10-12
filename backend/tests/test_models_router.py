from fastapi.testclient import TestClient

from app.services.ollama_client import ModelInfo
from tests.fakes import FakeOllamaClient


def test_list_models_returns_the_ollama_clients_models(
    client: TestClient, fake_ollama: FakeOllamaClient
) -> None:
    fake_ollama.models = [
        ModelInfo("qwen3.8:27b", supports_thinking=True),
        ModelInfo("llama3.1:8b", supports_thinking=False),
    ]
    response = client.get("/models")
    assert response.status_code == 200
    assert response.json() == [
        {"name": "qwen3.8:27b", "supports_thinking": True, "is_default": True},
        {"name": "llama3.1:8b", "supports_thinking": False, "is_default": False},
    ]
