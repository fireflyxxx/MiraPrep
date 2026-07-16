import { describe, expect, it, vi } from "vitest";
import { pollUntilSettled } from "./poll";

interface Probe {
  done: boolean;
}

const pending: Probe = { done: false };
const settled: Probe = { done: true };
const isPending = (value: Probe) => !value.done;

describe("pollUntilSettled", () => {
  it("returns the first settled value without waiting again", async () => {
    const values = [pending, settled];
    const fetchOnce = vi.fn(async () => values.shift()!);

    await expect(
      pollUntilSettled(fetchOnce, isPending, { intervalMs: 0, maxAttempts: 3 }),
    ).resolves.toEqual(settled);
    expect(fetchOnce).toHaveBeenCalledTimes(2);
  });

  it("returns the last pending value when attempts run out", async () => {
    const fetchOnce = vi.fn(async () => pending);

    await expect(
      pollUntilSettled(fetchOnce, isPending, { intervalMs: 0, maxAttempts: 2 }),
    ).resolves.toEqual(pending);
    expect(fetchOnce).toHaveBeenCalledTimes(2);
  });

  it("waits intervalMs between attempts", async () => {
    vi.useFakeTimers();
    try {
      const values = [pending, settled];
      const fetchOnce = vi.fn(async () => values.shift()!);
      const poll = pollUntilSettled(fetchOnce, isPending, {
        intervalMs: 1_500,
        maxAttempts: 3,
      });

      await vi.advanceTimersByTimeAsync(0);
      expect(fetchOnce).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1_499);
      expect(fetchOnce).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);

      await expect(poll).resolves.toEqual(settled);
      expect(fetchOnce).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("aborts while waiting between attempts and clears the pending timer", async () => {
    vi.useFakeTimers();
    const clearTimeoutSpy = vi.spyOn(window, "clearTimeout");
    try {
      const controller = new AbortController();
      const fetchOnce = vi.fn(async () => pending);
      const poll = pollUntilSettled(fetchOnce, isPending, {
        intervalMs: 1_500,
        maxAttempts: 5,
        signal: controller.signal,
      });

      await vi.advanceTimersByTimeAsync(0);
      expect(fetchOnce).toHaveBeenCalledTimes(1);
      controller.abort();

      await expect(poll).rejects.toMatchObject({ name: "AbortError" });
      expect(clearTimeoutSpy).toHaveBeenCalled();

      // 中止后剩余的等待不应再触发一次请求。
      await vi.advanceTimersByTimeAsync(10_000);
      expect(fetchOnce).toHaveBeenCalledTimes(1);
    } finally {
      clearTimeoutSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it("aborts before the first request when the signal is already aborted", async () => {
    const fetchOnce = vi.fn(async () => settled);

    await expect(
      pollUntilSettled(fetchOnce, isPending, {
        intervalMs: 0,
        maxAttempts: 3,
        signal: AbortSignal.abort(),
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchOnce).not.toHaveBeenCalled();
  });

  it("passes the signal down so an in-flight request can be cancelled", async () => {
    const controller = new AbortController();
    const fetchOnce = vi.fn(async (signal?: AbortSignal) => {
      expect(signal).toBe(controller.signal);
      controller.abort();
      return pending;
    });

    await expect(
      pollUntilSettled(fetchOnce, isPending, {
        intervalMs: 0,
        maxAttempts: 3,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchOnce).toHaveBeenCalledTimes(1);
  });

  it("throws when asked for zero attempts", async () => {
    await expect(
      pollUntilSettled(async () => settled, isPending, {
        intervalMs: 0,
        maxAttempts: 0,
      }),
    ).rejects.toThrow("轮询次数必须大于 0");
  });
});
