import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import InterviewResultClient, { totalSpentSeconds } from "./InterviewResultClient";
import {
  reportKey,
  reportStatusKey,
  type InterviewReport,
  type ReportQuestion,
} from "@/lib/api/report";

function question(overrides: Partial<ReportQuestion>): ReportQuestion {
  return {
    questionId: 1,
    order: 1,
    phase: "RESUME_DEEP_DIVE",
    text: "q",
    focusPoints: [],
    answer: "a",
    score: 8,
    thinkSeconds: null,
    answerSeconds: null,
    suggestedSeconds: null,
    referenceAnswer: null,
    suggestions: [],
    followUpChain: [],
    audioUrl: null,
    ...overrides,
  };
}

describe("totalSpentSeconds", () => {
  it("counts follow-up time, which is where most of a real interview goes", () => {
    const questions = [
      question({
        thinkSeconds: 10,
        answerSeconds: 50,
        followUpChain: [
          { question: "f1", answer: "a1", answerSeconds: 120, score: 7, referenceAnswer: "", suggestions: [] },
          { question: "f2", answer: "a2", answerSeconds: 180, score: 8, referenceAnswer: "", suggestions: [] },
        ],
      }),
      question({ questionId: 2, order: 2, answerSeconds: 40 }),
    ];

    expect(totalSpentSeconds(questions)).toBe(400);
  });

  it("tolerates missing timings instead of turning them into NaN", () => {
    expect(
      totalSpentSeconds([
        question({
          followUpChain: [
            { question: "f", answer: "a", answerSeconds: null, score: null, referenceAnswer: "", suggestions: [] },
          ],
        }),
      ]),
    ).toBe(0);
  });
});

describe("InterviewResultClient", () => {
  it("renders a grade-colored reveal ceremony and reduced-motion fallback", () => {
    const report: InterviewReport = {
      sessionId: 25,
      grade: "A",
      totalScore: 88,
      jobTitle: "前端工程师",
      createdAt: "2026-08-05T00:00:00Z",
      config: {
        jobDirection: "前端开发",
        jobTitle: "前端工程师",
        jdText: null,
        difficulty: "MEDIUM",
        types: ["TECHNICAL"],
        durationMin: 30,
        customRequirements: null,
        interviewerStyle: "PROFESSIONAL",
        voiceEnabled: false,
      },
      dimensionScores: null,
      summary: "结构清晰，项目细节充分。",
      highlights: ["表达有条理"],
      weaknesses: ["可补充量化结果"],
      partial: false,
      questions: [question({ answerSeconds: 60 })],
    };
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    client.setQueryData(reportStatusKey("25"), { status: "ready" });
    client.setQueryData(reportKey("25"), report);

    render(
      <QueryClientProvider client={client}>
        <InterviewResultClient sessionId="25" />
      </QueryClientProvider>,
    );

    expect(screen.getByTestId("grade-reveal")).toHaveAttribute("data-grade", "A");
    expect(screen.getByTestId("grade-reveal")).toHaveAttribute(
      "data-motion",
      "reduced",
    );
    expect(screen.getByTestId("grade-particles")).toBeInTheDocument();
    expect(screen.getByText("88")).toHaveClass("tabular-nums");
  });

  it("keeps explaining that grading is running without fetching a missing report", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ code: 0, message: "ok", data: { status: "grading" } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={client}>
        <InterviewResultClient sessionId="25" />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("正在生成面试报告")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/reports\/25\/status$/);
  });
});
