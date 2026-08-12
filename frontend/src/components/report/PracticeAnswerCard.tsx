"use client";

import type { Ref } from "react";
import { RotateCcw, X } from "lucide-react";
import type { InterviewRuntimeState } from "@/components/interview/InterviewRuntimeTypes";
import TTSPlayer from "@/components/interview/TTSPlayer";
import UnifiedAnswerComposer from "@/components/interview/UnifiedAnswerComposer";
import type { VoiceRecorderHandle } from "@/components/interview/VoiceRecorder";
import type { ReportQuestion } from "@/lib/api/report";
import type { PracticeTarget } from "@/lib/api/practice";

export interface PracticeAnswerCardProps extends InterviewRuntimeState {
  question: ReportQuestion;
  target: PracticeTarget;
  activeQuestionText: string;
  isVoiceConnecting: boolean;
  onBeforeVoiceStart: () => boolean | Promise<boolean>;
  onVoiceLevelChange: (level: number) => void;
  onRequestClose: () => void;
  recorderRef: Ref<VoiceRecorderHandle>;
  voiceLevel: number;
}

export default function PracticeAnswerCard({
  question,
  target,
  activeQuestionText,
  onRequestClose,
  answerText,
  asrFinal,
  canReplayQuestionAudio,
  connection,
  errorMessage,
  isEnded,
  isLoading,
  isRecording,
  isSubmitting,
  isThinking,
  isVoiceConnecting,
  handleRecorderError,
  handleRecordingChange,
  handleSilence,
  handleTtsSpeakingChange,
  replayQuestionAudio,
  onBeforeVoiceStart,
  onVoiceLevelChange,
  recorderRef,
  retryConnection,
  sendAudioFrame,
  setAnswerText,
  setTtsPlayerHandle,
  submitAnswer,
  voiceLevel,
}: PracticeAnswerCardProps) {
  const answerLocked =
    isLoading || isSubmitting || isThinking || isEnded;
  const submitDisabled =
    answerLocked ||
    isRecording ||
    connection !== "connected" ||
    !answerText.trim();

  return (
          <section
            data-testid="practice-answer-card"
            className="flex max-h-[calc(100dvh-1rem)] min-h-[560px] flex-col overflow-hidden bg-surface text-foreground sm:max-h-[min(780px,calc(100dvh-2rem))] sm:rounded-[22px]"
          >
            <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-7 sm:py-5">
              <div>
                <p className="font-display m-0 text-[10px] font-semibold tracking-[0.18em] text-primary uppercase">
                  Focused practice
                </p>
                <h2 className="mt-1 text-xl font-semibold tracking-[-0.02em] sm:text-2xl">
                  {target.targetType === "MAIN_QUESTION" ? "重练主问题" : "重练此追问"}
                </h2>
              </div>
              <button
                type="button"
                aria-label="关闭单题练习"
                onClick={onRequestClose}
                className="mira-button inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-subtle text-muted-foreground hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
              <section className="rounded-2xl border border-primary/20 bg-primary-soft px-4 py-4 sm:px-5">
                <div
                  data-testid="practice-question-layout"
                  className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
                >
                  <div className="min-w-0">
                    <div className="font-display text-[10px] font-semibold tracking-[0.14em] text-primary uppercase">
                      {target.targetType === "MAIN_QUESTION"
                        ? `Question ${String(question.order).padStart(2, "0")}`
                        : `Follow-up ${String((target.followUpIndex ?? 0) + 1).padStart(2, "0")}`}
                    </div>
                    <p className="mt-2 text-[15px] leading-7 font-semibold tracking-[-0.01em] sm:text-base">
                      {activeQuestionText}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1 self-end sm:self-auto">
                    <TTSPlayer
                      ref={setTtsPlayerHandle}
                      onSpeakingChange={handleTtsSpeakingChange}
                      labels={{
                        mute: "关闭题目语音",
                        unmute: "开启题目语音",
                        idle: "题目语音开启",
                        muted: "题目已静音",
                        speaking: "题目播放中",
                      }}
                    />
                    <button
                      type="button"
                      aria-label="重播题目"
                      title="重播题目"
                      disabled={!canReplayQuestionAudio}
                      onClick={replayQuestionAudio}
                      className="mira-button inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface text-muted-foreground disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </section>

              <div className="mt-5">
                <UnifiedAnswerComposer
                  appearance="practice"
                  answerLocked={answerLocked}
                  answerText={answerText}
                  asrFinal={asrFinal}
                  isRecording={isRecording}
                  isSubmitting={isSubmitting}
                  isVoiceConnecting={isVoiceConnecting}
                  onAnswerChange={setAnswerText}
                  onAudioFrame={sendAudioFrame}
                  onBeforeVoiceStart={onBeforeVoiceStart}
                  onRecorderError={handleRecorderError}
                  onRecordingChange={handleRecordingChange}
                  onSilence={handleSilence}
                  onSubmit={() => void submitAnswer()}
                  onVoiceLevelChange={onVoiceLevelChange}
                  recorderRef={recorderRef}
                  submitDisabled={submitDisabled}
                  submitLabel="提交本次回答"
                  textareaLabel="本次回答"
                  voiceLevel={voiceLevel}
                />
              </div>

              {errorMessage ? (
                <div
                  role="alert"
                  className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-red-500/20 bg-red-500/[0.06] px-3 py-2.5 text-sm text-red-700 dark:text-red-300"
                >
                  <span>{errorMessage}</span>
                  {connection === "failed" ? (
                    <button
                      type="button"
                      onClick={retryConnection}
                      className="mira-button shrink-0 font-medium underline underline-offset-4"
                    >
                      重新连接
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>

            <footer className="flex shrink-0 flex-col gap-3 border-t border-border bg-surface px-5 py-4 sm:px-7">
              <div>
                <p className="m-0 text-xs font-medium text-muted-foreground">
                  {target.targetType === "MAIN_QUESTION"
                    ? "会根据回答继续追问，最多 3 次"
                    : "回答后直接生成对比反馈"}
                </p>
                <p
                  role="status"
                  aria-live="polite"
                  className="m-0 mt-1 text-[11px] text-muted-foreground/75"
                >
                  {isLoading
                    ? "正在连接练习会话…"
                    : connection === "connected"
                      ? "练习会话已连接"
                      : connection === "reconnecting"
                        ? "连接中断，正在恢复…"
                        : connection === "failed"
                          ? "连接已断开"
                          : "正在连接…"}
                </p>
              </div>
            </footer>
          </section>
  );
}
