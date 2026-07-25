"use client";

import { useState } from "react";
import Link from "next/link";
import InterviewHistoryRow from "./InterviewHistoryRow";
import { useInterviewList } from "@/lib/api/interview";
import { useOverviewStats, type DimensionScores } from "@/lib/api/stats";

const PAGE_SIZE = 5;
const dimensions: Array<{ key: keyof DimensionScores; label: string }> = [
  { key: "professionalKnowledge", label: "专业知识" },
  { key: "projectDepth", label: "项目深度" },
  { key: "communicationLogic", label: "表达逻辑" },
  { key: "adaptability", label: "临场应变" },
  { key: "jobFit", label: "岗位匹配度" },
];

function FirstInterviewCta({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "mt-5" : "flex min-h-[220px] flex-col items-center justify-center px-6 py-10 text-center"}>
      {!compact && <p className="m-0 text-sm font-medium">还没有面试记录</p>}
      <p className={`text-[13px] leading-5 text-muted-foreground ${compact ? "mt-0 mb-4" : "mt-1.5 mb-5"}`}>
        完成第一场模拟面试后，这里会出现能力画像和复盘报告。
      </p>
      <Link
        href="/interview/setup"
        transitionTypes={["nav-forward"]}
        className="mira-button inline-flex min-h-10 items-center rounded-[10px] bg-orange-500 px-4 text-sm font-medium text-white hover:text-white"
      >
        开始首次面试 →
      </Link>
    </div>
  );
}

function StatisticsSkeleton() {
  return (
    <div aria-label="综合表现加载中" className="mb-4 grid min-h-[260px] grid-cols-1 gap-4 md:grid-cols-[1fr_1.5fr]">
      {[0, 1].map((item) => (
        <div key={item} className="animate-pulse rounded-[20px] border border-border-subtle bg-surface p-[26px]">
          <div className="h-4 w-24 rounded bg-muted" />
          <div className="mt-8 h-14 w-28 rounded bg-muted" />
          <div className="mt-8 h-3 w-full rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

function StatisticsError({ retry }: { retry: () => void }) {
  return (
    <section className="mb-4 flex min-h-[220px] flex-col items-start justify-center rounded-[20px] border border-border-subtle bg-surface p-[26px]">
      <h2 className="m-0 text-base font-semibold">综合表现暂时不可用</h2>
      <p className="mt-1.5 mb-4 text-[13px] text-muted-foreground">
        面试记录仍可独立查看，你可以只重试统计。
      </p>
      <button type="button" onClick={retry} className="mira-button rounded-[10px] border border-border px-4 py-2 text-sm font-medium">
        重试统计
      </button>
    </section>
  );
}

function StatisticsCards({
  grade,
  summary,
  basedOn,
  scores,
}: {
  grade: string | null;
  summary: string | null;
  basedOn: number;
  scores: DimensionScores | null;
}) {
  const hasOverview = grade !== null && scores !== null;

  return (
    <section className="mira-stagger mb-4 grid grid-cols-1 gap-4 md:grid-cols-[1fr_1.5fr]" aria-label="综合表现">
      <div className="mira-surface flex min-h-[260px] flex-col justify-between rounded-[20px] border border-border-subtle bg-surface p-[26px]">
        <div className="font-display text-[12.5px] tracking-[0.05em] text-orange-500">OVERALL GRADE</div>
        {hasOverview ? (
          <>
            <div className="mt-4 flex items-end gap-3">
              <span className="font-display text-[64px] leading-[0.9] font-bold text-orange-500">{grade}</span>
              <span className="mb-1.5 text-[13px] text-muted-foreground">综合评级</span>
            </div>
            <p className="m-0 mt-3 text-[13px] leading-[1.6] text-muted-foreground">
              {summary || `基于最近 ${basedOn} 场已出报告面试的加权表现。`}
            </p>
          </>
        ) : (
          <FirstInterviewCta compact />
        )}
      </div>

      <div className="mira-surface min-h-[260px] rounded-[20px] border border-border-subtle bg-surface p-[26px]">
        <h2 className="mb-5 text-sm font-semibold">能力维度</h2>
        {scores ? (
          <div className="flex flex-col gap-4">
            {dimensions.map(({ key, label }) => {
              const score = Math.max(0, Math.min(100, scores[key]));
              return (
                <div key={key}>
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-[13px] text-muted-foreground">{label}</span>
                    <span className="font-display text-[13px] font-medium tabular-nums">{score}</span>
                  </div>
                  <div
                    role="progressbar"
                    aria-label={label}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={score}
                    className="h-[7px] w-full overflow-hidden rounded-full bg-muted"
                  >
                    <div className="h-full rounded-full bg-orange-500" style={{ width: `${score}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="m-0 text-[13px] leading-6 text-muted-foreground">
            首份报告生成后，五维能力分会显示在这里。
          </p>
        )}
      </div>
    </section>
  );
}

function HistorySkeleton() {
  return (
    <div aria-label="面试记录加载中" className="min-h-[330px] animate-pulse px-6 py-4">
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="flex items-center gap-4 border-b border-muted py-5 last:border-0">
          <div className="h-11 w-11 rounded-[11px] bg-muted" />
          <div className="flex-1">
            <div className="h-4 w-36 rounded bg-muted" />
            <div className="mt-2 h-3 w-52 max-w-full rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function InterviewsClient() {
  const [page, setPage] = useState(1);
  const statsQuery = useOverviewStats();
  const listQuery = useInterviewList({ page, size: PAGE_SIZE });
  const list = listQuery.data;
  const totalPages = list ? Math.max(1, Math.ceil(list.total / list.size)) : 1;

  return (
    <>
      <header className="mb-[30px]">
        <h1 className="m-0 mb-1.5 text-[27px] font-bold tracking-[-0.02em]">我的面试</h1>
        <p className="m-0 text-[14.5px] text-muted-foreground">你的面试综合表现与每一场的复盘记录都在这里。</p>
      </header>

      {statsQuery.isPending ? (
        <StatisticsSkeleton />
      ) : statsQuery.isError || !statsQuery.data ? (
        <StatisticsError retry={() => void statsQuery.refetch()} />
      ) : (
        <StatisticsCards
          grade={statsQuery.data.overallGrade}
          summary={statsQuery.data.overallSummary}
          basedOn={statsQuery.data.basedOnCompletedInterviews}
          scores={statsQuery.data.dimensionScores}
        />
      )}

      <section className="animate-mira-soft-pop overflow-hidden rounded-[20px] border border-border-subtle bg-surface [animation-delay:.16s]" aria-label="全部面试">
        <div className="flex min-h-[65px] items-center justify-between border-b border-muted px-5 py-4 sm:px-6">
          <h2 className="m-0 text-base font-semibold">全部面试</h2>
          <span className="font-display text-[13px] text-muted-foreground">
            {list
              ? `共 ${list.total} 场`
              : listQuery.isError
                ? "场次暂不可用"
                : "正在统计…"}
          </span>
        </div>

        {listQuery.isPending ? (
          <HistorySkeleton />
        ) : listQuery.isError || !list ? (
          <div className="flex min-h-[260px] flex-col items-center justify-center px-6 text-center">
            <p className="m-0 text-sm font-medium">面试记录加载失败</p>
            <p className="mt-1.5 mb-4 text-[13px] text-muted-foreground">综合表现不受影响，请单独重试记录。</p>
            <button type="button" onClick={() => void listQuery.refetch()} className="mira-button rounded-[10px] border border-border px-4 py-2 text-sm font-medium">
              重试记录
            </button>
          </div>
        ) : list.total === 0 ? (
          <FirstInterviewCta />
        ) : (
          <>
            <div className={listQuery.isPlaceholderData ? "opacity-65 transition-opacity" : "transition-opacity"} aria-busy={listQuery.isFetching}>
              {list.items.map((item, index) => (
                <InterviewHistoryRow key={item.sessionId} item={item} isLast={index === list.items.length - 1} />
              ))}
            </div>
            <div className="flex flex-col gap-3 border-t border-muted px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <span className="text-[12.5px] text-muted-foreground">
                第 {list.page} / {totalPages} 页
                {listQuery.isFetching && <span role="status"> · 正在加载下一页…</span>}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page <= 1 || listQuery.isFetching}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  className="mira-button min-h-10 rounded-[10px] border border-border px-4 text-sm disabled:cursor-not-allowed disabled:opacity-45"
                >
                  上一页
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages || listQuery.isFetching}
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  className="mira-button min-h-10 rounded-[10px] border border-border px-4 text-sm disabled:cursor-not-allowed disabled:opacity-45"
                >
                  下一页
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </>
  );
}
