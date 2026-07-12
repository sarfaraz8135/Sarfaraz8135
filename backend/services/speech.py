"""
Speech-to-Text and Text-to-Speech services for Voice Agent.
Designed to work with multiple backends (OpenAI Whisper, Google TTS, etc.)
"""

import os
import io
import base64
from typing import Optional
from enum import Enum

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

# Auto-detect from environment — no credentials = stub mode
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
ELEVENLABS_API_KEY = os.environ.get("ELEVENLABS_API_KEY", "")


# ---------------------------------------------------------------------------
# STT Engines
# ---------------------------------------------------------------------------

class STTEngine(str, Enum):
    OPENAI_WHISPER = "openai_whisper"
    STUB = "stub"


class TTSEngine(str, Enum):
    ELEVENLABS = "elevenlabs"
    OPENAI_TTS = "openai_tts"
    STUB = "stub"


# ---------------------------------------------------------------------------
# Speech-to-Text
# ---------------------------------------------------------------------------

async def transcribe_audio(
    audio_bytes: bytes,
    engine: STTEngine = STTEngine.STUB,
    language: str = "en",
) -> str:
    """
    Transcribe raw audio bytes to text.

    When no API key is configured the *stub* engine returns a fake transcript
    so the front-end can still be developed and tested.
    """
    if engine == STTEngine.OPENAI_WHISPER or (
        engine == STTEngine.STUB and OPENAI_API_KEY
    ):
        return await _whisper_stt(audio_bytes, language)

    # Stub – lets the UI work without external services
    # Returns a simulated transcript so the agent pipeline can be tested end-to-end
    return "I need help with finding new leads for my business."


async def _whisper_stt(audio_bytes: bytes, language: str) -> str:
    """Use OpenAI Whisper API."""
    import openai

    client = openai.AsyncOpenAI(api_key=OPENAI_API_KEY)
    transcript = await client.audio.transcriptions.create(
        model="whisper-1",
        file=("audio.webm", io.BytesIO(audio_bytes), "audio/webm"),
        language=language,
    )
    return transcript.text


# ---------------------------------------------------------------------------
# Text-to-Speech
# ---------------------------------------------------------------------------

async def synthesize_speech(
    text: str,
    engine: TTSEngine = TTSEngine.STUB,
    voice: str = "alloy",
) -> bytes:
    """
    Convert text to audio bytes.

    The *stub* engine returns a short silent WAV so the front-end can test
    playback without any external API.
    """
    if engine == TTSEngine.OPENAI_TTS or (
        engine == TTSEngine.STUB and OPENAI_API_KEY
    ):
        return await _openai_tts(text, voice)

    if engine == TTSEngine.ELEVENLABS or (
        engine == TTSEngine.STUB and ELEVENLABS_API_KEY
    ):
        return await _elevenlabs_tts(text, voice)

    # Stub — small valid WAV (silence) so the browser doesn't error
    return _stub_wav()


async def _openai_tts(text: str, voice: str = "alloy") -> bytes:
    """Use OpenAI TTS API."""
    import openai

    client = openai.AsyncOpenAI(api_key=OPENAI_API_KEY)
    response = await client.audio.speech.create(
        model="tts-1",
        voice=voice,
        input=text,
    )
    return response.content


async def _elevenlabs_tts(text: str, voice: str = "default") -> bytes:
    """Use ElevenLabs TTS API."""
    import httpx

    headers = {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
    }
    payload = {
        "text": text,
        "model_id": "eleven_monolingual_v1",
        "voice_settings": {"stability": 0.5, "similarity_boost": 0.5},
    }
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"https://api.elevenlabs.io/v1/text-to-speech/{voice}",
            headers=headers,
            json=payload,
        )
        resp.raise_for_status()
        return resp.content


# ---------------------------------------------------------------------------
# Stub helpers
# ---------------------------------------------------------------------------

def _stub_wav() -> bytes:
    """A minimal valid 16-bit mono 24 kHz WAV header + 0.1 s silence."""
    import struct

    sample_rate = 24000
    bits_per_sample = 16
    num_channels = 1
    num_samples = sample_rate // 10  # 100 ms
    data_size = num_samples * num_channels * (bits_per_sample // 8)

    buf = io.BytesIO()
    buf.write(b"RIFF")
    buf.write(struct.pack("<I", 36 + data_size))
    buf.write(b"WAVE")
    buf.write(b"fmt ")
    buf.write(struct.pack("<I", 16))  # chunk size
    buf.write(struct.pack("<H", 1))  # PCM
    buf.write(struct.pack("<H", num_channels))
    buf.write(struct.pack("<I", sample_rate))
    buf.write(struct.pack("<I", sample_rate * num_channels * bits_per_sample // 8))
    buf.write(struct.pack("<H", num_channels * bits_per_sample // 8))
    buf.write(struct.pack("<H", bits_per_sample))
    buf.write(b"data")
    buf.write(struct.pack("<I", data_size))
    # Write silence
    buf.write(b"\x00" * data_size)
    return buf.getvalue()


# ---------------------------------------------------------------------------
# Encodings helpers
# ---------------------------------------------------------------------------

def audio_to_base64(audio_bytes: bytes) -> str:
    return base64.b64encode(audio_bytes).decode("utf-8")


def base64_to_audio(b64_str: str) -> bytes:
    return base64.b64decode(b64_str)
