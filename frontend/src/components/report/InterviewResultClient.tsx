"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useReport, type InterviewReport } from "@/lib/api/report";
import type { Grade } from "@/lib/api/stats";
import { difficultyLabel } from "@/lib/interview-options";
import { CountUp } from "@/lib/motion/primitives";
import { motionTransition } from "@/lib/motion/constants";
import { useReducedMotionSafe } from "@/lib/motion/use-reduced-motion";

const gradeClasses: Record<Grade, string> = {
  S: "text-grade-s",
  A: "text-grade-a",
  B: "text-grade-b",
  C: "text-grade-c",
  D: "text-grade-d",
};

const gradeRevealClasses: Record<Grade, string> = {
  S: "border-grade-s/30 bg-grade-s/10 shadow-grade-s/25",
  A: "border-grade-a/30 bg-grade-a/10 shadow-grade-a/25",
  B: "border-grade-b/30 bg-grade-b/10 shadow-grade-b/25",
  C: "border-grade-c/30 bg-grade-c/10 shadow-grade-c/25",
  D: "border-grade-d/30 bg-grade-d/10 shadow-grade-d/25",
};

const PARTICLES = [
  [8, 28],
  [18, 76],
  [34, 12],
  [50, 88],
  [67, 9],
  [79, 74],
  [91, 31],
] as const;

function formatMinutes(seconds: number) {
  if (seconds <= 0) return "—";
  return `${Math.max(1, Math.round(seconds / 60))}min`;
}

/** 追问往往占掉大半场时间，只累加主问题会把「总用时」压到实际的零头。 */
export function totalSpentSeconds(questions: InterviewReport["questions"]): number {
  return questions.reduce(
    (total, question) =>
      total +
      (question.thinkSeconds ?? 0) +
      (question.answerSeconds ?? 0) +
      question.followUpChain.reduce(
        (chainTotal, followUp) => chainTotal + (followUp.answerSeconds ?? 0),
        0,
      ),
    0,
  );
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

function ResultGenerating() {
  return (
    <div className="relative mx-auto w-full max-w-[520px] text-center" role="status">
      <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-primary-soft">
        <span className="h-9 w-9 animate-spin rounded-full border-2 border-primary/25 border-t-primary" />
      </div>
      <h1 className="mb-2 text-2xl font-semibold">正在生成面试报告</h1>
      <p className="mx-auto max-w-md text-sm leading-relaxed text-muted-foreground">
        AI 正在逐题批改并汇总五维表现，通常需要几分钟。完成后本页会自动展示结果，无需手动刷新。
      </p>
    </div>
  );
}

export default function InterviewResultClient({ sessionId }: { sessionId: string }) {
  const reducedMotion = useReducedMotionSafe();
  const { data, status, isPending, isError, refetch } = useReport(sessionId);

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

      {isPending ? (status === "grading" ? <ResultGenerating /> : <ResultSkeleton />) : null}
      {isError ? (
        <div className="relative max-w-md rounded-2xl border border-border bg-surface p-8 text-center">
          <h1 className="mb-2 text-2xl font-semibold">
            {status === "failed" ? "报告生成失败" : "评级暂时没有准备好"}
          </h1>
          <p className="mb-6 text-sm text-muted-foreground">
            {status === "failed"
              ? "本次批改未能完成，请重新发起加载；若仍然失败，请稍后再试。"
              : "暂时无法确认报告状态，请检查网络后重试。"}
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
        <motion.div
          className="relative w-full max-w-[560px] text-center"
          initial={{ opacity: 0, y: reducedMotion ? 0 : 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={motionTransition.pageIn}
        >
          <div className="mb-6 font-display text-[13px] tracking-[0.06em] text-muted-foreground">
            <span>面试已完成 · </span>
            <span>{`${data.jobTitle} · ${difficultyLabel(data.config.difficulty)}`}</span>
            {data.partial ? (
              <span className="ml-2 rounded-full bg-grade-b/15 px-2 py-1 text-grade-b">
                部分完成
              </span>
            ) : null}
          </div>

          <motion.div
            data-testid="grade-reveal"
            data-grade={data.grade}
            data-motion={reducedMotion ? "reduced" : "full"}
            className={`relative mx-auto mb-[26px] flex h-[170px] w-[170px] items-center justify-center rounded-full border bg-surface shadow-[0_18px_64px_-18px] ${gradeRevealClasses[data.grade]}`}
            initial={{ opacity: 0, scale: reducedMotion ? 1 : 0.55, rotateY: reducedMotion ? 0 : -110 }}
            animate={{ opacity: 1, scale: 1, rotateY: 0 }}
            transition={reducedMotion ? motionTransition.micro : motionTransition.ceremony}
          >
            <div
              data-testid="grade-particles"
              aria-hidden="true"
              className="pointer-events-none absolute -inset-12"
            >
              {PARTICLES.map(([left, top], index) => (
                <motion.span
                  key={`${left}-${top}`}
                  className={`absolute h-1.5 w-1.5 rounded-full bg-current ${gradeClasses[data.grade]}`}
                  style={{ left: `${left}%`, top: `${top}%` }}
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{
                    opacity: reducedMotion ? 0.32 : [0, 0.8, 0],
                    scale: reducedMotion ? 1 : [0.5, 1.5, 0.7],
                    y: reducedMotion ? 0 : [0, index % 2 ? 14 : -14],
                  }}
                  transition={{
                    duration: reducedMotion ? 0.18 : 0.75,
                    delay: reducedMotion ? 0 : index * 0.045,
                  }}
                />
              ))}
            </div>
            <div
              className="absolute -inset-px rounded-full p-1.5 motion-safe:animate-mira-progress"
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
          </motion.div>

          <h1 className="mb-2.5 text-[30px] font-bold tracking-[-0.02em]">
            本次得分 <span className="tabular-nums"><CountUp value={data.totalScore} /></span>
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
            {/* 统计的是思考+作答时长，不含面试官生成回复的等待，所以不叫「总用时」。 */}
            <Stat value={formatMinutes(totalSpentSeconds(data.questions))} label="作答用时" />
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
        </motion.div>
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
