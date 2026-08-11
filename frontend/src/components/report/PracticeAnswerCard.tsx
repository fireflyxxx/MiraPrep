"use client";

import { Headphones, RotateCcw, X } from "lucide-react";
import type { InterviewRuntimeState } from "@/components/interview/InterviewRuntimeTypes";
import TTSPlayer from "@/components/interview/TTSPlayer";
import VoiceRecorder from "@/components/interview/VoiceRecorder";
import Waveform from "@/components/interview/Waveform";
import type { ReportQuestion } from "@/lib/api/report";

export interface PracticeAnswerCardProps extends InterviewRuntimeState {
  question: ReportQuestion;
  onRequestClose: () => void;
}

export default function PracticeAnswerCard({
  question,
  onRequestClose,
  answerText,
  asrFinal,
  canReplayQuestionAudio,
  connection,
  errorMessage,
  interviewerSpeaking,
  isEnded,
  isLoading,
  isRecording,
  isSubmitting,
  isThinking,
  voiceMode,
  voiceNotice,
  disableVoiceMode,
  enableVoiceMode,
  handleRecorderError,
  handleRecordingChange,
  handleSilence,
  handleTtsSpeakingChange,
  replayQuestionAudio,
  retryConnection,
  sendAudioFrame,
  setAnswerText,
  setTtsPlayerHandle,
  submitAnswer,
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
                  重新回答这道题
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
                      Question {String(question.order).padStart(2, "0")}
                    </div>
                    <p className="mt-2 text-[15px] leading-7 font-semibold tracking-[-0.01em] sm:text-base">
                      {question.text}
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

              <div
                role="group"
                aria-label="回答方式"
                className="mx-auto mt-5 flex w-fit rounded-full bg-surface-subtle p-1 text-xs"
              >
                <button
                  type="button"
                  aria-pressed={voiceMode}
                  onClick={enableVoiceMode}
                  className={`mira-button rounded-full px-4 py-2 font-medium ${
                    voiceMode
                      ? "bg-foreground text-background shadow-sm"
                      : "text-muted-foreground"
                  }`}
                >
                  语音回答
                </button>
                <button
                  type="button"
                  aria-pressed={!voiceMode}
                  onClick={disableVoiceMode}
                  className={`mira-button rounded-full px-4 py-2 font-medium ${
                    !voiceMode
                      ? "bg-foreground text-background shadow-sm"
                      : "text-muted-foreground"
                  }`}
                >
                  文字回答
                </button>
              </div>

              <div className="mt-4 rounded-2xl border border-border bg-surface p-3 shadow-[0_14px_38px_-28px_rgba(26,22,18,.45)] ring-1 ring-black/[0.02] focus-within:border-primary/55 focus-within:ring-4 focus-within:ring-primary/10">
                {voiceMode ? (
                  <div
                    data-testid="practice-voice-controls"
                    className="mb-3 flex flex-col items-center gap-2 rounded-xl bg-[#181818] px-4 py-4 text-white"
                  >
                    <div className="flex items-center gap-3">
                      <Headphones className="h-4 w-4 text-orange-300" />
                      <Waveform
                        level={interviewerSpeaking ? 0.78 : 0}
                        active={interviewerSpeaking}
                        label="题目语音播放状态"
                      />
                    </div>
                    <div>
                      <VoiceRecorder
                        disabled={
                          answerLocked || connection !== "connected"
                        }
                        onAudioFrame={sendAudioFrame}
                        onRecordingChange={handleRecordingChange}
                        onSilence={handleSilence}
                        onError={handleRecorderError}
                      />
                    </div>
                    <p className="m-0 text-center text-[11px] text-white/60">
                      {voiceNotice ?? "点击麦克风开始回答，转写可在下方编辑"}
                    </p>
                  </div>
                ) : null}

                <textarea
                  aria-label="本次回答"
                  value={answerText}
                  onChange={(event) => setAnswerText(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey && !submitDisabled) {
                      event.preventDefault();
                      void submitAnswer();
                    }
                  }}
                  disabled={answerLocked}
                  rows={6}
                  placeholder={
                    voiceMode
                      ? "实时转写会显示在这里，提交前可以继续编辑……"
                      : "用你自己的思路重新组织答案……"
                  }
                  className="min-h-36 w-full resize-y border-0 bg-transparent px-2 py-1 text-[14px] leading-7 outline-none placeholder:text-muted-foreground/65 disabled:cursor-not-allowed disabled:opacity-60"
                />

                {asrFinal && voiceMode ? (
                  <p className="m-0 px-2 pt-2 text-xs text-emerald-700 dark:text-emerald-300">
                    已收到最终转写，检查内容后即可提交
                  </p>
                ) : null}
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

            <footer className="flex shrink-0 flex-col gap-3 border-t border-border bg-surface px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
              <div>
                <p className="m-0 text-xs font-medium text-muted-foreground">
                  不会追问
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
              <button
                type="button"
                onClick={() => void submitAnswer()}
                disabled={submitDisabled}
                className="mira-button rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-[0_10px_24px_-12px_rgba(249,115,22,.65)] disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none"
              >
                {isSubmitting ? "正在提交…" : "提交本次回答"}
              </button>
            </footer>
          </section>
  );
}
