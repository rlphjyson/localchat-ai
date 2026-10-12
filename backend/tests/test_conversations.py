from fastapi.testclient import TestClient

from app.services.ollama_client import ChatChunk
from tests.fakes import FakeOllamaClient


def test_create_conversation_uses_default_model_when_none_given(client: TestClient) -> None:
    response = client.post("/conversations", json={})
    assert response.status_code == 201
    body = response.json()
    assert body["model"] == "qwen3.8:27b"
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


def test_get_conversation_returns_it(client: TestClient) -> None:
    created = client.post("/conversations", json={"model": "llama3.1:8b"}).json()
    response = client.get(f"/conversations/{created['id']}")
    assert response.status_code == 200
    assert response.json()["model"] == "llama3.1:8b"


def test_get_conversation_404s_for_unknown_id(client: TestClient) -> None:
    assert client.get("/conversations/does-not-exist").status_code == 404


def test_send_message_defaults_to_reasoning_off(
    client: TestClient, fake_ollama: FakeOllamaClient
) -> None:
    conversation_id = client.post("/conversations", json={}).json()["id"]
    client.post(f"/conversations/{conversation_id}/messages", json={"content": "hi"})
    assert fake_ollama.received_think is False


def test_send_message_passes_the_effort_level_through_as_think(
    client: TestClient, fake_ollama: FakeOllamaClient
) -> None:
    conversation_id = client.post("/conversations", json={}).json()["id"]
    client.post(
        f"/conversations/{conversation_id}/messages", json={"content": "hi", "effort": "medium"}
    )
    assert fake_ollama.received_think == "medium"


def test_send_message_rejects_an_unknown_effort_level(client: TestClient) -> None:
    conversation_id = client.post("/conversations", json={}).json()["id"]
    response = client.post(
        f"/conversations/{conversation_id}/messages", json={"content": "hi", "effort": "max"}
    )
    assert response.status_code == 422


def test_send_message_streams_and_persists_thinking_but_never_sends_it_back(
    client: TestClient, fake_ollama: FakeOllamaClient
) -> None:
    fake_ollama.chunks = [
        ChatChunk(content="", thinking="Reasoning..."),
        ChatChunk(content="Answer", done=True),
    ]
    conversation_id = client.post("/conversations", json={}).json()["id"]

    response = client.post(
        f"/conversations/{conversation_id}/messages", json={"content": "first", "effort": "low"}
    )
    assert "event: thinking" in response.text
    messages = client.get(f"/conversations/{conversation_id}/messages").json()
    assert [(m["role"], m["thinking"]) for m in messages] == [
        ("user", ""),
        ("assistant", "Reasoning..."),
    ]

    client.post(f"/conversations/{conversation_id}/messages", json={"content": "second"})
    assert fake_ollama.received_messages is not None
    assert {"role": "assistant", "content": "Answer"} in fake_ollama.received_messages
    assert all("Reasoning" not in m["content"] for m in fake_ollama.received_messages)


def test_send_message_leaves_a_reasoning_only_reply_out_of_the_history(
    client: TestClient, fake_ollama: FakeOllamaClient
) -> None:
    # A reply stopped mid-reasoning is persisted with thinking but no content.
    fake_ollama.chunks = [ChatChunk(content="", thinking="Still thinking")]
    conversation_id = client.post("/conversations", json={}).json()["id"]
    client.post(f"/conversations/{conversation_id}/messages", json={"content": "first"})

    fake_ollama.chunks = [ChatChunk(content="ok", done=True)]
    client.post(f"/conversations/{conversation_id}/messages", json={"content": "second"})

    assert fake_ollama.received_messages is not None
    assert [m["role"] for m in fake_ollama.received_messages] == ["system", "user", "user"]
