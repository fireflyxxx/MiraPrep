import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HistoryPoint } from "@/lib/api/stats";
import HistoryTrend, { buildTrendData } from "./HistoryTrend";

function envelope(points: HistoryPoint[], code = 0, status = 200) {
  return new Response(
    JSON.stringify({ code, message: code ? "boom" : "ok", data: code ? null : { points } }),
    { status, headers: { "Content-Type": "application/json" } },
  );
}

function point(sessionId: number, date: string, score: number): HistoryPoint {
  return { sessionId, date, score, grade: "B" };
}

function renderTrend(currentSessionId?: number) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <HistoryTrend
        jobDirection="backend"
        jobTitle="Java 工程师"
        currentSessionId={currentSessionId}
      />
    </QueryClientProvider>,
  );
}

describe("HistoryTrend", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("asks the backend for this role only", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      envelope([point(1, "2026-07-01T10:00:00Z", 72), point(2, "2026-07-05T10:00:00Z", 84)]),
    );
    vi.stubGlobal("fetch", fetchMock);

    renderTrend(2);

    expect(await screen.findByLabelText("Java 工程师 历史得分趋势")).toBeInTheDocument();
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "http://localhost:8080/api/v1/stats/history?jobDirection=backend&jobTitle=Java+%E5%B7%A5%E7%A8%8B%E5%B8%88",
    );
  });

  it("does not draw a line from a single point", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => envelope([point(1, "2026-07-01T10:00:00Z", 72)])));

    renderTrend(1);

    expect(await screen.findByText(/目前只有 1 场完整记录/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Java 工程师 历史得分趋势")).not.toBeInTheDocument();
  });

  it("keeps the report readable when the trend request fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => envelope([], 50000, 500)));

    renderTrend();

    expect(await screen.findByText("暂时无法加载历史趋势")).toBeInTheDocument();
  });

  it("labels points by month and day in chronological order", () => {
    const data = buildTrendData([
      point(1, "2026-07-01T10:00:00Z", 72),
      point(2, "2026-12-25T10:00:00Z", 84),
    ]);
    expect(data.map((item) => item.label)).toEqual(["07/01", "12/25"]);
    expect(data.map((item) => item.score)).toEqual([72, 84]);
  });
});
