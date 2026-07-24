"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import DashboardResumeSection from "@/components/resume/DashboardResumeSection";
import { useMeQuery } from "@/lib/api/auth";
import { useOverviewStats, type StatsOverview } from "@/lib/api/stats";

const subscribeToBrowser = () => () => {};

function greetingForHour(hour: number): string {
  if (hour >= 5 && hour < 12) return "早上好";
  if (hour >= 12 && hour < 18) return "下午好";
  return "晚上好";
}

function localDayNumber(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

function daysSince(lastInterviewAt: string, now: Date): number | null {
  const lastInterview = new Date(lastInterviewAt);
  if (Number.isNaN(lastInterview.getTime())) return null;
  return Math.max(
    0,
    Math.floor((localDayNumber(now) - localDayNumber(lastInterview)) / 86_400_000),
  );
}

function motivation(stats: StatsOverview | undefined, now: Date | null): string {
  if (!stats) return "正在整理你的训练进度…";
  // totalInterviews 统计所有已结束的面试，lastInterviewAt 只来自出了完整报告的那些，两者会不一致。
  if (stats.totalInterviews === 0) return "还没有完成过面试";
  if (!stats.lastInterviewAt) return "最近一场的报告还在生成，稍后回来看结果。";
  if (!now) return "正在按你的本地时间整理最近训练记录…";
  const elapsedDays = daysSince(stats.lastInterviewAt, now);
  if (elapsedDays === null) return "保持手感，继续练一场吧。";
  if (elapsedDays === 0) return "今天刚完成一场面试，趁热回顾会更有效。";
  return `距上次 ${elapsedDays} 天，保持手感，继续练一场吧。`;
}

function StatsSkeleton() {
  return (
    <div aria-label="统计加载中" className="grid min-h-[256px] grid-rows-2 gap-4">
      {[0, 1].map((item) => (
        <div
          key={item}
          className="animate-pulse rounded-[20px] border border-border-subtle bg-surface p-[22px]"
        >
          <div className="h-4 w-20 rounded bg-muted" />
          <div className="mt-8 h-9 w-24 rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

function StatsError({ retry }: { retry: () => void }) {
  return (
    <div className="flex min-h-[256px] flex-col items-start justify-center rounded-[20px] border border-border-subtle bg-surface p-[22px]">
      <p className="m-0 text-sm font-medium">统计加载失败</p>
      <p className="mt-1.5 mb-4 text-[13px] leading-5 text-muted-foreground">
        简历区仍可正常使用，你可以单独重试统计。
      </p>
      <button
        type="button"
        onClick={retry}
        className="mira-button rounded-[10px] border border-border px-4 py-2 text-sm font-medium"
      >
        重试统计
      </button>
    </div>
  );
}

function StatsCards({ stats }: { stats: StatsOverview }) {
  const empty = stats.totalInterviews === 0;

  return (
    <div className="grid min-h-[256px] grid-rows-2 gap-4">
      <div className="mira-surface flex flex-col justify-between rounded-[20px] border border-border-subtle bg-surface p-[22px]">
        <div className="text-[13px] text-muted-foreground">累计面试</div>
        <div className="flex items-baseline gap-2">
          <span className="font-display text-[34px] font-bold tabular-nums">
            {stats.totalInterviews}
          </span>
          <span className="text-[13px] text-muted-foreground">场</span>
        </div>
      </div>
      <div className="mira-surface flex flex-col justify-between rounded-[20px] border border-border-subtle bg-surface p-[22px]">
        <div className="text-[13px] text-muted-foreground">最高评级</div>
        {empty || !stats.highestGrade ? (
          <p className="m-0 max-w-[230px] text-[13px] leading-5 text-muted-foreground">
            完成首场面试后，这里会展示你的最高评级。
          </p>
        ) : (
          <div className="flex items-baseline gap-2">
            <span className="font-display text-[34px] font-bold text-orange-500">
              {stats.highestGrade}
            </span>
            <span className="text-[13px] text-muted-foreground">历史最佳</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function DashboardClient() {
  const isBrowser = useSyncExternalStore(
    subscribeToBrowser,
    () => true,
    () => false,
  );
  const localNow = isBrowser ? new Date() : null;
  const { data: user } = useMeQuery();
  const statsQuery = useOverviewStats();
  const nickname = user?.nickname?.trim() || "Mira 用户";

  return (
    <>
      <div className="mb-[30px] min-h-[58px]">
        {localNow ? (
          <h1 className="m-0 mb-1.5 text-[27px] font-bold tracking-[-0.02em]">
            {greetingForHour(localNow.getHours())}，{nickname} 👋
          </h1>
        ) : (
          <div aria-label="问候加载中" className="mb-2 h-8 w-56 animate-pulse rounded bg-muted" />
        )}
        <p className="m-0 min-h-5 text-[14.5px] text-muted-foreground">
          {statsQuery.isError
            ? "训练统计暂时不可用，仍可继续准备下一场面试。"
            : motivation(statsQuery.data, localNow)}
        </p>
      </div>

      <div className="mira-stagger mb-4 grid grid-cols-1 gap-4 md:grid-cols-[1.4fr_1fr]">
        <div className="relative min-h-[256px] overflow-hidden rounded-[20px] border border-primary/15 bg-primary-soft p-[30px] shadow-[0_24px_60px_-40px_rgba(249,115,22,0.4)]">
          <div
            className="absolute -top-[60px] -right-[30px] h-60 w-60"
            style={{
              background: "radial-gradient(circle, rgba(249,115,22,.22), transparent 65%)",
            }}
          />
          <div
            className="absolute -bottom-[70px] -left-[50px] h-56 w-56"
            style={{
              background: "radial-gradient(circle, rgba(249,115,22,.10), transparent 68%)",
            }}
          />
          <div className="relative">
            <div className="mb-3 font-display text-[12.5px] tracking-[0.05em] text-orange-500">
              READY WHEN YOU ARE
            </div>
            <h2 className="m-0 mb-2 text-2xl font-bold tracking-[-0.01em] text-foreground">
              准备一场新的面试
            </h2>
            <p className="m-0 mb-6 max-w-[320px] text-sm leading-[1.55] text-muted-foreground">
              上传简历、选择岗位，Mira 会为你定制一轮完整的仿真面试。
            </p>
            <Link
              href="/interview/setup"
              transitionTypes={["nav-forward"]}
              className="mira-button inline-block rounded-[11px] bg-orange-500 px-[26px] py-[13px] text-[15px] font-medium text-white shadow-[0_10px_26px_rgba(249,115,22,0.32)] hover:text-white hover:shadow-[0_14px_32px_rgba(249,115,22,0.4)]"
            >
              开始准备 →
            </Link>
          </div>
        </div>

        {statsQuery.isPending ? (
          <StatsSkeleton />
        ) : statsQuery.isError || !statsQuery.data ? (
          <StatsError retry={() => void statsQuery.refetch()} />
        ) : (
          <StatsCards stats={statsQuery.data} />
        )}
      </div>

      <DashboardResumeSection />
    </>
  );
}
