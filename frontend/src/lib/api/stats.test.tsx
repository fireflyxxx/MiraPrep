import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { overviewStatsKey, useOverviewStats } from "./stats";

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

describe("overview statistics API", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requests the authenticated overview endpoint with the shared query key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 0,
          message: "ok",
          data: {
            totalInterviews: 7,
            highestGrade: "A",
            latestGrade: "B",
            lastInterviewAt: "2026-07-22T10:00:00Z",
            overallGrade: "B",
            overallSummary: "继续保持",
            basedOnCompletedInterviews: 7,
            dimensionScores: null,
            scoreTrend: [],
            totalPracticeMinutes: 214,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useOverviewStats(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.totalInterviews).toBe(7);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8080/api/v1/stats/overview",
      expect.objectContaining({ credentials: "include" }),
    );
    expect(overviewStatsKey).toEqual(["stats", "overview"]);
  });
});
