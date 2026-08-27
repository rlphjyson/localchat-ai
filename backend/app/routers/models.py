from fastapi import APIRouter, Depends

from app.services.ollama_client import OllamaClient, get_ollama_client

router = APIRouter(prefix="/models", tags=["models"])


@router.get("", response_model=list[str])
async def list_models(ollama: OllamaClient = Depends(get_ollama_client)) -> list[str]:
    return await ollama.list_models()
