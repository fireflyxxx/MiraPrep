"use client";

import type { Ref } from "react";
import VoiceRecorder, {
  type VoiceRecorderHandle,
} from "./VoiceRecorder";
import Waveform from "./Waveform";

const MAX_ANSWER_LENGTH = 2_000;

export interface UnifiedAnswerComposerProps {
  answerLocked: boolean;
  answerText: string;
  asrFinal: boolean;
  isRecording: boolean;
  isSubmitting: boolean;
  isVoiceConnecting: boolean;
  onAnswerChange: (value: string) => void;
  onAudioFrame: (frame: Uint8Array) => void;
  onBeforeVoiceStart: () => boolean | Promise<boolean>;
  onRecorderError: (message: string) => void;
  onRecordingChange: (recording: boolean) => void;
  onSilence: () => void;
  onSubmit: () => void;
  onVoiceLevelChange: (level: number) => void;
  recorderRef?: Ref<VoiceRecorderHandle>;
  submitDisabled: boolean;
  voiceLevel: number;
}

export default function UnifiedAnswerComposer({
  answerLocked,
  answerText,
  asrFinal,
  isRecording,
  isSubmitting,
  isVoiceConnecting,
  onAnswerChange,
  onAudioFrame,
  onBeforeVoiceStart,
  onRecorderError,
  onRecordingChange,
  onSilence,
  onSubmit,
  onVoiceLevelChange,
  recorderRef,
  submitDisabled,
  voiceLevel,
}: UnifiedAnswerComposerProps) {
  const recorderLabel = isVoiceConnecting ? "正在连接语音…" : "语音输入";

  return (
    <div
      data-testid="unified-answer-composer"
      className="overflow-hidden rounded-[24px] border border-black/10 bg-white/95 text-[#171717] shadow-[0_26px_72px_-34px_rgba(0,0,0,.34),0_12px_36px_-24px_rgba(249,115,22,.28)] ring-1 ring-black/[0.025] backdrop-blur-xl transition-[border-color,box-shadow] focus-within:border-orange-400/70 focus-within:shadow-[0_28px_76px_-32px_rgba(0,0,0,.38),0_14px_40px_-22px_rgba(249,115,22,.34)] dark:border-white/12 dark:bg-[#17191f]/92 dark:text-[#f4f4f2] dark:shadow-[0_26px_72px_-28px_rgba(0,0,0,.9),0_12px_36px_-18px_rgba(249,115,22,.34)] dark:ring-white/[0.04]"
    >
      {isRecording ? (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none mx-3 mt-3 flex min-h-11 items-center gap-3 rounded-[14px] border border-orange-200/80 bg-orange-50/75 px-3 text-xs text-orange-800 dark:border-orange-400/20 dark:bg-orange-500/[0.08] dark:text-orange-100"
        >
          <span
            aria-hidden="true"
            className="h-2 w-2 shrink-0 rounded-full bg-orange-500 shadow-[0_0_0_4px_rgba(249,115,22,.12)]"
          />
          <span className="shrink-0 font-semibold">正在聆听</span>
          <Waveform level={voiceLevel} active />
          <span className="ml-auto hidden text-[11px] text-orange-700/70 sm:inline dark:text-orange-100/55">
            实时转写中
          </span>
        </div>
      ) : null}

      <textarea
        aria-label="你的回答"
        value={answerText}
        onChange={(event) => onAnswerChange(event.target.value)}
        onKeyDown={(event) => {
          if (
            event.key === "Enter" &&
            !event.shiftKey &&
            !submitDisabled &&
            !isRecording
          ) {
            event.preventDefault();
            onSubmit();
          }
        }}
        disabled={answerLocked}
        maxLength={MAX_ANSWER_LENGTH}
        rows={3}
        placeholder="输入回答，或点击下方麦克风开始语音输入……"
        className="max-h-40 min-h-24 w-full resize-none border-0 bg-transparent px-5 py-4 text-[15px] leading-7 text-[#171717] outline-none placeholder:text-[#a3a3a3] disabled:cursor-not-allowed disabled:opacity-55 dark:text-[#f4f4f2] dark:placeholder:text-[#737780] sm:min-h-28 sm:px-6 sm:py-5"
      />

      <div className="flex flex-wrap items-center gap-2.5 border-t border-black/[0.07] bg-[#fcfbf9]/85 px-3 py-2.5 dark:border-white/[0.08] dark:bg-black/10">
        <VoiceRecorder
          ref={recorderRef}
          disabled={answerLocked || isVoiceConnecting}
          labels={{ idle: recorderLabel, recording: "停止并转写" }}
          onAudioFrame={onAudioFrame}
          onBeforeStart={onBeforeVoiceStart}
          onError={onRecorderError}
          onLevelChange={onVoiceLevelChange}
          onRecordingChange={onRecordingChange}
          onSilence={onSilence}
          showWaveform={false}
          variant="compact"
        />
        <span className="hidden text-[11px] text-[#8a8179] md:inline dark:text-[#92969e]">
          转写会写入当前答案，也可以直接键盘修改
        </span>
        {asrFinal ? (
          <span className="text-[11px] text-emerald-700 dark:text-emerald-300">
            转写完成
          </span>
        ) : null}
        <span className="ml-auto text-[11px] tabular-nums text-[#9a928b] dark:text-[#7f838b]">
          {answerText.length} / {MAX_ANSWER_LENGTH}
        </span>
        <button
          type="button"
          aria-label="提交回答"
          onClick={onSubmit}
          disabled={submitDisabled || isRecording}
          className="mira-button flex h-11 shrink-0 items-center rounded-full bg-[#26211d] px-4 text-sm font-semibold text-white shadow-[0_10px_24px_-14px_rgba(38,33,29,.75)] hover:bg-black disabled:cursor-not-allowed disabled:bg-black/10 disabled:text-black/35 disabled:shadow-none dark:bg-orange-500 dark:hover:bg-orange-400 dark:disabled:bg-white/10 dark:disabled:text-white/35"
        >
          {isSubmitting ? "正在提交…" : "提交回答"}
          <span aria-hidden="true" className="ml-1.5">
            →
          </span>
        </button>
      </div>
    </div>
  );
}
