"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { AudioRecorder, AudioRecorderStatus } from "@/lib/audio-recorder";
import { VoiceClient, VoiceClientStatus, VoiceResponse } from "@/lib/voice-client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Transcript {
  role: "user" | "assistant";
  text: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const buf = new ArrayBuffer(binary.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < binary.length; i++) {
    view[i] = binary.charCodeAt(i);
  }
  return buf;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function VoiceAgent() {
  // --- state ---
  const [recStatus, setRecStatus] = useState<AudioRecorderStatus>("idle");
  const [wsStatus, setWsStatus] = useState<VoiceClientStatus>("disconnected");
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- refs (stable across renders) ---
  const recorderRef = useRef<AudioRecorder | null>(null);
  const clientRef = useRef<VoiceClient | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  // ---- play TTS audio (defined first so handleResponse can use it) ----
  const playAudio = useCallback((b64: string) => {
    try {
      const arrayBuffer = base64ToArrayBuffer(b64);

      // AudioContext must be created/resumed from a user gesture.
      // The first mic click initialises it; subsequent calls reuse it.
      const ctx = audioCtxRef.current;
      if (!ctx) {
        // No AudioContext available — skip audio, text is already displayed
        return;
      }

      // Safari / older Chrome may need resume()
      if (ctx.state === "suspended") {
        ctx.resume();
      }

      ctx.decodeAudioData(arrayBuffer.slice(0), (buffer) => {
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        setIsSpeaking(true);
        source.start(0);
        source.onended = () => setIsSpeaking(false);
      }, () => {
        // decode error — just show text, that's fine
      });
    } catch {
      // If audio playback fails, we still have the text
    }
  }, []);

  // ---- handle server response (defined after playAudio) ----
  const handleResponse = useCallback((resp: VoiceResponse) => {
    if (resp.error) {
      setError(resp.error);
      return;
    }

    if (resp.transcript) {
      setTranscripts((prev) => [...prev, { role: "user", text: resp.transcript! }]);
    }

    if (resp.text_response) {
      setTranscripts((prev) => [...prev, { role: "assistant", text: resp.text_response! }]);

      // Play audio if present
      if (resp.audio_base64) {
        playAudio(resp.audio_base64);
      }
    }
  }, [playAudio]);

  // ---- auto-scroll ----
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcripts]);

  // ---- initialise recorder + WS once ----
  useEffect(() => {
    // Recorder
    const recorder = new AudioRecorder({
      onStatusChange: (s) => {
        setRecStatus(s);
        if (s === "error") setError("Microphone issue detected");
      },
      onDataAvailable: (b64) => {
        clientRef.current?.sendAudio(b64);
      },
      onError: (e) => setError(e),
    });
    recorderRef.current = recorder;

    // WS Client — derive URL from current page so it works on any host/port
    const protocol = typeof window !== "undefined" && window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = typeof window !== "undefined" ? window.location.hostname : "localhost";
    const wsPort = "8000"; // backend default port
    const wsUrl = `${protocol}//${host}:${wsPort}/ws/voice`;

    const client = new VoiceClient(wsUrl, {
      onStatusChange: (s) => setWsStatus(s),
      onResponse: handleResponse,
      onError: (e) => setError(e),
    });
    clientRef.current = client;
    client.connect();

    return () => {
      recorder.destroy();
      client.disconnect();
      audioCtxRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- toggle mic ----
  const toggleMic = useCallback(() => {
    setError(null);

    // Create AudioContext on first user gesture (browser requirement)
    if (!audioCtxRef.current) {
      try {
        const ctx = new AudioContext();
        audioCtxRef.current = ctx;
      } catch {
        // Audio not available — still works with text
      }
    } else if (audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume();
    }

    recorderRef.current?.toggle();
  }, []);

  // ---- status helpers ----
  const isListening = recStatus === "recording";
  const isConnected = wsStatus === "connected";
  const isProcessing = recStatus === "processing" || isSpeaking;

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-white rounded-2xl border border-zinc-800 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div
            className={`w-3 h-3 rounded-full ${
              isConnected ? "bg-emerald-500" : "bg-zinc-600"
            }`}
          />
          <h2 className="text-lg font-semibold">Voice Agent</h2>
        </div>
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <span>{isConnected ? "Connected" : "Connecting..."}</span>
          {isProcessing && (
            <span className="flex items-center gap-1">
              <span className="animate-pulse">●</span> Processing
            </span>
          )}
        </div>
      </div>

      {/* Transcript area */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 min-h-0">
        {transcripts.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-zinc-600">
            <MicIcon className="w-12 h-12 mb-4 opacity-30" />
            <p className="text-lg font-medium">Tap the mic to start</p>
            <p className="text-sm mt-1">
              Ask about leads, sales, pricing, or support
            </p>
          </div>
        )}

        {transcripts.map((t, idx) => (
          <div
            key={idx}
            className={`flex ${t.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                t.role === "user"
                  ? "bg-indigo-600 text-white rounded-br-md"
                  : "bg-zinc-800 text-zinc-200 rounded-bl-md"
              }`}
            >
              <div className="flex items-center gap-2 mb-1 text-xs opacity-60">
                {t.role === "user" ? "You" : "Voice Agent"}
              </div>
              {t.text}
            </div>
          </div>
        ))}
        <div ref={transcriptEndRef} />
      </div>

      {/* Error */}
      {error && (
        <div className="mx-6 mb-2 px-4 py-2 bg-red-900/40 border border-red-800 rounded-lg text-sm text-red-300">
          ⚠ {error}
          <button
            className="ml-2 underline hover:text-red-100"
            onClick={() => setError(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Controls */}
      <div className="border-t border-zinc-800 px-6 py-5 flex items-center justify-center gap-6">
        {/* Mic button */}
        <button
          onClick={toggleMic}
          disabled={!isConnected}
          className={`relative p-4 rounded-full transition-all duration-200 ${
            isListening
              ? "bg-red-600 scale-110 shadow-lg shadow-red-600/30"
              : "bg-zinc-800 hover:bg-zinc-700"
          } disabled:opacity-40 disabled:cursor-not-allowed`}
          title={isListening ? "Stop recording" : "Start recording"}
          aria-label={isListening ? "Stop recording" : "Start recording"}
        >
          <MicIcon
            className={`w-6 h-6 ${isListening ? "text-white" : "text-zinc-400"}`}
          />

          {/* Pulse ring when listening */}
          {isListening && (
            <>
              <span className="absolute inset-0 rounded-full animate-ping bg-red-500/20" />
              <span className="absolute inset-0 rounded-full animate-pulse bg-red-500/10" />
            </>
          )}
        </button>

        {/* Status text */}
        <div className="text-center min-w-[120px]">
          <div className="text-sm font-medium">
            {isListening
              ? "Listening..."
              : isProcessing
                ? "Processing..."
                : isConnected
                  ? "Ready"
                  : "Offline"}
          </div>
          <div className="text-xs text-zinc-600 mt-0.5">
            {isListening
              ? "Tap again to send"
              : "Tap the mic to speak"}
          </div>
        </div>

        {/* Clear button */}
        <button
          onClick={() => setTranscripts([])}
          disabled={transcripts.length === 0}
          className="p-3 bg-zinc-800 hover:bg-zinc-700 rounded-full disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Clear conversation"
          aria-label="Clear conversation"
        >
          <TrashIcon className="w-5 h-5 text-zinc-400" />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Simple SVG Icons (no external dependency needed)
// ---------------------------------------------------------------------------

function MicIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    </svg>
  );
}

