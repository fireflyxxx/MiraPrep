import { describe, expect, it, vi } from "vitest";
import { base64ToBytes, bytesToBase64 } from "./interview-ws";

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
