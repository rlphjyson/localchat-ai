from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./data/localchat.db"
    cors_origins: str = "http://localhost:3000"

    ollama_base_url: str = "http://localhost:11434"
    default_model: str = "qwen2.5-coder:7b"
    # Generous but bounded -- a local model on modest hardware can be slow; this is a "the model
    # or Ollama itself is genuinely stuck" backstop, not a normal-latency budget.
    ollama_timeout_seconds: float = 120.0

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
