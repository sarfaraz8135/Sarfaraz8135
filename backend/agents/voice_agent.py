"""
Voice Agent — a conversational AI agent that can process spoken input,
route to commerce sub-agents, and respond with synthesized speech.

Designed to work via WebSocket for streaming interactions.
"""

from typing import Dict, Any, Optional
from enum import Enum

from backend.agents.base import BaseAgent, AgentManager
from backend.services.speech import (
    transcribe_audio,
    synthesize_speech,
    STTEngine,
    TTSEngine,
)


class VoiceState(str, Enum):
    LISTENING = "listening"
    PROCESSING = "processing"
    SPEAKING = "speaking"
    IDLE = "idle"


class VoiceAgent(BaseAgent):
    """
    A voice-first conversational agent.

    Flow:
      1. Receive audio chunk from client
      2. STT → text
      3. Route intent to the appropriate commerce agent
      4. Compose final response
      5. TTS → audio chunk sent back to client
    """

    def __init__(self):
        super().__init__(name="Voice", role="Voice-enabled conversational interface")
        self._agent_manager = AgentManager()
        self._state = VoiceState.IDLE
        self._voice_id: str = "alloy"         # TTS voice
        self._stt_engine: STTEngine = STTEngine.STUB
        self._tts_engine: TTSEngine = TTSEngine.STUB
        self._conversation_history: list[dict] = []

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    @property
    def state(self) -> VoiceState:
        return self._state

    def configure(self, *, stt_engine: str | None = None, tts_engine: str | None = None, voice_id: str | None = None):
        """Update engine preferences at runtime."""
        if stt_engine:
            self._stt_engine = STTEngine(stt_engine)
        if tts_engine:
            self._tts_engine = TTSEngine(tts_engine)
        if voice_id:
            self._voice_id = voice_id

    async def process(self, context: Dict[str, Any], input_data: str) -> str:
        """
        Text-based fallback — same as other agents.
        Usually you'd call `process_audio` instead.
        """
        self._state = VoiceState.PROCESSING
        # Route to the right sub-agent based on intent
        agent_type = context.get("agent", "support")
        response = await self._agent_manager.route_request(agent_type, context, input_data)

        self._append_to_history("user", input_data)
        self._append_to_history("assistant", response)
        self._state = VoiceState.IDLE
        return response

    async def process_audio(
        self,
        audio_bytes: bytes,
        context: Optional[Dict[str, Any]] = None,
    ) -> dict:
        """
        Full voice-in / voice-out pipeline.

        Returns a dict with:
          - transcript:  the recognised text
          - text_response: the AI reply (text)
          - audio_base64:  base64-encoded TTS audio
          - state:        the agent state after processing
        """
        context = context or {}

        # 1. STT
        self._state = VoiceState.LISTENING
        transcript = await transcribe_audio(audio_bytes, engine=self._stt_engine)

        # 2. Route to sub-agent
        self._state = VoiceState.PROCESSING
        agent_type = context.get("agent", self._infer_intent(transcript))
        text_response = await self._agent_manager.route_request(
            agent_type, context, transcript
        )

        # 3. Compose & TTS
        self._state = VoiceState.SPEAKING
        audio_bytes = await synthesize_speech(text_response, engine=self._tts_engine, voice=self._voice_id)

        # 4. Store history
        self._append_to_history("user", transcript)
        self._append_to_history("assistant", text_response)

        self._state = VoiceState.IDLE

        from backend.services.speech import audio_to_base64
        return {
            "transcript": transcript,
            "text_response": text_response,
            "audio_base64": audio_to_base64(audio_bytes),
            "state": self._state.value,
        }

    async def text_to_speech_only(self, text: str) -> dict:
        """Convenience: TTS without the STT step."""
        audio_bytes = await synthesize_speech(text, engine=self._tts_engine, voice=self._voice_id)
        from backend.services.speech import audio_to_base64
        return {
            "text": text,
            "audio_base64": audio_to_base64(audio_bytes),
        }

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------

    def _infer_intent(self, text: str) -> str:
        """Simple keyword-based intent routing (can be upgraded to LLM later)."""
        lower = text.lower()
        if any(w in lower for w in ("lead", "find", "research", "scout", "target", "company")):
            return "scout"
        if any(w in lower for w in ("buy", "price", "purchase", "product", "cost", "sell")):
            return "sales"
        return "support"

    def _append_to_history(self, role: str, content: str):
        self._conversation_history.append({"role": role, "content": content})
        # Keep last 20 turns
        if len(self._conversation_history) > 20:
            self._conversation_history = self._conversation_history[-20:]

    async def get_history(self) -> list[dict]:
        return list(self._conversation_history)

    async def clear_history(self):
        self._conversation_history.clear()
