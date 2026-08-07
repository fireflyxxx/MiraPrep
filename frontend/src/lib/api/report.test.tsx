import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, renderHook, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { useExportReport, useReport } from "./report";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

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

describe("useExportReport", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(toast.error).mockReset();
  });

  it("downloads the pdf blob under a session-scoped file name", async () => {
    const pdf = new Blob(["%PDF-1.4"], { type: "application/pdf" });
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(pdf, { status: 200, headers: { "Content-Type": "application/pdf" } }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const createObjectURL = vi.fn(() => "blob:report");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });
    const clicked: HTMLAnchorElement[] = [];
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        clicked.push(this);
      });

    const { result } = renderHook(() => useExportReport("23"), { wrapper });
    result.current.mutate();

    await waitFor(() => expect(clicked).toHaveLength(1));
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "http://localhost:8080/api/v1/reports/23/export",
    );
    expect(clicked[0].download).toBe("MiraPrep-report-23.pdf");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:report");
    // 临时的 <a> 不能留在页面里。
    expect(document.querySelector("a[download]")).toBeNull();
    expect(toast.error).not.toHaveBeenCalled();
    click.mockRestore();
  });

  it("surfaces the backend message instead of downloading an error envelope", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ code: 40300, message: "forbidden", data: null }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const createObjectURL = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL: vi.fn() });

    const { result } = renderHook(() => useExportReport("23"), { wrapper });
    result.current.mutate();

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("forbidden"));
    expect(createObjectURL).not.toHaveBeenCalled();
  });
});
