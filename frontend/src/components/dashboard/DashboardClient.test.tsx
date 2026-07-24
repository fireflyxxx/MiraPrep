import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DashboardClient from "./DashboardClient";

const mocks = vi.hoisted(() => ({
  refetch: vi.fn(),
  statsResult: {} as Record<string, unknown>,
}));

vi.mock("@/lib/api/auth", () => ({
  useMeQuery: () => ({
    data: {
      id: 1,
      email: "lin@example.com",
      nickname: "小林",
      avatar: null,
      isFirstLogin: false,
    },
  }),
}));

vi.mock("@/lib/api/stats", () => ({
  useOverviewStats: () => mocks.statsResult,
}));

vi.mock("@/components/resume/DashboardResumeSection", () => ({
  default: () => <section aria-label="我的简历">真实简历模块</section>,
}));

function successStats(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      totalInterviews: 7,
      highestGrade: "A",
      latestGrade: "B",
      lastInterviewAt: new Date(2026, 6, 22, 10).toISOString(),
      overallGrade: "B",
      overallSummary: "继续保持",
      basedOnCompletedInterviews: 7,
      dimensionScores: null,
      scoreTrend: [],
      totalPracticeMinutes: 214,
      ...overrides,
    },
    isPending: false,
    isError: false,
    refetch: mocks.refetch,
  };
}

describe("DashboardClient", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 6, 25, 10));
    mocks.refetch.mockReset();
    mocks.statsResult = successStats();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    [5, "早上好，小林"],
    [12, "下午好，小林"],
    [18, "晚上好，小林"],
  ])("uses the browser-local greeting at %i:00", (hour, expected) => {
    vi.setSystemTime(new Date(2026, 6, 25, hour));

    render(<DashboardClient />);

    expect(screen.getByRole("heading", { name: new RegExp(expected) })).toBeInTheDocument();
  });

  it("renders a stable statistics skeleton while the overview is loading", () => {
    mocks.statsResult = {
      data: undefined,
      isPending: true,
      isError: false,
      refetch: mocks.refetch,
    };

    render(<DashboardClient />);

    expect(screen.getByLabelText("统计加载中")).toBeInTheDocument();
    expect(screen.getByLabelText("我的简历")).toBeInTheDocument();
  });

  it("shows an honest first-interview state without inventing a grade or date", () => {
    mocks.statsResult = successStats({
      totalInterviews: 0,
      highestGrade: null,
      latestGrade: null,
      lastInterviewAt: null,
    });

    render(<DashboardClient />);

    expect(screen.getByText("还没有完成过面试")).toBeInTheDocument();
    expect(screen.getByText("完成首场面试后，这里会展示你的最高评级。")).toBeInTheDocument();
    expect(screen.queryByText("A-")).not.toBeInTheDocument();
    expect(screen.queryByText(/距上次 \d+ 天/)).not.toBeInTheDocument();
  });

  it("does not claim zero completed interviews while the latest report is still grading", () => {
    mocks.statsResult = successStats({ totalInterviews: 3, lastInterviewAt: null });

    render(<DashboardClient />);

    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.queryByText("还没有完成过面试")).not.toBeInTheDocument();
    expect(screen.getByText("最近一场的报告还在生成，稍后回来看结果。")).toBeInTheDocument();
  });

  it("falls back to neutral copy instead of inventing a date it cannot parse", () => {
    mocks.statsResult = successStats({ lastInterviewAt: "昨天下午" });

    render(<DashboardClient />);

    expect(screen.getByText("保持手感，继续练一场吧。")).toBeInTheDocument();
    expect(screen.queryByText(/今天刚完成一场面试/)).not.toBeInTheDocument();
  });

  it("renders real statistics and computes elapsed days from local calendar dates", () => {
    render(<DashboardClient />);

    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText(/距上次 3 天/)).toBeInTheDocument();
  });

  it("keeps the resume area usable when statistics fail and retries locally", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mocks.statsResult = {
      data: undefined,
      isPending: false,
      isError: true,
      refetch: mocks.refetch,
    };

    render(<DashboardClient />);
    await user.click(screen.getByRole("button", { name: "重试统计" }));

    expect(screen.getByText("统计加载失败")).toBeInTheDocument();
    expect(screen.getByLabelText("我的简历")).toBeInTheDocument();
    expect(mocks.refetch).toHaveBeenCalledTimes(1);
  });
});
