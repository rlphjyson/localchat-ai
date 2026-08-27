from fastapi.testclient import TestClient

from tests.fakes import FakeOllamaClient


def test_health_reports_ollama_reachable(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "ollama_reachable": True}


def test_health_reports_ollama_unreachable(client: TestClient, fake_ollama: FakeOllamaClient) -> None:
    fake_ollama.healthy = False
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "ollama_reachable": False}
