import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import InterviewResultPage from "./page";

vi.mock("@/components/AuthGuard", () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));

const report = {
  sessionId: 108,
  grade: "B",
  totalScore: 76,
  jobTitle: "Java 工程师",
  createdAt: "2026-07-25T03:00:00Z",
  config: {
    jobDirection: "backend",
    jobTitle: "Java 工程师",
    jdText: null,
    difficulty: "hard",
    types: ["technical"],
    durationMin: 30,
    customRequirements: null,
    interviewerStyle: "professional",
    voiceEnabled: false,
  },
  dimensionScores: null,
  summary: "基础稳固，系统设计还需加强。",
  highlights: ["并发控制思路清楚"],
  weaknesses: ["需要说明技术权衡"],
  partial: false,
  questions: [
    {
      questionId: 2,
      order: 2,
      phase: "candidate_qa",
      text: "你还有什么想问的？",
      focusPoints: [],
      answer: null,
      score: null,
      thinkSeconds: null,
      answerSeconds: null,
      suggestedSeconds: 60,
      referenceAnswer: null,
      suggestions: [],
      followUpChain: [],
      audioUrl: null,
    },
    {
      questionId: 1,
      order: 1,
      phase: "domain_assessment",
      text: "如何保证幂等？",
      focusPoints: [],
      answer: "唯一约束",
      score: 7,
      thinkSeconds: 15,
      answerSeconds: 45,
      suggestedSeconds: 90,
      referenceAnswer: "事务与唯一约束",
      suggestions: [],
      followUpChain: [],
      audioUrl: null,
    },
  ],
};

describe("InterviewResultPage", () => {
  it("renders the rating summary from the report endpoint", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ code: 0, message: "ok", data: report }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const page = await InterviewResultPage({
      params: Promise.resolve({ sessionId: "108" }),
    });

    render(
      <QueryClientProvider client={queryClient}>{page}</QueryClientProvider>,
    );

    expect(await screen.findByText("Java 工程师 · 高级")).toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();
    expect(screen.getByText("76")).toBeInTheDocument();
    expect(screen.getByText("并发控制思路清楚")).toBeInTheDocument();
    // 未作答的题不计入「回答题数」
    expect(screen.getByText("回答题数").previousSibling).toHaveTextContent("1");
    expect(screen.getByText("需要说明技术权衡")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /查看完整报告/ })).toHaveAttribute(
      "href",
      "/report/108",
    );
  });
});
