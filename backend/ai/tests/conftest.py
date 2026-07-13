import os

os.environ.update(
    {
        "ANTHROPIC_API_KEY": "test-api-key",
        "ANTHROPIC_MODEL": "claude-sonnet-5",
        "BUSINESS_CALLBACK_URL": "http://business.test/api/v1/internal",
        "INTERNAL_TOKEN": "test-internal-token",
        "REDIS_HOST": "localhost",
        "REDIS_PORT": "6379",
        "ASR_PROVIDER": "not-configured",
        "TTS_PROVIDER": "not-configured",
        "CORS_ORIGINS": "http://localhost:3000",
    }
)
