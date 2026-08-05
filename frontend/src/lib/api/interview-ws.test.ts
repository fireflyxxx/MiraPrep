import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  base64ToBytes,
  bytesToBase64,
  getInterviewVoicePreference,
  storeInterviewVoicePreference,
  streamVoiceInterview,
  VoiceSocketCloseError,
  type VoiceInterviewEvent,
  type VoiceInterviewSocket,
} from "./interview-ws";

describe("interview WebSocket audio codec", () => {
  it("round-trips binary PCM without corrupting zero and high bytes", () => {
    const input = new Uint8Array([0, 1, 127, 128, 254, 255]);
    expect(base64ToBytes(bytesToBase64(input))).toEqual(input);
  });

  it("chunks large frames before converting them to a browser binary string", () => {
    const input = new Uint8Array(70_000).map((_, index) => index % 256);
    const spy = vi.spyOn(String, "fromCharCode");
    expect(base64ToBytes(bytesToBase64(input))).toEqual(input);
    expect(spy).toHaveBeenCalledTimes(3);
    spy.mockRestore();
  });
});

type Listener = (event: unknown) => void;

class FakeWebSocket {
  static readonly OPEN = 1;
  static instances: FakeWebSocket[] = [];

  readyState = 0;
  readonly sent: string[] = [];
  private readonly listeners: Record<string, Listener[]> = {};

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: Listener) {
    (this.listeners[type] ??= []).push(listener);
  }

  removeEventListener(type: string, listener: Listener) {
    this.listeners[type] = (this.listeners[type] ?? []).filter(
      (item) => item !== listener,
    );
  }

  send(data: string) {
    this.sent.push(data);
  }

  close(code = 1000, reason = "") {
    this.readyState = 3;
    this.emit("close", { code, reason });
  }

  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.emit("open", {});
  }

  deliver(event: VoiceInterviewEvent) {
    this.emit("message", { data: JSON.stringify(event) });
  }

  get frames() {
    return this.sent.map(
      (raw) => JSON.parse(raw) as { type: string; payload: Record<string, unknown> },
    );
  }

  private emit(type: string, event: unknown) {
    for (const listener of [...(this.listeners[type] ?? [])]) listener(event);
  }
}

function connect(afterSeq = 0) {
  const events: VoiceInterviewEvent[] = [];
  let socket: VoiceInterviewSocket | undefined;
  const controller = new AbortController();
  const settled = streamVoiceInterview({
    sessionId: 42,
    runtimeToken: "runtime-token-at-least-32-characters-long",
    afterSeq,
    signal: controller.signal,
    onEvent: (event) => events.push(event),
    onOpen: (opened) => {
      socket = opened;
    },
  });
  // 未捕获的 rejection 会污染整个测试文件，先挂一个空 catch。
  settled.catch(() => {});
  const transport = FakeWebSocket.instances.at(-1)!;
  transport.open();
  return { controller, events, settled, socket: socket!, transport };
}

describe("streamVoiceInterview", () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    window.sessionStorage.clear();
    vi.stubGlobal("WebSocket", FakeWebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("numbers audio frames consecutively and resumes the cursor on a new socket", () => {
    const first = connect();
    first.socket.sendAudio(new Uint8Array([1, 2]));
    first.socket.sendAudio(new Uint8Array([3, 4]));
    expect(first.transport.frames.map((frame) => frame.payload.audioSeq)).toEqual([1, 2]);
    expect(first.transport.frames[0].payload.format).toBe("pcm16/16k");
    first.transport.close(1000);

    // 重连后必须接着上一条帧的序号，否则服务端会判成序号断层并丢掉这一段录音。
    const second = connect(9);
    second.socket.sendAudio(new Uint8Array([5, 6]));
    expect(second.transport.frames[0].payload.audioSeq).toBe(3);
  });

  it("rewinds the cursor to the gap the server reports so the next frame refills it", () => {
    const { socket, transport } = connect();
    socket.sendAudio(new Uint8Array([1]));
    socket.sendAudio(new Uint8Array([2]));

    transport.deliver({
      type: "error",
      payload: { code: "audio_sequence_gap", message: "gap", expectedAudioSeq: 2 },
      seq: 7,
    } as unknown as VoiceInterviewEvent);
    socket.sendAudio(new Uint8Array([3]));

    expect(transport.frames.map((frame) => frame.payload.audioSeq)).toEqual([1, 2, 2]);
  });

  it("advances the cursor to the sequence the server acknowledged", () => {
    const { socket, transport } = connect();
    transport.deliver({
      type: "asr_partial",
      payload: { text: "在讲项目", isFinal: false, acceptedAudioSeq: 12 },
      seq: 5,
    });
    socket.sendAudio(new Uint8Array([1]));

    expect(transport.frames[0].payload.audioSeq).toBe(13);
  });

  it("drops frames that are not a well-formed envelope", () => {
    const { events, transport } = connect();
    transport.deliver({ type: "asr_partial" } as unknown as VoiceInterviewEvent);
    transport.deliver({
      type: "asr_partial",
      payload: { text: "ok", isFinal: true },
      seq: 4,
    });

    expect(events).toHaveLength(1);
  });

  it("reports the close code so the page can tell a missing provider from a dropped link", async () => {
    const { settled, transport } = connect();
    transport.close(1013, "speech provider is not configured");

    const error = await settled.catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(VoiceSocketCloseError);
    expect(error).toMatchObject({ code: 1013, opened: true });
  });

  it("resolves without an error when the page aborts the session itself", async () => {
    const { controller, settled } = connect();
    controller.abort();
    await expect(settled).resolves.toBeUndefined();
  });
});

describe("interview voice preference", () => {
  beforeEach(() => window.sessionStorage.clear());

  it("survives the hop from the setup wizard to the interview page", () => {
    storeInterviewVoicePreference(42, true);
    expect(getInterviewVoicePreference(42)).toBe(true);
    expect(getInterviewVoicePreference(43)).toBe(false);

    storeInterviewVoicePreference(42, false);
    expect(getInterviewVoicePreference(42)).toBe(false);
  });
});
