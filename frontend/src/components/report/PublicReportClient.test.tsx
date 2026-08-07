import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { InterviewReport } from "@/lib/api/report";
import PublicReportClient from "./PublicReportClient";

/** 后端已经脱敏过的公开视图：sessionId、jdText、audioUrl 都是 null。 */
const publicReport = {
  sessionId: null,
  grade: "A",
  totalScore: 82,
  jobTitle: "Java 工程师",
  createdAt: "2026-07-25T03:00:00Z",
  config: {
    jobDirection: "backend",
    jobTitle: "Java 工程师",
    jdText: null,
    difficulty: "medium",
    types: ["technical"],
    durationMin: 45,
    customRequirements: null,
    interviewerStyle: "balanced",
    voiceEnabled: false,
  },
  dimensionScores: {
    professionalKnowledge: 78,
    projectDepth: 88,
    communicationLogic: 80,
    adaptability: 72,
    jobFit: 76,
  },
  summary: "[已隐藏]同学总体表现稳定。",
  highlights: ["项目讲解清楚"],
  weaknesses: ["岗位匹配度可提升"],
  partial: false,
  questions: [
    {
      questionId: 1,
      order: 1,
      phase: "domain_assessment",
      text: "请介绍你做的可靠回调。",
      focusPoints: ["项目深度"],
      answer: "我叫[已隐藏]，用数据库事务和行锁保证幂等。",
      score: 8,
      thinkSeconds: 12,
      answerSeconds: 88,
      suggestedSeconds: 120,
      referenceAnswer: "可结合项目说明事务与行锁。",
      suggestions: ["先说明风险，再说明方案"],
      followUpChain: [],
      audioUrl: null,
    },
  ],
} as unknown as InterviewReport;

function envelope(data: unknown, code = 0, status = 200) {
  return new Response(JSON.stringify({ code, message: code ? "not found" : "ok", data }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function renderPublic(token = "tok-123") {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <PublicReportClient shareToken={token} />
    </QueryClientProvider>,
  );
}

describe("PublicReportClient", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("renders a read-only report without owner-only affordances", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => envelope(publicReport));
    vi.stubGlobal("fetch", fetchMock);

    renderPublic();

    expect(
      await screen.findByRole("heading", { name: "Java 工程师 面试报告" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/姓名、联系方式与录音已隐去/)).toBeInTheDocument();
    expect(screen.getByText("我叫[已隐藏]，用数据库事务和行锁保证幂等。")).toBeInTheDocument();

    // 公开页不提供任何本人专属操作。
    expect(screen.queryByRole("button", { name: "分享报告" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "导出 PDF" })).not.toBeInTheDocument();
    expect(screen.queryByText("同岗位历史趋势")).not.toBeInTheDocument();

    // 只调公开接口，且不带 Authorization——公开页不该把访客的登录态发出去。
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("http://localhost:8080/api/v1/public/reports/tok-123");
    expect(new Headers(init?.headers).get("Authorization")).toBeNull();
  });

  it("explains that a revoked link is dead instead of bouncing the visitor to login", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => envelope(null, 40400, 404)));
    const replace = vi.fn();
    vi.stubGlobal("location", { ...window.location, replace });

    renderPublic("revoked");

    expect(await screen.findByRole("heading", { name: "链接已失效" })).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});
