"use client";

import { useState } from "react";
import Link from "next/link";
import Logo from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useReport, type FollowUpReview, type ReportQuestion } from "@/lib/api/report";
import { useOverviewStats, type Grade } from "@/lib/api/stats";
import { difficultyLabel, phaseLabel } from "@/lib/interview-options";
import RadarChart from "./RadarChart";

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
  if (typeof item.question !== "string" && typeof item.answer !== "string") return null;
  return {
    question: typeof item.question === "string" ? item.question : undefined,
    answer: typeof item.answer === "string" ? item.answer : undefined,
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

export default function ReportClient({ sessionId }: { sessionId: string }) {
  const [expanded, setExpanded] = useState(false);
  const { data, isPending, isError, refetch } = useReport(sessionId);
  const { data: overview } = useOverviewStats();

  if (isPending) {
    return (
      <div className="min-h-screen bg-surface-subtle">
        <ReportHeader />
        <ReportSkeleton />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="min-h-screen bg-surface-subtle">
        <ReportHeader />
        <main className="mx-auto flex min-h-[620px] max-w-lg items-center px-6 text-center">
          <div className="w-full rounded-2xl border border-border bg-surface p-8">
            <h1 className="mb-2 text-2xl font-semibold">暂时无法加载报告</h1>
            <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
              报告可能还在生成，或者网络刚刚开了小差。你可以稍后再试。
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

  const visible = expanded ? data.questions : data.questions.slice(0, 3);
  const hiddenCount = data.questions.length - visible.length;

  return (
    <div data-session={sessionId} className="min-h-screen bg-surface-subtle">
      <ReportHeader />
      <main className="animate-mira-page-in mx-auto max-w-[920px] px-6 pt-10 pb-20 md:px-8">
        <div className="mb-2 flex flex-wrap items-center gap-2 font-display text-[13px] text-muted-foreground">
          <span>INTERVIEW REPORT · {formatDate(data.createdAt)}</span>
          {data.partial ? (
            <span className="rounded-full bg-grade-b/15 px-2.5 py-1 font-medium text-grade-b">
              部分完成
            </span>
          ) : null}
        </div>
        <h1 className="mb-7 text-[30px] font-bold tracking-[-0.02em]">
          {data.jobTitle} 面试报告
        </h1>

        <section className="mb-5 grid gap-6 rounded-[20px] border border-border-subtle bg-surface p-6 md:grid-cols-[220px_1fr] md:p-7">
          <div className="flex flex-col justify-center text-center md:border-r md:border-muted md:pr-7">
            <div
              className={`font-display text-[60px] leading-none font-bold ${gradeClasses[data.grade]}`}
            >
              {data.grade}
            </div>
            <div className="mt-1.5 text-[12.5px] text-muted-foreground">综合评级</div>
            <div className="mt-4 font-display text-3xl font-bold tabular-nums">
              {data.totalScore}
              <span className="text-sm font-normal text-muted-foreground"> / 100</span>
            </div>
            <div className="mt-4 space-y-1 text-xs text-muted-foreground">
              <div>
                {difficultyLabel(data.config.difficulty)} · {data.config.durationMin} 分钟
              </div>
              <div>{data.questions.length} 道题目</div>
            </div>
          </div>
          {data.dimensionScores ? (
            <RadarChart
              scores={data.dimensionScores}
              historyScores={overview?.dimensionScores}
            />
          ) : (
            <div className="flex min-h-[300px] items-center justify-center rounded-2xl border border-dashed border-border text-sm text-muted-foreground">
              这份历史报告暂无完整的五维数据
            </div>
          )}
        </section>

        <section className="mb-5 rounded-2xl border border-primary/20 bg-primary-soft px-6 py-5">
          <h2 className="mb-2 text-[13px] font-semibold text-primary">总体评语</h2>
          <p className="text-sm leading-[1.7]">{data.summary}</p>
        </section>

        <div className="mb-9 grid gap-4 sm:grid-cols-2">
          <SummaryList title="表现亮点" items={data.highlights} tone="positive" />
          <SummaryList title="提升方向" items={data.weaknesses} tone="warning" />
        </div>

        <div className="mb-[18px] flex items-center justify-between">
          <h2 className="text-[19px] font-semibold">逐题复盘</h2>
          <span className="text-[13px] text-muted-foreground">
            共 {data.questions.length} 题
          </span>
        </div>

        {data.questions.length === 0 ? (
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
    </div>
  );
}

function ReportHeader() {
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
        <button
          disabled
          title="报告导出将在 T-118 开放"
          className="hidden rounded-[9px] border border-border bg-surface px-4 py-2 text-[13px] text-muted-foreground opacity-60 sm:block"
        >
          导出 PDF
        </button>
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
            用时 {formatDuration(actualSeconds)}
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
            思考 {formatDuration(question.thinkSeconds)} · 回答{" "}
            {formatDuration(question.answerSeconds)}
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
          <ol className="ml-2 border-l-2 border-primary/20 pl-4">
            {followUps.map((item, index) => (
              <li key={`${item.question}-${index}`} className="relative mb-3 last:mb-0">
                <span className="absolute top-1.5 -left-[21px] h-2 w-2 rounded-full bg-primary" />
                {item.question ? (
                  <p className="text-[13px] font-medium">{item.question}</p>
                ) : null}
                {item.answer ? (
                  <p className="mt-1 text-[13px] text-muted-foreground">{item.answer}</p>
                ) : null}
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
