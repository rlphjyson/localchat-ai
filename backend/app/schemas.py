from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class ConversationCreateRequest(BaseModel):
    model: str | None = None  # falls back to Settings.default_model if omitted


class ConversationResponse(BaseModel):
    id: str
    title: str
    model: str
    created_at: datetime
    updated_at: datetime


class MessageResponse(BaseModel):
    id: int
    conversation_id: str
    role: str
    content: str
    thinking: str
    created_at: datetime


class SendMessageRequest(BaseModel):
    content: str = Field(min_length=1)
    # "off" by default, so a client that predates reasoning support keeps getting direct replies.
    # Only send a level for a model GET /models reports as supports_thinking -- Ollama rejects
    # one for any other model.
    effort: Literal["off", "low", "medium", "high"] = "off"


class ModelResponse(BaseModel):
    name: str
    supports_thinking: bool
    is_default: bool
