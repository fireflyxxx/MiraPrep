export interface PollOptions {
  intervalMs?: number;
  maxAttempts?: number;
  signal?: AbortSignal;
}

function abortError(): DOMException {
  return new DOMException("轮询已取消", "AbortError");
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError();
}

/** 可被 signal 提前中止的定时等待，中止时清掉 timer 并拒绝。 */
function delay(intervalMs: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      signal?.removeEventListener("abort", handleAbort);
      resolve();
    }, intervalMs);
    const handleAbort = () => {
      window.clearTimeout(timeoutId);
      reject(abortError());
    };
    signal?.addEventListener("abort", handleAbort, { once: true });
  });
}

/**
 * 轮询 fetchOnce 直到 isPending 为 false、次数耗尽或 signal 中止。
 * 次数耗尽时返回最后一次结果而非抛错，由调用方区分「超时」与「终态」。
 */
export async function pollUntilSettled<T>(
  fetchOnce: (signal?: AbortSignal) => Promise<T>,
  isPending: (value: T) => boolean,
  options: { intervalMs: number; maxAttempts: number; signal?: AbortSignal },
): Promise<T> {
  const { intervalMs, maxAttempts, signal } = options;
  let latest: T | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    throwIfAborted(signal);
    latest = await fetchOnce(signal);
    throwIfAborted(signal);
    if (!isPending(latest)) return latest;
    if (attempt < maxAttempts - 1 && intervalMs > 0) {
      await delay(intervalMs, signal);
    }
  }

  if (latest !== null) return latest;
  throw new Error("轮询次数必须大于 0");
}
