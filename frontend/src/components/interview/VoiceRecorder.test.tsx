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
