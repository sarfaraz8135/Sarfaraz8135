/**
 * Voice Client — WebSocket client that connects to the backend /ws/voice endpoint.
 * Sends audio chunks and receives transcripts / audio responses.
 */

export interface VoiceMessage {
  action: string;
  [key: string]: unknown;
}

export interface VoiceResponse {
  transcript?: string;
  text_response?: string;
  audio_base64?: string;
  state?: string;
  error?: string;
  status?: string;
  pong?: boolean;
  text?: string;
}

export type VoiceClientStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

export interface VoiceClientEvents {
  onStatusChange?: (status: VoiceClientStatus) => void;
  onResponse?: (resp: VoiceResponse) => void;
  onError?: (error: string) => void;
}

export class VoiceClient {
  private ws: WebSocket | null = null;
  private _status: VoiceClientStatus = "disconnected";
  private events: VoiceClientEvents = {};
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private url: string;

  constructor(
    url: string = `ws://${typeof window !== "undefined" ? window.location.hostname : "localhost"}:8000/ws/voice`,
    events: VoiceClientEvents = {}
  ) {
    this.url = url;
    this.events = events;
  }

  get status(): VoiceClientStatus {
    return this._status;
  }

  private setStatus(s: VoiceClientStatus) {
    this._status = s;
    this.events.onStatusChange?.(s);
  }

  /** Connect to the voice WebSocket endpoint. */
  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    this.setStatus("connecting");

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        this.setStatus("connected");
      };

      this.ws.onmessage = (event) => {
        try {
          const resp: VoiceResponse = JSON.parse(event.data);
          this.events.onResponse?.(resp);
        } catch {
          this.events.onError?.("Failed to parse server response");
        }
      };

      this.ws.onerror = () => {
        this.setStatus("error");
        this.events.onError?.("WebSocket connection error");
      };

      this.ws.onclose = () => {
        this.setStatus("disconnected");
        this.scheduleReconnect();
      };
    } catch {
      this.setStatus("error");
      this.events.onError?.("Failed to create WebSocket");
    }
  }

  /** Send a message to the voice agent. */
  send(msg: VoiceMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else {
      this.events.onError?.("WebSocket not connected");
    }
  }

  /** Send audio base64 for transcription + AI processing. */
  sendAudio(audioBase64: string, context: Record<string, unknown> = {}): void {
    this.send({
      action: "process_audio",
      audio_base64: audioBase64,
      context,
    });
  }

  /** Send text directly to the voice agent. */
  sendText(text: string, context: Record<string, unknown> = {}): void {
    this.send({
      action: "process_text",
      text,
      context,
    });
  }

  /** Configure voice agent settings. */
  configure(config: {
    stt_engine?: string;
    tts_engine?: string;
    voice_id?: string;
  }): void {
    this.send({ action: "configure", ...config });
  }

  /** Ping the server to check connection health. */
  ping(): void {
    this.send({ action: "ping" });
  }

  /** Disconnect the WebSocket. */
  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    this.setStatus("disconnected");
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 3000);
  }
}
