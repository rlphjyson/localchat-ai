from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./data/localchat.db"
    cors_origins: str = "http://localhost:3000"

    ollama_base_url: str = "http://localhost:11434"
    default_model: str = "qwen3.8:27b"
    # Generous but bounded -- a local model on modest hardware can be slow; this is a "the model
    # or Ollama itself is genuinely stuck" backstop, not a normal-latency budget. A cold load of
    # the ~17GB default model (split across a 12GB GPU and system RAM) alone takes ~50-65s
    # before the first chunk, plus prompt processing for a long history.
    ollama_timeout_seconds: float = 300.0

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
