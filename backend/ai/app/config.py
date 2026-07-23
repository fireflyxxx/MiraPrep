from functools import lru_cache

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration loaded from environment variables or a local .env file."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    anthropic_api_key: SecretStr
    anthropic_model: str = "claude-sonnet-5"
    anthropic_grading_model: str = "claude-opus-4-8"
    grading_worker_count: int = Field(default=2, ge=1, le=8)
    grading_max_delivery_attempts: int = Field(default=5, ge=1, le=100)
    anthropic_base_url: str | None = None
    anthropic_max_tokens: int = 4096
    business_callback_url: str
    internal_token: SecretStr
    redis_host: str = "localhost"
    redis_port: int = 6379
    asr_provider: str = "not-configured"
    tts_provider: str = "not-configured"
    cors_origins: str = "http://localhost:3000"

    @property
    def allowed_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
