import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
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
  return (
    <div>
      {query.data
        ? query.data.grade
        : query.status === "grading"
          ? "grading"
          : query.isError
            ? "error"
            : "waiting"}
    </div>
  );
}

describe("useReport", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("polls an explicit 200 status until ready, then fetches the report once", async () => {
    let statusCalls = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/reports/23/status")) {
        statusCalls += 1;
        return new Response(
          JSON.stringify({
            code: 0,
            message: "ok",
            data: { status: statusCalls === 1 ? "grading" : "ready" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.endsWith("/reports/23")) {
        return new Response(
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
        );
      }
      throw new Error(`unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<Probe />, { wrapper });
    expect(await screen.findByText("grading")).toBeInTheDocument();
    expect(await screen.findByText("C", {}, { timeout: 3_500 })).toBeInTheDocument();
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      "http://localhost:8080/api/v1/reports/23/status",
      "http://localhost:8080/api/v1/reports/23/status",
      "http://localhost:8080/api/v1/reports/23",
    ]);
  });

  it("stops with an explicit error when grading failed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ code: 0, message: "ok", data: { status: "failed" } }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    render(<Probe />, { wrapper });

    expect(await screen.findByText("error")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
