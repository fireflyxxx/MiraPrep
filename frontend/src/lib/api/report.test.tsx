import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useReport } from "./report";

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false } },
        })
      }
    >
      {children}
    </QueryClientProvider>
  );
}

function Probe() {
  const query = useReport("23");
  return <div>{query.data ? query.data.grade : query.isError ? "error" : "waiting"}</div>;
}

describe("useReport", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("keeps polling while grading has not created the report yet", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ code: 40400, message: "not found", data: null }),
          { status: 404, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 0,
            message: "ok",
            data: {
              sessionId: 23,
              grade: "C",
              totalScore: 65,
              jobTitle: "前端工程师",
              createdAt: "2026-07-25T21:37:00Z",
              config: {},
              dimensionScores: null,
              summary: "完成评级",
              highlights: [],
              weaknesses: [],
              partial: false,
              questions: [],
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<Probe />, { wrapper });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText("waiting")).toBeInTheDocument();

    expect(await screen.findByText("C", {}, { timeout: 3_500 })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
