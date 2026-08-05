from functools import lru_cache
from urllib.parse import quote

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration loaded from environment variables or a local .env file."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    anthropic_api_key: SecretStr
    anthropic_model: str = "deepseek-v4-flash"
    anthropic_grading_model: str | None = None
    grading_worker_count: int = Field(default=2, ge=1, le=8)
    grading_max_delivery_attempts: int = Field(default=5, ge=1, le=100)
    anthropic_base_url: str | None = "https://api.deepseek.com/anthropic"
    anthropic_max_tokens: int = 4096
    business_callback_url: str
    internal_token: SecretStr
    redis_host: str = "localhost"
    redis_port: int = 6379
    redis_password: SecretStr | None = None
    asr_provider: str = "not-configured"
    tts_provider: str = "not-configured"
    deepgram_api_key: SecretStr | None = None
    deepgram_asr_model: str = "nova-3"
    deepgram_asr_language: str = "zh-CN"
    deepgram_asr_endpoint: str = "wss://api.deepgram.com/v1/listen"
    openai_api_key: SecretStr | None = None
    openai_base_url: str = "https://api.openai.com/v1"
    openai_tts_model: str = "gpt-4o-mini-tts"
    openai_tts_voice: str = "cedar"
    cors_origins: str = "http://localhost:3000"

    @property
    def allowed_origins(self) -> list[str]:
        origins = [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]
        if "*" in origins:
            raise ValueError("CORS_ORIGINS must list explicit origins when credentials are enabled")
        return origins

    @property
    def resolved_grading_model(self) -> str:
        return self.anthropic_grading_model or self.anthropic_model

    @property
    def redis_url(self) -> str:
        password = self.redis_password.get_secret_value() if self.redis_password else ""
        credentials = f":{quote(password, safe='')}@" if password else ""
        return f"redis://{credentials}{self.redis_host}:{self.redis_port}"


@lru_cache
def get_settings() -> Settings:
    return Settings()
