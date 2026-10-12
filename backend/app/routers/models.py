from fastapi import APIRouter, Depends

from app.config import get_settings
from app.schemas import ModelResponse
from app.services.ollama_client import OllamaClient, get_ollama_client

router = APIRouter(prefix="/models", tags=["models"])


@router.get("", response_model=list[ModelResponse])
async def list_models(ollama: OllamaClient = Depends(get_ollama_client)) -> list[ModelResponse]:
    # is_default lets the new-chat page resolve its "Default model" option to a real model's
    # capabilities without separately knowing the backend's configured default.
    default_model = get_settings().default_model
    return [
        ModelResponse(
            name=m.name, supports_thinking=m.supports_thinking, is_default=m.name == default_model
        )
        for m in await ollama.list_models()
    ]
