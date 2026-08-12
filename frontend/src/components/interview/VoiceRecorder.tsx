"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Mic, Square } from "lucide-react";
import Waveform from "./Waveform";

export function resampleToPcm16(
  input: Float32Array,
  inputRate: number,
  outputRate = 16_000,
): Uint8Array {
  const ratio = inputRate / outputRate;
  const outputLength = Math.max(1, Math.floor(input.length / ratio));
  const buffer = new ArrayBuffer(outputLength * 2);
  const view = new DataView(buffer);
  for (let index = 0; index < outputLength; index += 1) {
    const start = Math.floor(index * ratio);
    const end = Math.max(start + 1, Math.floor((index + 1) * ratio));
    let sum = 0;
    for (let cursor = start; cursor < end && cursor < input.length; cursor += 1) {
      sum += input[cursor];
    }
    const sample = Math.max(-1, Math.min(1, sum / Math.max(1, end - start)));
    view.setInt16(index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return new Uint8Array(buffer);
}

type AudioContextWithLegacyProcessor = AudioContext & {
  createScriptProcessor?: (
    bufferSize: number,
    numberOfInputChannels: number,
    numberOfOutputChannels: number,
  ) => ScriptProcessorNode;
};

export interface VoiceRecorderHandle {
  start(): Promise<void>;
  stop(): void;
}

export interface VoiceRecorderLabels {
  idle: string;
  recording: string;
}

interface VoiceRecorderProps {
  disabled?: boolean;
  labels?: VoiceRecorderLabels;
  onAudioFrame: (frame: Uint8Array) => void;
  onBeforeStart?: () => boolean | Promise<boolean>;
  onError: (message: string) => void;
  onLevelChange?: (level: number) => void;
  onRecordingChange: (recording: boolean) => void;
  onSilence: () => void;
  showWaveform?: boolean;
  variant?: "default" | "compact" | "inline-waveform";
}

const defaultLabels: VoiceRecorderLabels = {
  idle: "按下开始回答",
  recording: "停止并转写",
};

const VoiceRecorder = forwardRef<VoiceRecorderHandle, VoiceRecorderProps>(
  function VoiceRecorder({
  disabled,
  labels,
  onAudioFrame,
  onBeforeStart,
  onRecordingChange,
  onError,
  onLevelChange,
  onSilence,
  showWaveform = true,
  variant = "default",
}, ref) {
  const [recording, setRecording] = useState(false);
  const [level, setLevel] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const cleanupRef = useRef<(() => void) | null>(null);
  const lastSoundAtRef = useRef(0);
  const warnedRef = useRef(false);
  const pendingSamplesRef = useRef<Float32Array[]>([]);
  const pendingSampleCountRef = useRef(0);
  const sampleRateRef = useRef(16_000);

  const flushPendingSamples = () => {
    if (!pendingSampleCountRef.current) return;
    const joined = new Float32Array(pendingSampleCountRef.current);
    let offset = 0;
    for (const chunk of pendingSamplesRef.current) {
      joined.set(chunk, offset);
      offset += chunk.length;
    }
    pendingSamplesRef.current = [];
    pendingSampleCountRef.current = 0;
    onAudioFrame(resampleToPcm16(joined, sampleRateRef.current));
  };

  const stop = () => {
    flushPendingSamples();
    cleanupRef.current?.();
    cleanupRef.current = null;
    setRecording(false);
    setLevel(0);
    onLevelChange?.(0);
    onRecordingChange(false);
  };

  useEffect(() => () => cleanupRef.current?.(), []);

  useEffect(() => {
    if (!recording) {
      setElapsedSeconds(0);
      return;
    }
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1_000));
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [recording]);

  const consumeSamples = (samples: Float32Array, sampleRate: number) => {
    let squareSum = 0;
    for (const sample of samples) squareSum += sample * sample;
    const rms = Math.sqrt(squareSum / Math.max(1, samples.length));
    const nextLevel = Math.min(1, rms * 5);
    setLevel(nextLevel);
    onLevelChange?.(nextLevel);
    if (rms > 0.015) {
      lastSoundAtRef.current = performance.now();
      warnedRef.current = false;
    } else if (
      !warnedRef.current &&
      performance.now() - lastSoundAtRef.current >= 8_000
    ) {
      warnedRef.current = true;
      onSilence();
    }
    sampleRateRef.current = sampleRate;
    // AudioWorklet 通常每 128 个采样点回调一次；直接逐回调发 WS 会产生
    // 数百条小消息。聚合到约 100ms 一帧，兼顾实时性与协议开销。
    const copy = samples.slice();
    pendingSamplesRef.current.push(copy);
    pendingSampleCountRef.current += copy.length;
    if (pendingSampleCountRef.current >= sampleRate / 10) {
      flushPendingSamples();
    }
  };

  const start = async () => {
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof AudioContext === "undefined"
    ) {
      onError("当前浏览器不支持麦克风采集，已保留文字回答模式。");
      return;
    }
    try {
      const allowed = await onBeforeStart?.();
      if (allowed === false) return;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16_000,
        },
      });
      const context = new AudioContext({ latencyHint: "interactive" });
      await context.resume();
      const source = context.createMediaStreamSource(stream);
      const mute = context.createGain();
      mute.gain.value = 0;
      mute.connect(context.destination);
      let disconnectProcessor = () => {};

      if (context.audioWorklet && typeof AudioWorkletNode !== "undefined") {
        // 使用同源静态模块，保持生产 CSP 的 script-src 只允许 'self'。
        await context.audioWorklet.addModule("/mira-pcm-worklet.js");
        const processor = new AudioWorkletNode(context, "mira-pcm-processor");
        processor.port.onmessage = (event: MessageEvent<Float32Array>) =>
          consumeSamples(event.data, context.sampleRate);
        source.connect(processor);
        processor.connect(mute);
        disconnectProcessor = () => processor.disconnect();
      } else {
        const legacyContext = context as AudioContextWithLegacyProcessor;
        const processor = legacyContext.createScriptProcessor?.(4096, 1, 1);
        if (!processor) throw new Error("audio worklet unavailable");
        processor.onaudioprocess = (event) =>
          consumeSamples(event.inputBuffer.getChannelData(0), context.sampleRate);
        source.connect(processor);
        processor.connect(mute);
        disconnectProcessor = () => processor.disconnect();
      }

      lastSoundAtRef.current = performance.now();
      warnedRef.current = false;
      pendingSamplesRef.current = [];
      pendingSampleCountRef.current = 0;
      cleanupRef.current = () => {
        disconnectProcessor();
        source.disconnect();
        mute.disconnect();
        for (const track of stream.getTracks()) track.stop();
        void context.close();
      };
      setRecording(true);
      onRecordingChange(true);
    } catch (error) {
      cleanupRef.current?.();
      cleanupRef.current = null;
      const denied =
        error instanceof DOMException &&
        (error.name === "NotAllowedError" || error.name === "SecurityError");
      onError(
        denied
          ? "没有获得麦克风权限，已切回文字回答。请在浏览器地址栏中允许后重试。"
          : "麦克风启动失败，已保留文字回答模式。",
      );
    }
  };

  useImperativeHandle(ref, () => ({ start, stop }));

  const buttonLabels = labels ?? defaultLabels;
  const buttonLabel = recording ? buttonLabels.recording : buttonLabels.idle;
  const inlineWaveform = variant === "inline-waveform";
  const ariaLabel = inlineWaveform && recording
    ? "点击波形结束录音"
    : labels
      ? buttonLabel
      : recording
        ? "停止录音"
        : "开始录音";
  const compact = variant === "compact" || inlineWaveform;
  const elapsedLabel = `${String(Math.floor(elapsedSeconds / 60)).padStart(2, "0")}:${String(elapsedSeconds % 60).padStart(2, "0")}`;

  return (
    <div
      className={
        compact
          ? "flex min-w-0 shrink-0 items-center"
          : "flex min-w-0 flex-1 flex-col items-center gap-1.5 sm:flex-row sm:gap-3"
      }
    >
      <button
        type="button"
        aria-pressed={recording}
        aria-label={ariaLabel}
        // 断线时按钮会被禁用，但正在录音时必须始终能停下麦克风。
        disabled={disabled && !recording}
        onClick={() => (recording ? stop() : void start())}
        className={
          inlineWaveform
            ? `mira-button flex h-11 w-[154px] shrink-0 items-center justify-center gap-2 rounded-[13px] border text-xs font-semibold transition-colors ${
                recording
                  ? "border-orange-200 bg-orange-50 text-orange-700 shadow-[0_8px_18px_-15px_rgba(224,95,15,.62)] dark:border-orange-400/30 dark:bg-orange-500/10 dark:text-orange-200"
                  : "border-black/10 bg-white text-[#3e352e] shadow-[0_7px_16px_-14px_rgba(51,39,30,.55)] dark:border-white/12 dark:bg-white/[0.06] dark:text-[#ececea]"
              } disabled:cursor-not-allowed disabled:border-black/10 disabled:bg-black/5 disabled:text-black/35 dark:disabled:border-white/10 dark:disabled:bg-white/5 dark:disabled:text-white/35`
            : compact
            ? `mira-button flex h-11 shrink-0 items-center justify-center gap-2 rounded-full border px-3.5 text-xs font-semibold transition-colors ${
                recording
                  ? "border-red-200 bg-red-50 text-red-700 dark:border-red-400/30 dark:bg-red-400/10 dark:text-red-200"
                  : "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-400/25 dark:bg-orange-500/10 dark:text-orange-200"
              } disabled:cursor-not-allowed disabled:border-black/10 disabled:bg-black/5 disabled:text-black/35 dark:disabled:border-white/10 dark:disabled:bg-white/5 dark:disabled:text-white/35`
            : `mira-button flex h-14 w-full items-center justify-center gap-2 rounded-2xl px-5 text-sm font-medium text-white sm:h-12 sm:w-auto ${
                recording ? "bg-red-500" : "bg-orange-500"
              } disabled:cursor-not-allowed disabled:bg-[#d4d4d4]`
        }
      >
        {inlineWaveform && recording ? (
          <>
            <Waveform level={level} active label="实时麦克风音量" />
            <span className="tabular-nums">{elapsedLabel}</span>
          </>
        ) : (
          <>
            {recording ? (
              <Square className="h-4 w-4" />
            ) : (
              <Mic
                className={`h-5 w-5 ${inlineWaveform ? "text-orange-500" : ""}`}
              />
            )}
            {buttonLabel}
          </>
        )}
      </button>
      {showWaveform ? <Waveform level={level} active={recording} /> : null}
    </div>
  );
});

VoiceRecorder.displayName = "VoiceRecorder";

export default VoiceRecorder;
