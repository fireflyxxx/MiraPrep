import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import VoiceRecorder from "./VoiceRecorder";
import { resampleToPcm16 } from "./VoiceRecorder";

describe("VoiceRecorder PCM conversion", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("downsamples mono float audio to signed little-endian PCM16 at 16 kHz", () => {
    const input = new Float32Array(48_000);
    input.fill(0.5);

    const output = resampleToPcm16(input, 48_000);
    const samples = new DataView(output.buffer);

    expect(output.byteLength).toBe(32_000);
    expect(samples.getInt16(0, true)).toBeCloseTo(16_384, -1);
    expect(samples.getInt16(output.byteLength - 2, true)).toBeCloseTo(16_384, -1);
  });

  it("clips samples outside the legal audio range", () => {
    const output = resampleToPcm16(new Float32Array([-2, 2]), 16_000);
    const samples = new DataView(output.buffer);
    expect(samples.getInt16(0, true)).toBe(-32_768);
    expect(samples.getInt16(2, true)).toBe(32_767);
  });

  it("reports denied microphone permission so the parent can fall back to text", async () => {
    const onError = vi.fn();
    vi.stubGlobal("AudioContext", class {});
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockRejectedValue(
          new DOMException("denied", "NotAllowedError"),
        ),
      },
    });

    render(
      <VoiceRecorder
        onAudioFrame={vi.fn()}
        onRecordingChange={vi.fn()}
        onError={onError}
        onSilence={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "开始录音" }));

    await waitFor(() =>
      expect(onError).toHaveBeenCalledWith(expect.stringContaining("麦克风权限")),
    );
  });
});

/** 把采集管线换成可手动喂样本的替身，AudioWorklet 在 jsdom 里没有实现。 */
function stubCapturePipeline(sampleRate = 16_000) {
  const ports: Array<{ onmessage: ((event: { data: Float32Array }) => void) | null }> = [];
  const stopped: string[] = [];

  vi.stubGlobal(
    "AudioWorkletNode",
    class {
      port: { onmessage: ((event: { data: Float32Array }) => void) | null } = {
        onmessage: null,
      };
      constructor() {
        ports.push(this.port);
      }
      connect() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    "AudioContext",
    class {
      sampleRate = sampleRate;
      destination = {};
      audioWorklet = { addModule: vi.fn().mockResolvedValue(undefined) };
      resume = vi.fn().mockResolvedValue(undefined);
      close = vi.fn().mockResolvedValue(undefined);
      createMediaStreamSource = () => ({ connect() {}, disconnect() {} });
      createGain = () => ({ gain: { value: 1 }, connect() {}, disconnect() {} });
    },
  );
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: vi.fn().mockResolvedValue({
        getTracks: () => [{ stop: () => stopped.push("track") }],
      }),
    },
  });

  return { emit: (samples: Float32Array) => ports.at(-1)?.onmessage?.({ data: samples }), stopped };
}

describe("VoiceRecorder capture", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("batches worklet callbacks into roughly 100ms frames instead of one per 128 samples", async () => {
    const pipeline = stubCapturePipeline();
    const onAudioFrame = vi.fn();
    render(
      <VoiceRecorder
        onAudioFrame={onAudioFrame}
        onRecordingChange={vi.fn()}
        onError={vi.fn()}
        onSilence={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "开始录音" }));
    await screen.findByRole("button", { name: "停止录音" });

    const loud = new Float32Array(800).fill(0.4);
    pipeline.emit(loud);
    expect(onAudioFrame).not.toHaveBeenCalled();

    pipeline.emit(loud);
    expect(onAudioFrame).toHaveBeenCalledTimes(1);
    expect(onAudioFrame.mock.calls[0][0].byteLength).toBe(3_200);
  });

  it("flushes the tail of the recording before the parent finalizes the transcript", async () => {
    const pipeline = stubCapturePipeline();
    const onAudioFrame = vi.fn();
    const onRecordingChange = vi.fn();
    render(
      <VoiceRecorder
        onAudioFrame={onAudioFrame}
        onRecordingChange={onRecordingChange}
        onError={vi.fn()}
        onSilence={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "开始录音" }));
    const stop = await screen.findByRole("button", { name: "停止录音" });

    pipeline.emit(new Float32Array(400).fill(0.4));
    fireEvent.click(stop);

    // 尾巴必须在 onRecordingChange(false) 之前发出去，否则 audio_end 会先到，
    // 最后半句话就永远不会进入转写。
    expect(onAudioFrame).toHaveBeenCalledTimes(1);
    expect(onAudioFrame.mock.invocationCallOrder[0]).toBeLessThan(
      onRecordingChange.mock.invocationCallOrder.at(-1)!,
    );
  });

  it("warns once after eight quiet seconds and stays quiet again until sound returns", async () => {
    const pipeline = stubCapturePipeline();
    const onSilence = vi.fn();
    const now = vi.spyOn(performance, "now").mockReturnValue(0);
    render(
      <VoiceRecorder
        onAudioFrame={vi.fn()}
        onRecordingChange={vi.fn()}
        onError={vi.fn()}
        onSilence={onSilence}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "开始录音" }));
    await screen.findByRole("button", { name: "停止录音" });

    const quiet = new Float32Array(1_600).fill(0.001);
    now.mockReturnValue(7_000);
    pipeline.emit(quiet);
    expect(onSilence).not.toHaveBeenCalled();

    now.mockReturnValue(8_100);
    pipeline.emit(quiet);
    pipeline.emit(quiet);
    expect(onSilence).toHaveBeenCalledTimes(1);

    // 说话后计时重置，下一段静默才会再提示一次。
    pipeline.emit(new Float32Array(1_600).fill(0.4));
    now.mockReturnValue(17_000);
    pipeline.emit(quiet);
    expect(onSilence).toHaveBeenCalledTimes(2);
  });
});
