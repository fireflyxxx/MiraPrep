"use client";

import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useReport } from "@/lib/api/report";
import type { Grade } from "@/lib/api/stats";
import { difficultyLabel } from "@/lib/interview-options";

const gradeClasses: Record<Grade, string> = {
  S: "text-grade-s",
  A: "text-grade-a",
  B: "text-grade-b",
  C: "text-grade-c",
  D: "text-grade-d",
};

function formatMinutes(seconds: number) {
  if (seconds <= 0) return "—";
  return `${Math.max(1, Math.round(seconds / 60))}min`;
}

function ResultSkeleton() {
  return (
    <div
      aria-label="评级加载中"
      className="mx-auto w-full max-w-[520px] animate-pulse text-center"
    >
      <div className="mx-auto mb-6 h-4 w-56 rounded bg-muted" />
      <div className="mx-auto mb-7 h-[170px] w-[170px] rounded-full bg-muted" />
      <div className="mx-auto mb-3 h-8 w-72 max-w-full rounded bg-muted" />
      <div className="mx-auto mb-8 h-12 w-full rounded bg-muted" />
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="h-20 rounded-2xl bg-muted" />
        ))}
      </div>
    </div>
  );
}

export default function InterviewResultClient({ sessionId }: { sessionId: string }) {
  const { data, isPending, isError, refetch } = useReport(sessionId);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-6 py-8 text-foreground">
      <div className="absolute top-6 right-6 z-10">
        <ThemeToggle />
      </div>
      <div
        className="pointer-events-none absolute top-[-12%] left-1/2 h-[640px] w-[640px] -translate-x-1/2"
        style={{
          background:
            "radial-gradient(circle, color-mix(in srgb, var(--primary) 12%, transparent), transparent 62%)",
        }}
      />

      {isPending ? <ResultSkeleton /> : null}
      {isError ? (
        <div className="relative max-w-md rounded-2xl border border-border bg-surface p-8 text-center">
          <h1 className="mb-2 text-2xl font-semibold">评级暂时没有准备好</h1>
          <p className="mb-6 text-sm text-muted-foreground">
            报告可能仍在生成，也可能遇到了网络问题，请稍后重试。
          </p>
          <div className="flex justify-center gap-3">
            <Link className="mira-button rounded-xl border border-border px-4 py-2.5" href="/dashboard">
              返回工作台
            </Link>
            <button
              className="mira-button rounded-xl bg-primary px-4 py-2.5 text-primary-foreground"
              onClick={() => void refetch()}
              type="button"
            >
              重新加载
            </button>
          </div>
        </div>
      ) : null}

      {data ? (
        <div className="animate-mira-page-in relative w-full max-w-[560px] text-center">
          <div className="mb-6 font-display text-[13px] tracking-[0.06em] text-muted-foreground">
            <span>面试已完成 · </span>
            <span>{`${data.jobTitle} · ${difficultyLabel(data.config.difficulty)}`}</span>
            {data.partial ? (
              <span className="ml-2 rounded-full bg-grade-b/15 px-2 py-1 text-grade-b">
                部分完成
              </span>
            ) : null}
          </div>

          <div className="relative mx-auto mb-[26px] flex h-[170px] w-[170px] items-center justify-center rounded-full bg-surface shadow-[0_16px_50px_-16px_color-mix(in_srgb,var(--primary)_35%,transparent)]">
            <div
              className="animate-mira-progress absolute -inset-px rounded-full p-1.5"
              style={{
                background: `conic-gradient(var(--primary) 0 ${data.totalScore}%, var(--muted) ${data.totalScore}% 100%)`,
                WebkitMask:
                  "radial-gradient(farthest-side, transparent calc(100% - 6px), #000 calc(100% - 6px))",
              }}
            />
            <div>
              <div
                className={`font-display text-[64px] leading-none font-bold ${gradeClasses[data.grade]}`}
              >
                {data.grade}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">综合评级</div>
            </div>
          </div>

          <h1 className="mb-2.5 text-[30px] font-bold tracking-[-0.02em]">
            本次得分 <span className="tabular-nums">{data.totalScore}</span>
            <span className="text-base text-muted-foreground"> / 100</span>
          </h1>
          <p className="mx-auto mb-6 max-w-[460px] text-[15px] leading-relaxed text-muted-foreground">
            {data.summary}
          </p>

          <div className="mb-7 grid gap-3 text-left sm:grid-cols-2">
            <div className="rounded-2xl border border-grade-s/20 bg-grade-s/5 p-4">
              <div className="mb-2 text-sm font-medium text-grade-s">表现亮点</div>
              <ul className="space-y-1 text-sm">
                {data.highlights.length
                  ? data.highlights
                      .slice(0, 3)
                      .map((item, index) => <li key={`${item}-${index}`}>{item}</li>)
                  : <li className="text-muted-foreground">完整报告生成后展示</li>}
              </ul>
            </div>
            <div className="rounded-2xl border border-grade-b/20 bg-grade-b/5 p-4">
              <div className="mb-2 text-sm font-medium text-grade-b">提升方向</div>
              <ul className="space-y-1 text-sm">
                {data.weaknesses.length
                  ? data.weaknesses
                      .slice(0, 3)
                      .map((item, index) => <li key={`${item}-${index}`}>{item}</li>)
                  : <li className="text-muted-foreground">暂无明显短板</li>}
              </ul>
            </div>
          </div>

          <div className="mira-stagger mb-8 grid grid-cols-3 gap-3">
            <Stat
              value={data.questions.filter((question) => question.answer).length}
              label="回答题数"
            />
            <Stat
              value={formatMinutes(
                data.questions.reduce(
                  (total, question) =>
                    total + (question.thinkSeconds ?? 0) + (question.answerSeconds ?? 0),
                  0,
                ),
              )}
              label="总用时"
            />
            <Stat value={`${data.config.durationMin}min`} label="设定时长" />
          </div>

          <div className="flex gap-3">
            <Link
              href="/dashboard"
              transitionTypes={["nav-back"]}
              className="mira-button flex-1 rounded-xl border border-border bg-surface py-3.5 text-[14.5px]"
            >
              返回工作台
            </Link>
            <Link
              href={`/report/${sessionId}`}
              transitionTypes={["nav-forward"]}
              className="mira-button flex-[1.4] rounded-xl bg-primary py-3.5 text-[14.5px] font-medium text-primary-foreground"
            >
              查看完整报告 →
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="rounded-2xl border border-border-subtle bg-surface-subtle px-3 py-[18px]">
      <div className="font-display text-2xl font-bold tabular-nums">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
