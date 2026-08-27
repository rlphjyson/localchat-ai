from fastapi.testclient import TestClient

from tests.fakes import FakeOllamaClient


def test_create_conversation_uses_default_model_when_none_given(client: TestClient) -> None:
    response = client.post("/conversations", json={})
    assert response.status_code == 201
    body = response.json()
    assert body["model"] == "qwen2.5-coder:7b"
    assert body["title"] == "New chat"
    assert body["id"]


def test_create_conversation_with_explicit_model(client: TestClient) -> None:
    response = client.post("/conversations", json={"model": "llama3.1:8b"})
    assert response.status_code == 201
    assert response.json()["model"] == "llama3.1:8b"


def test_list_conversations_ordered_by_updated_at_desc(client: TestClient) -> None:
    first = client.post("/conversations", json={}).json()
    second = client.post("/conversations", json={}).json()

    response = client.get("/conversations")
    ids = [c["id"] for c in response.json()]
    assert ids == [second["id"], first["id"]]


def test_get_messages_404s_for_unknown_conversation(client: TestClient) -> None:
    response = client.get("/conversations/does-not-exist/messages")
    assert response.status_code == 404


def test_delete_conversation_removes_it_and_its_messages(
    client: TestClient, fake_ollama: FakeOllamaClient
) -> None:
    conversation_id = client.post("/conversations", json={}).json()["id"]
    client.post(f"/conversations/{conversation_id}/messages", json={"content": "hi"})

    response = client.delete(f"/conversations/{conversation_id}")
    assert response.status_code == 204
    assert client.get(f"/conversations/{conversation_id}/messages").status_code == 404
    assert conversation_id not in [c["id"] for c in client.get("/conversations").json()]


def test_delete_conversation_404s_for_unknown_id(client: TestClient) -> None:
    response = client.delete("/conversations/does-not-exist")
    assert response.status_code == 404


def test_send_message_404s_for_unknown_conversation(client: TestClient) -> None:
    response = client.post("/conversations/does-not-exist/messages", json={"content": "hi"})
    assert response.status_code == 404


def test_send_message_streams_tokens_and_persists_both_messages(
    client: TestClient, fake_ollama: FakeOllamaClient
) -> None:
    conversation_id = client.post("/conversations", json={}).json()["id"]

    response = client.post(f"/conversations/{conversation_id}/messages", json={"content": "hi there"})
    assert response.status_code == 200
    assert "event: token" in response.text
    assert '"text": "Hello"' in response.text
    assert "event: done" in response.text

    messages = client.get(f"/conversations/{conversation_id}/messages").json()
    assert [m["role"] for m in messages] == ["user", "assistant"]
    assert messages[0]["content"] == "hi there"
    assert messages[1]["content"] == "Hello there"


def test_send_message_sets_the_conversation_title_from_the_first_message(
    client: TestClient,
) -> None:
    conversation_id = client.post("/conversations", json={}).json()["id"]
    client.post(f"/conversations/{conversation_id}/messages", json={"content": "explain recursion"})

    conversation = next(c for c in client.get("/conversations").json() if c["id"] == conversation_id)
    assert conversation["title"] == "explain recursion"


def test_send_message_does_not_overwrite_the_title_on_a_later_message(
    client: TestClient,
) -> None:
    conversation_id = client.post("/conversations", json={}).json()["id"]
    client.post(f"/conversations/{conversation_id}/messages", json={"content": "first question"})
    client.post(f"/conversations/{conversation_id}/messages", json={"content": "second question"})

    conversation = next(c for c in client.get("/conversations").json() if c["id"] == conversation_id)
    assert conversation["title"] == "first question"


def test_send_message_includes_system_prompt_and_prior_history(
    client: TestClient, fake_ollama: FakeOllamaClient
) -> None:
    conversation_id = client.post("/conversations", json={}).json()["id"]
    client.post(f"/conversations/{conversation_id}/messages", json={"content": "first"})
    client.post(f"/conversations/{conversation_id}/messages", json={"content": "second"})

    assert fake_ollama.received_messages is not None
    roles = [m["role"] for m in fake_ollama.received_messages]
    assert roles[0] == "system"
    # first user message + first assistant reply + this new user message
    assert roles[1:] == ["user", "assistant", "user"]
    assert fake_ollama.received_messages[-1]["content"] == "second"


def test_send_message_emits_an_error_event_when_ollama_is_unreachable(
    client: TestClient, fake_ollama: FakeOllamaClient
) -> None:
    fake_ollama.raise_error = True
    conversation_id = client.post("/conversations", json={}).json()["id"]

    response = client.post(f"/conversations/{conversation_id}/messages", json={"content": "hi"})
    assert response.status_code == 200
    assert "event: error" in response.text
    assert "Couldn't reach Ollama" in response.text

    # No assistant message persisted since nothing was actually generated.
    messages = client.get(f"/conversations/{conversation_id}/messages").json()
    assert [m["role"] for m in messages] == ["user"]
