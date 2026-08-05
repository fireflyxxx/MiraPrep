import { aiStreamUrl } from "./endpoints";
import type { InterviewStreamEvent } from "./interview-stream";

const audioCursorKeyPrefix = "miraprep.interview-audio-cursor.";
const voicePreferenceKeyPrefix = "miraprep.interview-voice-preference.";

export type AsrPartialEvent = {
  type: "asr_partial";
  payload: {
    text: string;
    isFinal: boolean;
    acceptedAudioSeq?: number;
    duplicate?: boolean;
    latencyMs?: number | null;
  };
  seq: number;
};

export type TtsAudioEvent = {
  type: "audio";
  payload: {
    chunk: string;
    format: string;
    forQuestionId?: string | number | null;
    forMessageSeq?: number;
    sentenceIndex?: number;
    frameIndex?: number;
    isFinal: boolean;
    latencyMs?: number;
  };
  seq: number;
};

export type VoiceInterviewEvent =
  | InterviewStreamEvent
  | AsrPartialEvent
  | TtsAudioEvent;

export interface VoiceInterviewSocket {
  sendAudio(chunk: Uint8Array): boolean;
  finishAudio(): boolean;
  confirmTranscript(input: {
    answerId: string;
    text: string;
    questionId?: string | number | null;
  }): boolean;
  setVoice(enabled: boolean): boolean;
  close(): void;
}

export class VoiceSocketCloseError extends Error {
  constructor(
    message: string,
    public readonly code: number,
    public readonly opened: boolean,
  ) {
    super(message);
    this.name = "VoiceSocketCloseError";
  }
}

interface VoiceSocketOptions {
  sessionId: number;
  runtimeToken: string;
  afterSeq: number;
  signal: AbortSignal;
  onEvent: (event: VoiceInterviewEvent) => void;
  onOpen?: (socket: VoiceInterviewSocket) => void;
}

function audioCursorKey(sessionId: number): string {
  return `${audioCursorKeyPrefix}${sessionId}`;
}

function readAudioCursor(sessionId: number): number {
  try {
    const value = Number(window.sessionStorage.getItem(audioCursorKey(sessionId)));
    return Number.isSafeInteger(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

function storeAudioCursor(sessionId: number, value: number): void {
  try {
    window.sessionStorage.setItem(audioCursorKey(sessionId), String(value));
  } catch {
    // 当前连接仍可依靠内存中的序号继续录音。
  }
}

export function clearInterviewAudioCursor(sessionId: number): void {
  try {
    window.sessionStorage.removeItem(audioCursorKey(sessionId));
    window.sessionStorage.removeItem(
      `${voicePreferenceKeyPrefix}${sessionId}`,
    );
  } catch {
    // 清理失败不阻塞离开会话。
  }
}

/** 配置向导勾选的「语音面试」偏好，供面试页进入时决定默认模式。 */
export function storeInterviewVoicePreference(
  sessionId: number,
  enabled: boolean,
): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      `${voicePreferenceKeyPrefix}${sessionId}`,
      enabled ? "1" : "0",
    );
  } catch {
    // 存不下就按文字模式进入，用户仍可手动切换。
  }
}

export function getInterviewVoicePreference(sessionId: number): boolean {
  if (typeof window === "undefined") return false;
  try {
    return (
      window.sessionStorage.getItem(`${voicePreferenceKeyPrefix}${sessionId}`) ===
      "1"
    );
  } catch {
    return false;
  }
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const blockSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += blockSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + blockSize));
  }
  return window.btoa(binary);
}

export function base64ToBytes(value: string): Uint8Array {
  const binary = window.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function websocketUrl(
  sessionId: number,
  runtimeToken: string,
  afterSeq: number,
): string {
  const url = new URL(aiStreamUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = `${url.pathname.replace(/\/$/, "")}/ws/interview/${sessionId}`;
  url.search = new URLSearchParams({
    accessToken: runtimeToken,
    afterSeq: String(afterSeq),
    voice: "true",
  }).toString();
  return url.toString();
}

function isVoiceEvent(value: unknown): value is VoiceInterviewEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as { type?: unknown; payload?: unknown; seq?: unknown };
  return (
    typeof event.type === "string" &&
    !!event.payload &&
    typeof event.payload === "object" &&
    Number.isInteger(event.seq) &&
    Number(event.seq) > 0
  );
}

export function streamVoiceInterview(options: VoiceSocketOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    const websocket = new WebSocket(
      websocketUrl(options.sessionId, options.runtimeToken, options.afterSeq),
    );
    let opened = false;
    let audioSeq = readAudioCursor(options.sessionId);

    const send = (type: string, payload: Record<string, unknown>): boolean => {
      if (websocket.readyState !== WebSocket.OPEN) return false;
      websocket.send(JSON.stringify({ type, payload }));
      return true;
    };

    const controller: VoiceInterviewSocket = {
      sendAudio(chunk) {
        const nextSeq = audioSeq + 1;
        const sent = send("audio", {
          chunk: bytesToBase64(chunk),
          format: "pcm16/16k",
          audioSeq: nextSeq,
        });
        if (sent) {
          audioSeq = nextSeq;
          storeAudioCursor(options.sessionId, audioSeq);
        }
        return sent;
      },
      finishAudio: () => send("audio_end", {}),
      confirmTranscript: (input) => send("asr_confirm", input),
      setVoice: (enabled) => send("voice", { enabled }),
      close: () => websocket.close(1000, "client mode change"),
    };

    const abort = () => websocket.close(1000, "client abort");
    options.signal.addEventListener("abort", abort, { once: true });

    websocket.addEventListener("open", () => {
      opened = true;
      options.onOpen?.(controller);
    });
    websocket.addEventListener("message", (message) => {
      try {
        const event: unknown = JSON.parse(String(message.data));
        if (!isVoiceEvent(event)) return;
        if (event.type === "asr_partial" && event.payload.acceptedAudioSeq) {
          audioSeq = Math.max(audioSeq, event.payload.acceptedAudioSeq);
          storeAudioCursor(options.sessionId, audioSeq);
        }
        if (
          event.type === "error" &&
          "expectedAudioSeq" in event.payload &&
          typeof event.payload.expectedAudioSeq === "number"
        ) {
          audioSeq = Math.max(0, event.payload.expectedAudioSeq - 1);
          storeAudioCursor(options.sessionId, audioSeq);
        }
        options.onEvent(event);
      } catch {
        // 丢弃无法解析的单帧；连接仍可继续接收后续事件。
      }
    });
    // WebSocket 的 error 事件没有关闭码；等待紧随其后的 close，才能区分
    // 临时网络故障与服务端明确的“提供商未配置”(1013)。
    websocket.addEventListener("error", () => {});
    websocket.addEventListener("close", (event) => {
      options.signal.removeEventListener("abort", abort);
      if (options.signal.aborted || event.code === 1000) {
        resolve();
      } else {
        reject(
          new VoiceSocketCloseError(
            event.reason || `语音连接已关闭（${event.code}）`,
            event.code,
            opened,
          ),
        );
      }
    });
  });
}
