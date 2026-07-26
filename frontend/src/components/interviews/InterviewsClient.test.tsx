import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InterviewListItem, InterviewListResponse } from "@/lib/api/interview";
import InterviewsClient from "./InterviewsClient";

const mocks = vi.hoisted(() => ({
  statsRefetch: vi.fn(),
  listRefetch: vi.fn(),
  statsResult: {} as Record<string, unknown>,
  pages: {} as Record<number, Record<string, unknown>>,
}));

vi.mock("@/lib/api/stats", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/stats")>();
  return {
    ...actual,
    useOverviewStats: () => mocks.statsResult,
  };
});

vi.mock("@/lib/api/interview", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/interview")>();
  return {
    ...actual,
    useInterviewList: ({ page }: { page: number }) => mocks.pages[page],
  };
});

function item(
  sessionId: number,
  overrides: Partial<InterviewListItem> = {},
): InterviewListItem {
  return {
    sessionId,
    jobTitle: `前端工程师 ${sessionId}`,
    difficulty: "medium",
    durationMin: 30,
    actualDurationSeconds: 1_800,
    questionCount: 8,
    status: "completed",
    grade: "B",
    reportStatus: "ready",
    createdAt: "2026-07-25T03:00:00Z",
    endedAt: "2026-07-25T03:30:00Z",
    ...overrides,
  };
}

function page(
  items: InterviewListItem[],
  overrides: Partial<InterviewListResponse> = {},
) {
  return {
    data: {
      items,
      total: items.length,
      page: 1,
      size: 5,
      ...overrides,
    },
    isPending: false,
    isError: false,
    isFetching: false,
    isPlaceholderData: false,
    refetch: mocks.listRefetch,
  };
}

function stats(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      totalInterviews: 5,
      highestGrade: "A",
      latestGrade: "B",
      lastInterviewAt: "2026-07-25T03:30:00Z",
      overallGrade: "B",
      overallSummary: "表达清楚，项目取舍还可以更深入。",
      basedOnCompletedInterviews: 5,
      dimensionScores: {
        professionalKnowledge: 81,
        projectDepth: 76,
        communicationLogic: 88,
        adaptability: 69,
        jobFit: 73,
      },
      scoreTrend: [],
      totalPracticeMinutes: 150,
      ...overrides,
    },
    isPending: false,
    isError: false,
    refetch: mocks.statsRefetch,
  };
}

describe("InterviewsClient", () => {
  beforeEach(() => {
    mocks.statsRefetch.mockReset();
    mocks.listRefetch.mockReset();
    mocks.statsResult = stats();
    mocks.pages = {
      1: page([item(1)]),
    };
  });

  it("maps the five frozen dimensions and renders real aggregate values", () => {
    render(<InterviewsClient />);

    expect(within(screen.getByRole("region", { name: "综合表现" })).getByText("B")).toBeInTheDocument();
    expect(screen.getByText("表达清楚，项目取舍还可以更深入。")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "专业知识" })).toHaveAttribute("aria-valuenow", "81");
    expect(screen.getByRole("progressbar", { name: "项目深度" })).toHaveAttribute("aria-valuenow", "76");
    expect(screen.getByRole("progressbar", { name: "表达逻辑" })).toHaveAttribute("aria-valuenow", "88");
    expect(screen.getByRole("progressbar", { name: "临场应变" })).toHaveAttribute("aria-valuenow", "69");
    expect(screen.getByRole("progressbar", { name: "岗位匹配度" })).toHaveAttribute("aria-valuenow", "73");
  });

  it("maps ready, ongoing, grading, aborted and failed to safe actions", () => {
    mocks.pages[1] = page([
      item(11),
      item(12, { status: "ongoing", grade: null, reportStatus: "none", actualDurationSeconds: null }),
      item(13, { grade: null, reportStatus: "grading" }),
      item(14, { status: "aborted", grade: null, reportStatus: "none" }),
      item(15, { grade: null, reportStatus: "failed" }),
    ]);

    render(<InterviewsClient />);

    expect(screen.getByRole("link", { name: "查看报告 →" })).toHaveAttribute("href", "/report/11");
    expect(screen.getByRole("link", { name: "继续面试 →" })).toHaveAttribute("href", "/interview/12");
    expect(screen.getByText("报告生成中")).toBeInTheDocument();
    expect(screen.getByText("本场已中止")).toBeInTheDocument();
    expect(screen.getByText("生成失败，请稍后重试")).toBeInTheDocument();
    expect(screen.getAllByRole("link").filter((link) => link.getAttribute("href")?.startsWith("/report/"))).toHaveLength(1);
  });

  it("shows stable loading skeletons and independent retry controls", async () => {
    const user = userEvent.setup();
    mocks.statsResult = {
      data: undefined,
      isPending: false,
      isError: true,
      refetch: mocks.statsRefetch,
    };
    mocks.pages[1] = {
      data: undefined,
      isPending: false,
      isError: true,
      isFetching: false,
      isPlaceholderData: false,
      refetch: mocks.listRefetch,
    };

    render(<InterviewsClient />);
    await user.click(screen.getByRole("button", { name: "重试统计" }));
    await user.click(screen.getByRole("button", { name: "重试记录" }));

    expect(screen.getByText("场次暂不可用")).toBeInTheDocument();
    expect(screen.queryByText("正在统计…")).not.toBeInTheDocument();
    expect(mocks.statsRefetch).toHaveBeenCalledTimes(1);
    expect(mocks.listRefetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["S", "text-grade-s", "bg-grade-s/15"],
    ["A", "text-grade-a", "bg-grade-a/15"],
    ["B", "text-grade-b", "bg-grade-b/15"],
    ["C", "text-grade-c", "bg-grade-c/15"],
    ["D", "text-grade-d", "bg-grade-d/15"],
  ] as const)("uses the shared %s grade tokens in history badges", (grade, textClass, backgroundClass) => {
    mocks.pages[1] = page([item(21, { grade })]);

    render(<InterviewsClient />);

    const row = screen.getByRole("article");
    expect(within(row).getByText(grade)).toHaveClass(textClass, backgroundClass);
  });

  it("shows first-interview calls to action when no grade and no records exist", () => {
    mocks.statsResult = stats({
      totalInterviews: 0,
      overallGrade: null,
      overallSummary: null,
      basedOnCompletedInterviews: 0,
      dimensionScores: null,
    });
    mocks.pages[1] = page([]);

    render(<InterviewsClient />);

    expect(screen.getByText("还没有面试记录")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "开始首次面试 →" })).toHaveLength(2);
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("paginates without keeping duplicate rows and exposes retained-page loading", async () => {
    const user = userEvent.setup();
    mocks.pages[1] = page(
      [item(1), item(2), item(3), item(4), item(5)],
      { total: 6 },
    );
    mocks.pages[2] = {
      ...page([item(6)], { total: 6, page: 2 }),
      isFetching: true,
      isPlaceholderData: true,
    };

    render(<InterviewsClient />);
    await user.click(screen.getByRole("button", { name: "下一页" }));

    const history = screen.getByRole("region", { name: "全部面试" });
    expect(within(history).getByText("前端工程师 6")).toBeInTheDocument();
    expect(within(history).queryByText("前端工程师 1")).not.toBeInTheDocument();
    expect(within(history).getByRole("status")).toHaveTextContent("正在加载下一页");
    expect(screen.getByText("第 2 / 2 页")).toBeInTheDocument();
  });
});
