from sqlmodel import Session, select

from app.models import Conversation, Message
from app.services.chat_stream import stream_chat_response
from app.services.ollama_client import ChatChunk
from tests.fakes import FakeOllamaClient


class _NeverDisconnectedRequest:
    """Duck-types just the one method stream_chat_response actually calls on a real Request --
    always reports "still connected" so the test can drive the abrupt-cancellation path itself
    (via generator.aclose()) rather than the polled disconnect check."""

    async def is_disconnected(self) -> bool:
        return False


async def test_partial_response_is_persisted_when_the_generator_is_closed_mid_stream(
    session: Session, test_engine
) -> None:
    # Regression test for a real, live-caught bug: aborting the client mid-stream (the Stop
    # button) causes the ASGI server to cancel this generator outright -- it doesn't just make
    # is_disconnected() return True on the next poll. The cancellation raises inside the `async
    # for` loop itself, which isn't an httpx.HTTPError, so it wasn't caught, and propagated
    # straight out of the generator -- skipping the persistence code entirely. A live client-
    # aborted stream left only the user's message saved; the assistant's real, partially-
    # generated reply was silently dropped. generator.aclose() (GeneratorExit) simulates that
    # abrupt teardown here -- a different exception type than the real asyncio.CancelledError,
    # but the fix (persistence moved into a `finally`) doesn't care which one triggered it.
    conversation = Conversation(model="qwen2.5-coder:7b")
    session.add(conversation)
    session.commit()
    session.refresh(conversation)

    ollama = FakeOllamaClient(
        chunks=[
            ChatChunk(content="Hello"),
            ChatChunk(content=" there"),
            ChatChunk(content=" friend"),
        ]
    )

    generator = stream_chat_response(
        conversation.id,
        conversation.model,
        [{"role": "user", "content": "hi"}],
        ollama,
        test_engine,
        _NeverDisconnectedRequest(),  # type: ignore[arg-type]
    )

    await generator.__anext__()  # "Hello"
    await generator.__anext__()  # " there"
    await generator.aclose()  # abrupt disconnect before " friend" or the done/persist tail

    messages = session.exec(select(Message).where(Message.conversation_id == conversation.id)).all()
    assert len(messages) == 1
    assert messages[0].role == "assistant"
    assert messages[0].content == "Hello there"


async def test_full_response_is_persisted_on_normal_completion(
    session: Session, test_engine
) -> None:
    conversation = Conversation(model="qwen2.5-coder:7b")
    session.add(conversation)
    session.commit()
    session.refresh(conversation)

    ollama = FakeOllamaClient(
        chunks=[
            ChatChunk(content="Hi"),
            ChatChunk(content="!", done=True, eval_count=5, eval_duration=1_000_000_000),
        ]
    )

    events = [
        event
        async for event in stream_chat_response(
            conversation.id,
            conversation.model,
            [{"role": "user", "content": "hi"}],
            ollama,
            test_engine,
            _NeverDisconnectedRequest(),  # type: ignore[arg-type]
        )
    ]

    assert "event: done" in "".join(events)
    messages = session.exec(select(Message).where(Message.conversation_id == conversation.id)).all()
    assert len(messages) == 1
    assert messages[0].content == "Hi!"
