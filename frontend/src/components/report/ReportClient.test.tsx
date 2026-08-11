import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InterviewReport } from "@/lib/api/report";
import ReportClient from "./ReportClient";

const overview = vi.hoisted(() => ({
  result: {
    data: {
      dimensionScores: {
        professionalKnowledge: 70,
        projectDepth: 75,
        communicationLogic: 72,
        adaptability: 68,
        jobFit: 66,
      },
    },
  },
}));

vi.mock("@/lib/api/stats", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/stats")>();
  return {
    ...actual,
    useOverviewStats: () => overview.result,
  };
});

const report: InterviewReport = {
  sessionId: 108,
  grade: "A",
  totalScore: 82,
  jobTitle: "前端工程师",
  createdAt: "2026-07-25T03:00:00Z",
  config: {
    jobDirection: "frontend",
    jobTitle: "前端工程师",
    jdText: null,
    difficulty: "hard",
    types: ["technical", "project"],
    durationMin: 30,
    customRequirements: null,
    interviewerStyle: "professional",
    voiceEnabled: false,
  },
  dimensionScores: {
    professionalKnowledge: 78,
    projectDepth: 88,
    communicationLogic: 80,
    adaptability: 72,
    jobFit: 76,
  },
  summary: "项目讲解清楚，技术取舍还可以更主动。",
  highlights: ["项目深度扎实", "表达有结构"],
  weaknesses: ["系统设计取舍不足"],
  partial: true,
  questions: [
    {
      questionId: 1,
      order: 1,
      phase: "domain_assessment",
      text: "请说明 React Query 的缓存策略。",
      focusPoints: ["缓存", "失效"],
      answer: "我会设置 staleTime，并在更新后失效查询。",
      score: 8,
      thinkSeconds: 30,
      answerSeconds: 90,
      suggestedSeconds: 100,
      referenceAnswer: "区分 staleTime 与 gcTime，并按数据变化频率设置。",
      suggestions: ["补充缓存失效时机"],
      followUpChain: [
        {
          question: "什么时候主动失效？",
          answer: "mutation 成功以后。",
          answerSeconds: 18,
          referenceAnswer: "在 mutation 成功后按 queryKey 精确失效。",
          suggestions: ["补充乐观更新失败时的回滚策略"],
        },
      ],
      audioUrl: null,
    },
    ...Array.from({ length: 3 }, (_, index) => ({
      questionId: index + 2,
      order: index + 2,
      phase: "resume_deep_dive",
      text: `项目追问 ${index + 2}`,
      focusPoints: ["项目"],
      answer: "回答",
      score: 6,
      thinkSeconds: 10,
      answerSeconds: 30,
      suggestedSeconds: 60,
      referenceAnswer: "参考",
      suggestions: ["建议"],
      followUpChain: [],
      audioUrl: null,
    })),
  ],
};

function response(body = report, ok = true) {
  return new Response(
    JSON.stringify({
      code: ok ? 0 : 50000,
      message: ok ? "ok" : "报告加载失败",
      data: ok ? body : null,
    }),
    { status: ok ? 200 : 500, headers: { "Content-Type": "application/json" } },
  );
}

function statusResponse(status: "none" | "grading" | "ready" | "failed" = "ready") {
  return new Response(
    JSON.stringify({ code: 0, message: "ok", data: { status } }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function envelope(data: unknown) {
  return new Response(JSON.stringify({ code: 0, message: "ok", data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

/** 报告页除了报告本身，还会拉分享开关和同岗位历史，测试替身要把三条路都答上。 */
function reportFetch(body = report, ok = true) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/share")) {
      return envelope({ enabled: false, shareToken: null, shareUrl: null });
    }
    if (url.includes("/stats/history")) return envelope({ points: [] });
    if (url.endsWith("/status")) return statusResponse();
    return response(body, ok);
  });
}

function renderReport() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ReportClient sessionId="108" />
    </QueryClientProvider>,
  );
}

describe("ReportClient", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", reportFetch());
  });

  it("renders the real report, history comparison, partial label and full review details", async () => {
    const user = userEvent.setup();
    renderReport();

    expect(await screen.findByRole("heading", { name: "前端工程师 面试报告" })).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:8080/api/v1/reports/108",
      expect.objectContaining({ credentials: "include" }),
    );
    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:8080/api/v1/reports/108/status",
      expect.objectContaining({ credentials: "include" }),
    );
    expect(screen.getByText("部分完成")).toBeInTheDocument();
    expect(screen.getByText("82")).toBeInTheDocument();
    // 难度与阶段的取值来自后端枚举（easy/medium/hard、InterviewPhase），必须译成中文
    expect(screen.getByText("高级 · 30 分钟")).toBeInTheDocument();
    expect(screen.getByText("专业评估")).toBeInTheDocument();
    expect(screen.getAllByText("项目深挖").length).toBeGreaterThan(0);
    expect(screen.getByText("项目深度扎实")).toBeInTheDocument();
    expect(screen.getByLabelText("五维能力雷达图")).toHaveTextContent("本次");
    expect(screen.getByLabelText("五维能力雷达图")).toHaveTextContent("历史均值");
    expect(screen.getByText("超出建议 20 秒")).toBeInTheDocument();
    expect(screen.getByText(/什么时候主动失效？/)).toBeInTheDocument();
    expect(screen.getByText("追问用时 18 秒")).toBeInTheDocument();
    expect(screen.getByText("在 mutation 成功后按 queryKey 精确失效。")).toBeInTheDocument();
    expect(screen.getByText("补充乐观更新失败时的回滚策略")).toBeInTheDocument();
    expect(screen.getByText("补充缓存失效时机")).toBeInTheDocument();

    expect(screen.queryByText("项目追问 4")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "展开其余 1 题" }));
    expect(screen.getByText("项目追问 4")).toBeInTheDocument();
  });

  it("offers one retry action for every visible private report question", async () => {
    renderReport();

    expect(await screen.findAllByRole("button", { name: "重练此题" })).toHaveLength(3);
  });

  it("starts exactly one practice request from the retry click", async () => {
    const baseFetch = reportFetch();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/interviews/108/questions/1/retry") && init?.method === "POST") {
        return new Promise<Response>(() => {});
      }
      return baseFetch(input);
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderReport();

    const retryButtons = await screen.findAllByRole("button", { name: "重练此题" });
    await user.click(retryButtons[0]);

    expect(await screen.findByText("正在准备单题练习")).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method === "POST"),
    ).toHaveLength(1);
  });

  it("keeps a stable skeleton while the report is loading", () => {
    vi.mocked(fetch).mockReturnValue(new Promise(() => {}));

    renderReport();

    expect(screen.getByLabelText("报告加载中")).toBeInTheDocument();
  });

  it("shows a durable generating state without requesting missing report data", async () => {
    const fetchMock = vi.fn().mockResolvedValue(statusResponse("grading"));
    vi.stubGlobal("fetch", fetchMock);

    renderReport();

    expect(await screen.findByText("报告正在生成")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/reports\/108\/status$/);
  });

  it("shows a friendly error and can retry", async () => {
    const user = userEvent.setup();
    let reportCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/share")) {
          return envelope({ enabled: false, shareToken: null, shareUrl: null });
        }
        if (url.includes("/stats/history")) return envelope({ points: [] });
        if (url.endsWith("/status")) return statusResponse();
        reportCalls += 1;
        return reportCalls === 1 ? response(report, false) : response();
      }),
    );

    renderReport();

    expect(await screen.findByText("暂时无法加载报告")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "重新加载" }));
    expect(await screen.findByRole("heading", { name: "前端工程师 面试报告" })).toBeInTheDocument();
    expect(reportCalls).toBe(2);
  });

  it("renders repeated historical focus points without duplicate React keys", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", reportFetch({
        ...report,
        questions: [
          {
            ...report.questions[0],
            focusPoints: ["缓存", "缓存"],
          },
        ],
      }));

    renderReport();
    await screen.findByText("请说明 React Query 的缓存策略。");

    expect(
      consoleError.mock.calls.filter(([message]) =>
        String(message).includes("same key"),
      ),
    ).toHaveLength(0);
    consoleError.mockRestore();
  });

  it("labels unanswered questions explicitly instead of claiming their time was lost", async () => {
    vi.stubGlobal("fetch", reportFetch({
        ...report,
        questions: [
          {
            ...report.questions[0],
            answer: null,
            thinkSeconds: null,
            answerSeconds: null,
          },
        ],
      }));

    renderReport();
    await screen.findByText("请说明 React Query 的缓存策略。");

    expect(screen.getAllByText("未作答")).not.toHaveLength(0);
    expect(screen.getByText("本题未作答")).toBeInTheDocument();
    expect(screen.queryByText(/用时 未记录/)).not.toBeInTheDocument();
  });

  it("prints the same report body and keeps every question in the pdf DOM", async () => {
    const fetchMock = reportFetch();
    vi.stubGlobal("fetch", fetchMock);
    const print = vi.spyOn(window, "print").mockImplementation(() => {});

    renderReport();
    const button = await screen.findByRole("button", { name: "导出 PDF" });
    expect(screen.queryByText("项目追问 4")).not.toBeInTheDocument();

    fireEvent(window, new Event("beforeprint"));
    const fourthQuestion = screen.getByText("项目追问 4");
    expect(fourthQuestion.closest("[data-report-question]")).toHaveClass(
      "report-question-print-block",
    );
    expect(fourthQuestion.closest("[data-report-question]")?.parentElement).toHaveClass(
      "report-question-list",
    );
    fireEvent(window, new Event("afterprint"));
    expect(screen.queryByText("项目追问 4")).not.toBeInTheDocument();

    await userEvent.click(button);

    expect(print).toHaveBeenCalledTimes(1);
    expect(
      fetchMock.mock.calls.some(([input]) => String(input).endsWith("/export")),
    ).toBe(false);
    print.mockRestore();
  });
});
