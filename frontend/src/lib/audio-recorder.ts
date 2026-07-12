/**
 * Audio Recorder — captures microphone input and converts to base64.
 * Uses the Web Audio API with MediaStream recording.
 */

export type AudioRecorderStatus = "idle" | "recording" | "processing" | "error";

export interface AudioRecorderEvents {
  onStatusChange?: (status: AudioRecorderStatus) => void;
  onDataAvailable?: (base64Audio: string) => void;
  onError?: (error: string) => void;
}

export class AudioRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private _status: AudioRecorderStatus = "idle";
  private events: AudioRecorderEvents = {};
  private mimeType: string;

  constructor(events: AudioRecorderEvents = {}) {
    this.events = events;
    // Prefer webm which is well-supported in modern browsers
    this.mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";
  }

  get status(): AudioRecorderStatus {
    return this._status;
  }

  private setStatus(s: AudioRecorderStatus) {
    this._status = s;
    this.events.onStatusChange?.(s);
  }

  /** Request microphone access and start recording. */
  async start(): Promise<void> {
    try {
      this.chunks = [];
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 24000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType: this.mimeType,
      });

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.chunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = async () => {
        this.stopTracks();
        this.setStatus("processing");

        const blob = new Blob(this.chunks, { type: this.mimeType });
        const base64 = await blobToBase64(blob);
        this.events.onDataAvailable?.(base64);
        this.chunks = [];
        this.setStatus("idle");
      };

      this.mediaRecorder.onerror = () => {
        this.stopTracks();
        this.setStatus("error");
        this.events.onError?.("MediaRecorder error occurred");
      };

      this.mediaRecorder.start();
      this.setStatus("recording");
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "Could not access microphone";
      this.setStatus("error");
      this.events.onError?.(msg);
    }
  }

  /** Stop recording and return the captured audio as base64. */
  stop(): void {
    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      this.mediaRecorder.stop();
    } else {
      this.stopTracks();
      this.setStatus("idle");
    }
  }

  /** Toggle record / stop */
  toggle(): void {
    if (this._status === "recording") {
      this.stop();
    } else {
      this.start();
    }
  }

  private stopTracks(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    this.mediaRecorder = null;
  }

  /** Cleanup */
  destroy(): void {
    this.stopTracks();
    this.chunks = [];
    this.setStatus("idle");
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // Remove the data URL prefix (e.g. "data:audio/webm;codecs=opus;base64,")
      const base64 = result.split(",")[1] ?? result;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("Failed to read blob as base64"));
    reader.readAsDataURL(blob);
  });
}
