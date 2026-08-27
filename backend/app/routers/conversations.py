from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy import Engine
from sqlmodel import Session, delete, select

from app.config import get_settings
from app.db import get_engine, get_session
from app.models import Conversation, Message
from app.schemas import (
    ConversationCreateRequest,
    ConversationResponse,
    MessageResponse,
    SendMessageRequest,
)
from app.services.chat_stream import SYSTEM_PROMPT, stream_chat_response
from app.services.ollama_client import OllamaClient, get_ollama_client

router = APIRouter(prefix="/conversations", tags=["conversations"])


def _to_conversation_response(conversation: Conversation) -> ConversationResponse:
    return ConversationResponse(
        id=conversation.id,
        title=conversation.title,
        model=conversation.model,
        created_at=conversation.created_at,
        updated_at=conversation.updated_at,
    )


def _to_message_response(message: Message) -> MessageResponse:
    assert message.id is not None
    return MessageResponse(
        id=message.id,
        conversation_id=message.conversation_id,
        role=message.role,
        content=message.content,
        created_at=message.created_at,
    )


def _get_conversation_or_404(conversation_id: str, session: Session) -> Conversation:
    conversation = session.get(Conversation, conversation_id)
    if conversation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
    return conversation


@router.post("", response_model=ConversationResponse, status_code=status.HTTP_201_CREATED)
def create_conversation(
    payload: ConversationCreateRequest, session: Session = Depends(get_session)
) -> ConversationResponse:
    conversation = Conversation(model=payload.model or get_settings().default_model)
    session.add(conversation)
    session.commit()
    session.refresh(conversation)
    return _to_conversation_response(conversation)


@router.get("", response_model=list[ConversationResponse])
def list_conversations(session: Session = Depends(get_session)) -> list[ConversationResponse]:
    conversations = session.exec(
        select(Conversation).order_by(Conversation.updated_at.desc())  # type: ignore[attr-defined]
    ).all()
    return [_to_conversation_response(c) for c in conversations]


@router.get("/{conversation_id}/messages", response_model=list[MessageResponse])
def get_messages(
    conversation_id: str, session: Session = Depends(get_session)
) -> list[MessageResponse]:
    _get_conversation_or_404(conversation_id, session)
    messages = session.exec(
        select(Message).where(Message.conversation_id == conversation_id).order_by(Message.id)  # type: ignore[arg-type]
    ).all()
    return [_to_message_response(m) for m in messages]


@router.delete("/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_conversation(conversation_id: str, session: Session = Depends(get_session)) -> None:
    conversation = _get_conversation_or_404(conversation_id, session)
    # Events/messages deleted first/explicitly rather than relying on cascade behavior that isn't
    # configured on the model -- same pattern as agent-ops-dashboard's delete_run.
    session.exec(delete(Message).where(Message.conversation_id == conversation_id))  # type: ignore[arg-type]
    session.delete(conversation)
    session.commit()


@router.post("/{conversation_id}/messages")
def send_message(
    conversation_id: str,
    payload: SendMessageRequest,
    request: Request,
    session: Session = Depends(get_session),
    engine: Engine = Depends(get_engine),
    ollama: OllamaClient = Depends(get_ollama_client),
) -> StreamingResponse:
    conversation = _get_conversation_or_404(conversation_id, session)

    prior_messages = session.exec(
        select(Message).where(Message.conversation_id == conversation_id).order_by(Message.id)  # type: ignore[arg-type]
    ).all()

    session.add(Message(conversation_id=conversation_id, role="user", content=payload.content))
    if not prior_messages and conversation.title == "New chat":
        # ChatGPT-like auto-title from the first message -- cheap and good enough; no separate
        # summarization call to the model just for a sidebar label.
        conversation.title = payload.content[:60]
    conversation.updated_at = datetime.now(UTC)
    session.add(conversation)
    session.commit()

    history = [{"role": "system", "content": SYSTEM_PROMPT}]
    history += [{"role": m.role, "content": m.content} for m in prior_messages]
    history.append({"role": "user", "content": payload.content})

    return StreamingResponse(
        stream_chat_response(conversation_id, conversation.model, history, ollama, engine, request),
        media_type="text/event-stream",
    )
