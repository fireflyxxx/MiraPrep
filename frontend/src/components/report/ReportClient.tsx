"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import Logo from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  useExportReport,
  useReport,
  type FollowUpReview,
  type InterviewReport,
  type ReportQuestion,
} from "@/lib/api/report";
import { useOverviewStats, type DimensionScores, type Grade } from "@/lib/api/stats";
import { difficultyLabel, phaseLabel } from "@/lib/interview-options";
import HistoryTrend from "./HistoryTrend";
import RadarChart from "./RadarChart";
import ShareDialog from "./ShareDialog";

const gradeClasses: Record<Grade, string> = {
  S: "text-grade-s",
  A: "text-grade-a",
  B: "text-grade-b",
  C: "text-grade-c",
  D: "text-grade-d",
};

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "日期未知"
    : new Intl.DateTimeFormat("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(date);
}

function formatDuration(seconds: number | null) {
  if (seconds === null) return "未记录";
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder ? `${minutes} 分 ${remainder} 秒` : `${minutes} 分钟`;
}

function toFollowUp(value: unknown): FollowUpReview | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (
    typeof item.question !== "string" ||
    typeof item.answer !== "string"
  ) {
    return null;
  }
  return {
    question: item.question,
    answer: item.answer,
    answerSeconds: typeof item.answerSeconds === "number" ? item.answerSeconds : null,
    referenceAnswer:
      typeof item.referenceAnswer === "string"
        ? item.referenceAnswer
        : "该历史追问暂无参考答案",
    suggestions: (Array.isArray(item.suggestions) ? item.suggestions : []).filter(
      (suggestion): suggestion is string => typeof suggestion === "string",
    ),
  };
}

function ReportSkeleton() {
  return (
    <main
      aria-label="报告加载中"
      className="mx-auto min-h-[760px] max-w-[920px] animate-pulse px-6 pt-10 pb-20"
    >
      <div className="mb-3 h-4 w-48 rounded bg-muted" />
      <div className="mb-7 h-9 w-80 max-w-full rounded bg-muted" />
      <div className="mb-5 h-[360px] rounded-[20px] bg-muted" />
      <div className="mb-9 h-32 rounded-2xl bg-muted" />
      <div className="space-y-4">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="h-56 rounded-[18px] bg-muted" />
        ))}
      </div>
    </main>
  );
}

function ReportGenerating() {
  return (
    <main className="mx-auto flex min-h-[620px] max-w-lg items-center px-6 text-center">
      <div className="w-full rounded-2xl border border-border bg-surface p-8" role="status">
        <div className="mx-auto mb-5 h-10 w-10 animate-spin rounded-full border-2 border-primary/25 border-t-primary" />
        <h1 className="mb-2 text-2xl font-semibold">报告正在生成</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          AI 正在逐题批改并汇总五维表现，通常需要几分钟。完成后报告会自动出现，无需反复刷新。
        </p>
      </div>
    </main>
  );
}

export default function ReportClient({ sessionId }: { sessionId: string }) {
  const { data, status, isPending, isError, refetch } = useReport(sessionId);
  const { data: overview } = useOverviewStats();

  if (isPending) {
    return (
      <div className="min-h-screen bg-surface-subtle">
        <ReportHeader />
        {status === "grading" ? <ReportGenerating /> : <ReportSkeleton />}
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="min-h-screen bg-surface-subtle">
        <ReportHeader />
        <main className="mx-auto flex min-h-[620px] max-w-lg items-center px-6 text-center">
          <div className="w-full rounded-2xl border border-border bg-surface p-8">
            <h1 className="mb-2 text-2xl font-semibold">
              {status === "failed" ? "报告生成失败" : "暂时无法加载报告"}
            </h1>
            <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
              {status === "failed"
                ? "本次批改未能完成，请重新加载；若仍然失败，请稍后再试。"
                : "暂时无法确认报告状态，请检查网络后重试。"}
            </p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="mira-button rounded-xl bg-primary px-5 py-2.5 text-primary-foreground"
            >
              重新加载
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div data-session={sessionId} className="min-h-screen bg-surface-subtle">
      <ReportHeader sessionId={sessionId} />
      <ReportBody
        report={data}
        historyScores={overview?.dimensionScores}
        trend={
          <HistoryTrend
            jobDirection={data.config.jobDirection}
            jobTitle={data.config.jobTitle}
            currentSessionId={data.sessionId}
          />
        }
      />
    </div>
  );
}

/**
 * 报告正文。本人视角的 `/report/[sessionId]` 和公开分享页共用这一份渲染，
 * 差异只有两处：公开页不传 `trend`（历史是本人数据），以及后端已经把音频等字段脱敏成 null。
 */
export function ReportBody({
  report,
  historyScores,
  trend,
}: {
  report: InterviewReport;
  historyScores?: DimensionScores | null;
  trend?: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? report.questions : report.questions.slice(0, 3);
  const hiddenCount = report.questions.length - visible.length;

  return (
    <main className="animate-mira-page-in mx-auto max-w-[920px] px-6 pt-10 pb-20 md:px-8">
      <div className="mb-2 flex flex-wrap items-center gap-2 font-display text-[13px] text-muted-foreground">
        <span>INTERVIEW REPORT · {formatDate(report.createdAt)}</span>
        {report.partial ? (
          <span className="rounded-full bg-grade-b/15 px-2.5 py-1 font-medium text-grade-b">
            部分完成
          </span>
        ) : null}
      </div>
      <h1 className="mb-7 text-[30px] font-bold tracking-[-0.02em]">
        {report.jobTitle} 面试报告
      </h1>

      <section className="mb-5 grid gap-6 rounded-[20px] border border-border-subtle bg-surface p-6 md:grid-cols-[220px_1fr] md:p-7">
        <div className="flex flex-col justify-center text-center md:border-r md:border-muted md:pr-7">
          <div
            className={`font-display text-[60px] leading-none font-bold ${gradeClasses[report.grade]}`}
          >
            {report.grade}
          </div>
          <div className="mt-1.5 text-[12.5px] text-muted-foreground">综合评级</div>
          <div className="mt-4 font-display text-3xl font-bold tabular-nums">
            {report.totalScore}
            <span className="text-sm font-normal text-muted-foreground"> / 100</span>
          </div>
          <div className="mt-4 space-y-1 text-xs text-muted-foreground">
            <div>
              {difficultyLabel(report.config.difficulty)} · {report.config.durationMin} 分钟
            </div>
            <div>{report.questions.length} 道题目</div>
          </div>
        </div>
        {report.dimensionScores ? (
          <RadarChart scores={report.dimensionScores} historyScores={historyScores} />
        ) : (
          <div className="flex min-h-[300px] items-center justify-center rounded-2xl border border-dashed border-border text-sm text-muted-foreground">
            这份历史报告暂无完整的五维数据
          </div>
        )}
      </section>

      <section className="mb-5 rounded-2xl border border-primary/20 bg-primary-soft px-6 py-5">
        <h2 className="mb-2 text-[13px] font-semibold text-primary">总体评语</h2>
        <p className="text-sm leading-[1.7]">{report.summary}</p>
      </section>

      <div className="mb-9 grid gap-4 sm:grid-cols-2">
        <SummaryList title="表现亮点" items={report.highlights} tone="positive" />
        <SummaryList title="提升方向" items={report.weaknesses} tone="warning" />
      </div>

      {trend ? (
        <section className="mb-9 rounded-[20px] border border-border-subtle bg-surface p-6">
          <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[19px] font-semibold">同岗位历史趋势</h2>
            <span className="text-[13px] text-muted-foreground">
              {report.config.jobTitle} · 仅统计完整场次
            </span>
          </div>
          <p className="mb-4 text-[13px] text-muted-foreground">
            空心圈标出的是本场成绩在整条走势里的位置。
          </p>
          {trend}
        </section>
      ) : null}

      <div className="mb-[18px] flex items-center justify-between">
        <h2 className="text-[19px] font-semibold">逐题复盘</h2>
        <span className="text-[13px] text-muted-foreground">
          共 {report.questions.length} 题
        </span>
      </div>

      {report.questions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface p-10 text-center text-sm text-muted-foreground">
          本次没有可复盘的题目
        </div>
      ) : (
        <div className="flex flex-col gap-3.5">
          {visible.map((question) => (
            <QuestionReview key={question.questionId} question={question} />
          ))}

          {hiddenCount > 0 ? (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="mira-button cursor-pointer p-2 text-center text-[13.5px] text-primary"
              aria-label={`展开其余 ${hiddenCount} 题`}
            >
              展开其余 {hiddenCount} 题 ↓
            </button>
          ) : null}
          {expanded ? (
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="mira-button cursor-pointer p-2 text-center text-[13.5px] text-muted-foreground"
            >
              收起 ↑
            </button>
          ) : null}
        </div>
      )}
    </main>
  );
}

function ReportHeader({ sessionId }: { sessionId?: string }) {
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border-subtle bg-surface/92 px-4 py-4 backdrop-blur-[12px] sm:px-6 md:px-7">
      <div className="flex items-center gap-3 sm:gap-4">
        <Logo />
        <Link
          href="/dashboard"
          transitionTypes={["nav-back"]}
          className="mira-button rounded-[9px] border border-border bg-surface px-3.5 py-2 text-[13px] text-muted-foreground"
        >
          ← 工作台
        </Link>
      </div>
      <div className="flex items-center gap-2.5">
        <ThemeToggle />
        {sessionId ? <ShareDialog sessionId={sessionId} /> : null}
        {sessionId ? <ExportButton sessionId={sessionId} /> : null}
        <Link
          href="/interview/setup"
          transitionTypes={["nav-forward"]}
          className="mira-button rounded-[9px] bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground"
        >
          再练一场
        </Link>
      </div>
    </header>
  );
}

/** 导出只在报告已经就绪时出现：报告还没生成时后端也只会返回 404。 */
function ExportButton({ sessionId }: { sessionId: string }) {
  const exportReport = useExportReport(sessionId);
  return (
    <button
      type="button"
      onClick={() => exportReport.mutate()}
      disabled={exportReport.isPending}
      aria-busy={exportReport.isPending}
      className="mira-button hidden rounded-[9px] border border-border bg-surface px-4 py-2 text-[13px] text-muted-foreground disabled:cursor-not-allowed disabled:opacity-60 sm:block"
    >
      {exportReport.isPending ? "导出中…" : "导出 PDF"}
    </button>
  );
}

function SummaryList({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "positive" | "warning";
}) {
  const classes =
    tone === "positive"
      ? "border-grade-s/20 bg-grade-s/5 text-grade-s"
      : "border-grade-b/20 bg-grade-b/5 text-grade-b";
  return (
    <section className={`rounded-2xl border p-5 ${classes}`}>
      <h2 className="mb-2 text-sm font-semibold">{title}</h2>
      {items.length ? (
        <ul className="space-y-1.5 text-sm text-foreground">
          {items.map((item, index) => (
            <li key={`${item}-${index}`}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">暂无内容</p>
      )}
    </section>
  );
}

function QuestionReview({ question }: { question: ReportQuestion }) {
  const score = question.score;
  const qualitative =
    score === null ? "未评分" : score >= 8 ? "优秀" : score >= 6 ? "良好" : "待提升";
  const scoreClass =
    score === null
      ? "text-muted-foreground bg-muted"
      : score >= 8
        ? "text-grade-s bg-grade-s"
        : score >= 6
          ? "text-grade-a bg-grade-a"
          : "text-grade-c bg-grade-c";
  const actualSeconds =
    question.thinkSeconds === null && question.answerSeconds === null
      ? null
      : (question.thinkSeconds ?? 0) + (question.answerSeconds ?? 0);
  const overtime =
    actualSeconds !== null &&
    question.suggestedSeconds !== null &&
    actualSeconds > question.suggestedSeconds
      ? actualSeconds - question.suggestedSeconds
      : 0;
  const followUps = question.followUpChain
    .map(toFollowUp)
    .filter((item): item is FollowUpReview => item !== null);

  return (
    <article className="mira-surface animate-mira-soft-pop overflow-hidden rounded-[18px] border border-border-subtle bg-surface">
      <div className="flex items-start gap-3.5 border-b border-muted px-5 py-[18px] sm:items-center sm:px-[22px]">
        <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg bg-foreground font-display text-[13px] text-background">
          Q{question.order}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[14.5px] leading-[1.5] font-medium">{question.text}</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
              {phaseLabel(question.phase)}
            </span>
            {question.focusPoints.map((point, index) => (
              <span
                key={`${point}-${index}`}
                className="rounded-full bg-primary-soft px-2 py-0.5 text-[11px] text-primary"
              >
                {point}
              </span>
            ))}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className={`font-display text-[15px] font-semibold ${scoreClass.split(" ")[0]}`}>
            {qualitative} {score === null ? "" : `${score}/10`}
          </div>
          <div className="mt-1 text-[11.5px] text-muted-foreground">
            {question.answer === null ? "未作答" : `用时 ${formatDuration(actualSeconds)}`}
          </div>
          {overtime > 0 ? (
            <div className="mt-1 text-[11.5px] font-medium text-grade-a">
              超出建议 {overtime} 秒
            </div>
          ) : null}
        </div>
      </div>

      <div className="px-5 pt-4 sm:px-[22px]">
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full rounded-full ${scoreClass.split(" ")[1]}`}
            style={{ width: `${(score ?? 0) * 10}%` }}
          />
        </div>
        <div className="mt-2 flex flex-wrap justify-between gap-2 text-[11.5px] text-muted-foreground">
          <span>
            {question.answer === null
              ? "本题未作答"
              : `本题作答 ${formatDuration(actualSeconds)}`}
          </span>
          <span>建议 {formatDuration(question.suggestedSeconds)}</span>
        </div>
      </div>

      <div className="grid gap-5 px-5 py-[18px] sm:grid-cols-2 sm:px-[22px]">
        <div>
          <h3 className="mb-2 text-xs font-medium text-muted-foreground">你的回答</h3>
          <p className="text-[13.5px] leading-relaxed">
            {question.answer || "本题没有记录到回答"}
          </p>
          {question.audioUrl ? (
            <audio className="mt-3 w-full" controls src={question.audioUrl}>
              浏览器不支持音频播放。
            </audio>
          ) : null}
        </div>
        <div>
          <h3 className="mb-2 text-xs font-medium text-primary">参考答案要点</h3>
          <p className="text-[13.5px] leading-relaxed">
            {question.referenceAnswer || "暂无参考答案"}
          </p>
        </div>
      </div>

      {followUps.length ? (
        <div className="border-t border-muted px-5 py-4 sm:px-[22px]">
          <h3 className="mb-3 text-xs font-medium text-muted-foreground">追问链</h3>
          <ol className="space-y-3">
            {followUps.map((item, index) => (
              <li
                key={`${item.question}-${index}`}
                className="rounded-xl border border-primary/15 bg-primary-soft/35 p-4"
              >
                <div className="mb-2 flex items-start justify-between gap-3">
                  <p className="text-[13px] font-medium">
                    追问 {index + 1} · {item.question}
                  </p>
                  <span className="shrink-0 text-[11.5px] text-muted-foreground">
                    追问用时 {formatDuration(item.answerSeconds)}
                  </span>
                </div>
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                  <strong className="font-medium text-foreground">你的回答：</strong>
                  {item.answer}
                </p>
                <p className="mt-2 text-[13px] leading-relaxed">
                  <strong className="font-medium text-primary">参考答案：</strong>
                  {item.referenceAnswer}
                </p>
                <p className="mt-2 text-[13px] leading-relaxed">
                  <strong className="font-medium">本条建议：</strong>
                  {item.suggestions.join("；")}
                </p>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      <div className="border-t border-muted bg-surface-subtle px-5 py-3.5 text-[13px] leading-relaxed sm:px-[22px]">
        <strong>建议：</strong>
        {question.suggestions.length ? question.suggestions.join("；") : "继续保持当前答题节奏。"}
      </div>
    </article>
  );
}
