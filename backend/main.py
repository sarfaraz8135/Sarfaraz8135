import json
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from typing import List, Optional

app = FastAPI(
    title="Autonomous AI Commerce API",
    description="Backend API for the autonomous commerce platform",
    version="1.0.0"
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins in development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: str):
        for connection in self.active_connections:
            await connection.send_text(message)

manager = ConnectionManager()

@app.get("/")
async def root():
    return {"message": "Welcome to the Autonomous AI Commerce API"}

@app.get("/api/health")
async def health_check():
    return {"status": "healthy"}

@app.websocket("/ws/chat")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            # Here we would route to the AI Agent Manager
            await manager.broadcast(f"AI Agent received: {data}")
    except WebSocketDisconnect:
        manager.disconnect(websocket)

# ------------------------------------------------------------------
# Voice Agent — singleton shared across routes
# ------------------------------------------------------------------
from agents.base import AgentManager
from services.speech import synthesize_speech, transcribe_audio, STTEngine, TTSEngine, audio_to_base64

_agent_manager: AgentManager | None = None


def get_agent_manager() -> AgentManager:
    global _agent_manager
    if _agent_manager is None:
        _agent_manager = AgentManager()
    return _agent_manager


# ------------------------------------------------------------------
# Voice REST endpoints
# ------------------------------------------------------------------

@app.post("/api/voice/transcribe")
async def voice_transcribe(file: UploadFile = File(...)):
    """Upload an audio file and get its transcription."""
    audio_bytes = await file.read()
    text = await transcribe_audio(audio_bytes)
    return {"transcript": text}


@app.post("/api/voice/synthesize")
async def voice_synthesize(text: str, voice: Optional[str] = "alloy"):
    """Synthesize speech from text and return audio bytes."""
    audio = await synthesize_speech(text, voice=voice)
    return Response(content=audio, media_type="audio/wav")


@app.post("/api/voice/process")
async def voice_process(file: UploadFile = File(...), agent: Optional[str] = "auto"):
    """
    Full voice pipeline: transcribe → AI process → TTS response.
    Returns JSON with transcript, text_response, and audio_base64.
    """
    audio_bytes = await file.read()
    mgr = get_agent_manager()
    voice_agent = mgr.get_voice_agent()
    context = {"agent": agent} if agent != "auto" else {}
    result = await voice_agent.process_audio(audio_bytes, context)
    return result


@app.post("/api/voice/tts")
async def voice_tts(text: str, voice: Optional[str] = "alloy"):
    """Simple TTS — returns base64 audio."""
    audio = await synthesize_speech(text, voice=voice)
    return {"audio_base64": audio_to_base64(audio)}


@app.get("/api/voice/history")
async def voice_history():
    """Get the current VoiceAgent conversation history."""
    mgr = get_agent_manager()
    return {"history": await mgr.get_voice_agent().get_history()}


@app.post("/api/voice/clear")
async def voice_clear():
    """Clear VoiceAgent conversation history."""
    mgr = get_agent_manager()
    await mgr.get_voice_agent().clear_history()
    return {"status": "history cleared"}


# ------------------------------------------------------------------
# Voice WebSocket — streaming audio interaction
# ------------------------------------------------------------------

@app.websocket("/ws/voice")
async def voice_websocket(websocket: WebSocket):
    await manager.connect(websocket)
    mgr = get_agent_manager()
    voice_agent = mgr.get_voice_agent()

    try:
        while True:
            # Receive a JSON message with audio payload
            data = await websocket.receive_text()
            msg = json.loads(data)
            action = msg.get("action", "process_audio")

            if action == "configure":
                voice_agent.configure(
                    stt_engine=msg.get("stt_engine"),
                    tts_engine=msg.get("tts_engine"),
                    voice_id=msg.get("voice_id"),
                )
                await websocket.send_text(json.dumps({"status": "configured"}))

            elif action == "process_audio":
                import base64
                audio_b64 = msg.get("audio_base64", "")
                if not audio_b64:
                    await websocket.send_text(json.dumps({
                        "error": "Missing audio_base64 field",
                        "state": voice_agent.state.value,
                    }))
                    continue

                audio_bytes = base64.b64decode(audio_b64)
                context = msg.get("context", {})
                result = await voice_agent.process_audio(audio_bytes, context)
                await websocket.send_text(json.dumps(result))

            elif action == "process_text":
                text = msg.get("text", "")
                context = msg.get("context", {})
                text_response = await voice_agent.process(context, text)

                # Also return TTS audio
                tts_result = await voice_agent.text_to_speech_only(text_response)
                response_data = {
                    "transcript": text,
                    "text_response": text_response,
                    **tts_result,
                    "state": "idle",
                }
                await websocket.send_text(json.dumps(response_data))

            elif action == "ping":
                await websocket.send_text(json.dumps({
                    "pong": True,
                    "state": voice_agent.state.value,
                }))

            else:
                await websocket.send_text(json.dumps({
                    "error": f"Unknown action: {action}",
                }))

    except WebSocketDisconnect:
        manager.disconnect(websocket)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
