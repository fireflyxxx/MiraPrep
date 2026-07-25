import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

const report = {
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
        { question: "什么时候主动失效？", answer: "mutation 成功以后。" },
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
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response()));
  });

  it("renders the real report, history comparison, partial label and full review details", async () => {
    const user = userEvent.setup();
    renderReport();

    expect(await screen.findByRole("heading", { name: "前端工程师 面试报告" })).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:8080/api/v1/reports/108",
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
    expect(screen.getByText("什么时候主动失效？")).toBeInTheDocument();
    expect(screen.getByText("补充缓存失效时机")).toBeInTheDocument();

    expect(screen.queryByText("项目追问 4")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "展开其余 1 题" }));
    expect(screen.getByText("项目追问 4")).toBeInTheDocument();
  });

  it("keeps a stable skeleton while the report is loading", () => {
    vi.mocked(fetch).mockReturnValue(new Promise(() => {}));

    renderReport();

    expect(screen.getByLabelText("报告加载中")).toBeInTheDocument();
  });

  it("shows a friendly error and can retry", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch)
      .mockResolvedValueOnce(response(report, false))
      .mockResolvedValueOnce(response());

    renderReport();

    expect(await screen.findByText("暂时无法加载报告")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "重新加载" }));
    expect(await screen.findByRole("heading", { name: "前端工程师 面试报告" })).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("renders repeated historical focus points without duplicate React keys", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(fetch).mockResolvedValueOnce(
      response({
        ...report,
        questions: [
          {
            ...report.questions[0],
            focusPoints: ["缓存", "缓存"],
          },
        ],
      }),
    );

    renderReport();
    await screen.findByText("请说明 React Query 的缓存策略。");

    expect(
      consoleError.mock.calls.filter(([message]) =>
        String(message).includes("same key"),
      ),
    ).toHaveLength(0);
    consoleError.mockRestore();
  });
});
