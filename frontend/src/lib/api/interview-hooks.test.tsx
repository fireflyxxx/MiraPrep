import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useInterviewList, type InterviewListResponse } from "./interview";

function okResponse(data: InterviewListResponse): Response {
  return new Response(JSON.stringify({ code: 0, message: "ok", data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("useInterviewList", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("retains the previous page while a slow next page is loading", async () => {
    const nextPage = deferred<Response>();
    const firstPage: InterviewListResponse = {
      items: [],
      total: 6,
      page: 1,
      size: 5,
    };
    const secondPage: InterviewListResponse = {
      items: [],
      total: 6,
      page: 2,
      size: 5,
    };
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(okResponse(firstPage))
        .mockReturnValueOnce(nextPage.promise),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result, rerender } = renderHook(
      ({ page }) => useInterviewList({ page, size: 5 }),
      { initialProps: { page: 1 }, wrapper },
    );

    await waitFor(() => expect(result.current.data?.page).toBe(1));
    rerender({ page: 2 });

    await waitFor(() => expect(result.current.isFetching).toBe(true));
    expect(result.current.isPlaceholderData).toBe(true);
    expect(result.current.data?.page).toBe(1);

    nextPage.resolve(okResponse(secondPage));
    await waitFor(() => expect(result.current.data?.page).toBe(2));
    expect(result.current.isPlaceholderData).toBe(false);
  });
});
