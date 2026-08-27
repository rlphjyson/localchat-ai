from fastapi.testclient import TestClient

from tests.fakes import FakeOllamaClient


def test_list_models_returns_the_ollama_clients_models(
    client: TestClient, fake_ollama: FakeOllamaClient
) -> None:
    fake_ollama.models = ["qwen2.5-coder:7b", "llama3.1:8b"]
    response = client.get("/models")
    assert response.status_code == 200
    assert response.json() == ["qwen2.5-coder:7b", "llama3.1:8b"]
