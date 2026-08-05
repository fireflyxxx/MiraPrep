from __future__ import annotations

from app.config import Settings
from app.services.asr.base import AsrProvider, SpeechProviderConfigurationError
from app.services.asr.deepgram import DeepgramAsrProvider
from app.services.tts.base import TtsProvider
from app.services.tts.openai import OpenAiTtsProvider


def build_asr_provider(settings: Settings) -> AsrProvider:
    provider = settings.asr_provider.strip().lower()
    if provider == "deepgram":
        if settings.deepgram_api_key is None:
            raise SpeechProviderConfigurationError(
                "DEEPGRAM_API_KEY is required when ASR_PROVIDER=deepgram"
            )
        return DeepgramAsrProvider(
            api_key=settings.deepgram_api_key.get_secret_value(),
            model=settings.deepgram_asr_model,
            language=settings.deepgram_asr_language,
            endpoint=settings.deepgram_asr_endpoint,
        )
    raise SpeechProviderConfigurationError(f"unsupported ASR_PROVIDER: {settings.asr_provider}")


def build_tts_provider(settings: Settings) -> TtsProvider | None:
    provider = settings.tts_provider.strip().lower()
    if provider in {"", "not-configured", "disabled", "none"}:
        return None
    if provider == "openai":
        if settings.openai_api_key is None:
            raise SpeechProviderConfigurationError(
                "OPENAI_API_KEY is required when TTS_PROVIDER=openai"
            )
        return OpenAiTtsProvider(
            api_key=settings.openai_api_key.get_secret_value(),
            model=settings.openai_tts_model,
            voice=settings.openai_tts_voice,
            base_url=settings.openai_base_url,
        )
    raise SpeechProviderConfigurationError(f"unsupported TTS_PROVIDER: {settings.tts_provider}")
