"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  usePracticeResult,
  type CreatePracticeResponse,
  type PracticeAttempt,
} from "@/lib/api/practice";
import type { ReportQuestion } from "@/lib/api/report";
import { endInterviewRuntime } from "@/lib/api/interview-stream";
import PracticeRuntimeCard from "./PracticeRuntimeCard";

type PracticeStage = "creating" | "active" | "grading" | "failed" | "ready";

interface PracticeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  question: ReportQuestion;
  created: CreatePracticeResponse | null;
  createError: string | null;
  onRetry: () => void;
}

export default function PracticeDialog({
  open,
  onOpenChange,
  question,
  created,
  createError,
  onRetry,
}: PracticeDialogProps) {
  const [stage, setStage] = useState<"active" | "grading">("active");
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);
  const practiceSessionId = created ? String(created.practiceSessionId) : null;
  const result = usePracticeResult(
    practiceSessionId,
    open && stage === "grading",
  );

  const resultFailed = createError !== null || result.isError || result.data?.status === "failed";
  const effectiveStage: PracticeStage = resultFailed
    ? "failed"
    : result.data?.status === "ready"
      ? "ready"
      : created === null
        ? "creating"
        : stage;
  const effectiveFailureMessage = createError ?? (result.isError
    ? result.error instanceof Error
      ? result.error.message
      : "暂时无法读取练习结果，请稍后重试。"
    : result.data?.status === "failed"
      ? "本次单题批改未能完成，请重新练习一次。"
      : null);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && effectiveStage === "active") {
      setConfirmCloseOpen(true);
      return;
    }
    if (!nextOpen && effectiveStage === "creating") return;
    onOpenChange(nextOpen);
  };

  const active = effectiveStage === "active" && practiceSessionId !== null;
  const comparison = effectiveStage === "ready" ? result.data : null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={!active && effectiveStage !== "creating"}
        className={
          active
            ? "max-h-[calc(100dvh-1rem)] max-w-[720px] gap-0 overflow-hidden bg-transparent p-0 ring-0 sm:max-w-[720px]"
            : "max-h-[calc(100dvh-2rem)] max-w-2xl overflow-y-auto p-0 sm:max-w-2xl"
        }
      >
        <DialogTitle className="sr-only">重练此题</DialogTitle>
        <DialogDescription className="sr-only">
          回答来源面试中的一道题，并查看本次与上次的评分对比。
        </DialogDescription>

        {effectiveStage === "creating" ? (
          <StatusPanel
            title="正在准备单题练习"
            description="正在创建独立练习会话并连接 Mira 面试官。"
            busy
          />
        ) : null}

        {active ? (
          <PracticeRuntimeCard
            sessionId={practiceSessionId}
            question={question}
            onEnded={() => setStage("grading")}
            onRequestClose={() => setConfirmCloseOpen(true)}
          />
        ) : null}

        {active && confirmCloseOpen ? (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/35 p-5 backdrop-blur-[2px]">
            <div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="practice-close-title"
              aria-describedby="practice-close-description"
              className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 text-foreground shadow-2xl"
            >
              <h2 id="practice-close-title" className="text-xl font-semibold">
                退出本次练习？
              </h2>
              <p
                id="practice-close-description"
                className="mt-2 text-sm leading-6 text-muted-foreground"
              >
                尚未提交的文字和录音会丢失，本次练习不会生成评分。
              </p>
              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  onClick={() => setConfirmCloseOpen(false)}
                  className="mira-button flex-1 rounded-xl border border-border px-4 py-2.5 text-sm font-medium"
                >
                  继续作答
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmCloseOpen(false);
                    // 只关弹窗的话，练习会话会一直挂到 15 分钟超时才被巡检收尾。
                    if (created) {
                      void endInterviewRuntime(
                        created.practiceSessionId,
                        created.runtimeToken,
                      ).catch(() => {});
                    }
                    onOpenChange(false);
                  }}
                  className="mira-button flex-1 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-medium text-white"
                >
                  退出练习
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {effectiveStage === "grading" ? (
          <StatusPanel
            title="正在批改本次回答"
            description="AI 正在复用正式面试的单题评分标准，完成后会自动显示对比。"
            busy
          />
        ) : null}

        {effectiveStage === "failed" ? (
          <StatusPanel
            title="本次练习暂未完成"
            description={effectiveFailureMessage ?? "请重新发起一次练习。"}
            actionLabel="重新练一次"
            onAction={onRetry}
          />
        ) : null}

        {comparison?.status === "ready" && comparison.source && comparison.current ? (
          <ComparisonPanel
            question={comparison.question ?? question.text}
            source={comparison.source}
            current={comparison.current}
            scoreDelta={comparison.scoreDelta}
            onClose={() => onOpenChange(false)}
            onRetry={onRetry}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function StatusPanel({
  title,
  description,
  busy = false,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  busy?: boolean;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex min-h-80 flex-col items-center justify-center bg-surface px-8 py-12 text-center">
      {busy ? (
        <div className="mb-5 h-10 w-10 animate-spin rounded-full border-2 border-primary/20 border-t-primary motion-reduce:animate-none" />
      ) : null}
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="mt-2 max-w-md leading-6 text-muted-foreground">{description}</p>
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="mira-button mt-6 rounded-xl bg-primary px-5 py-2.5 font-medium text-primary-foreground"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

function ComparisonPanel({
  question,
  source,
  current,
  scoreDelta,
  onClose,
  onRetry,
}: {
  question: string;
  source: PracticeAttempt;
  current: PracticeAttempt;
  scoreDelta: number | null;
  onClose: () => void;
  onRetry: () => void;
}) {
  const delta = scoreDelta ?? 0;
  const deltaLabel = `${delta > 0 ? "+" : ""}${delta} 分`;
  return (
    <div className="bg-surface px-5 py-6 sm:px-7">
      <div className="mb-6 pr-8">
        <div className="font-display text-xs tracking-[0.16em] text-primary uppercase">
          Practice comparison
        </div>
        <h2 className="mt-2 text-2xl font-semibold">本次回答</h2>
        <p className="mt-2 leading-6 text-muted-foreground">{question}</p>
        <span
          className={`mt-4 inline-flex rounded-full px-3 py-1 text-sm font-semibold ${
            delta >= 0
              ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
              : "bg-red-500/12 text-red-700 dark:text-red-300"
          }`}
        >
          {deltaLabel}
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <AttemptCard label="上次回答" attempt={source} muted />
        <AttemptCard label="本次回答" attempt={current} />
      </div>

      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onClose}
          className="mira-button rounded-xl border border-border px-5 py-2.5 font-medium"
        >
          返回报告
        </button>
        <button
          type="button"
          onClick={onRetry}
          className="mira-button rounded-xl bg-primary px-5 py-2.5 font-medium text-primary-foreground"
        >
          再练一次
        </button>
      </div>
    </div>
  );
}

function AttemptCard({
  label,
  attempt,
  muted = false,
}: {
  label: string;
  attempt: PracticeAttempt;
  muted?: boolean;
}) {
  return (
    <section
      className={`rounded-2xl border p-5 ${
        muted ? "border-border bg-surface-subtle" : "border-primary/25 bg-primary/[0.04]"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold">{label}</h3>
        <span className="font-display text-2xl font-bold tabular-nums">
          {attempt.score ?? "—"}
          <small className="ml-1 text-xs font-normal text-muted-foreground">分</small>
        </span>
      </div>
      <p className="mt-4 whitespace-pre-wrap leading-7">
        {attempt.answer || "本次没有可展示的回答"}
      </p>
      {attempt.suggestions.length ? (
        <div className="mt-5 border-t border-border/70 pt-4">
          <div className="text-xs font-medium text-muted-foreground">改进建议</div>
          <ul className="mt-2 space-y-2 text-sm leading-6">
            {attempt.suggestions.map((suggestion) => (
              <li key={suggestion}>· {suggestion}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
