"use client";

import { useEffect, useRef, useState } from "react";
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

export default function VoiceRecorder({
  disabled,
  onAudioFrame,
  onRecordingChange,
  onError,
  onSilence,
}: {
  disabled?: boolean;
  onAudioFrame: (frame: Uint8Array) => void;
  onRecordingChange: (recording: boolean) => void;
  onError: (message: string) => void;
  onSilence: () => void;
}) {
  const [recording, setRecording] = useState(false);
  const [level, setLevel] = useState(0);
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
    onRecordingChange(false);
  };

  useEffect(() => () => cleanupRef.current?.(), []);

  const consumeSamples = (samples: Float32Array, sampleRate: number) => {
    let squareSum = 0;
    for (const sample of samples) squareSum += sample * sample;
    const rms = Math.sqrt(squareSum / Math.max(1, samples.length));
    setLevel(Math.min(1, rms * 5));
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

  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5 sm:flex-row sm:gap-3">
      <button
        type="button"
        aria-pressed={recording}
        aria-label={recording ? "停止录音" : "开始录音"}
        // 断线时按钮会被禁用，但正在录音时必须始终能停下麦克风。
        disabled={disabled && !recording}
        onClick={() => (recording ? stop() : void start())}
        className={`mira-button flex h-14 w-full items-center justify-center gap-2 rounded-2xl px-5 text-sm font-medium text-white sm:h-12 sm:w-auto ${
          recording ? "bg-red-500" : "bg-orange-500"
        } disabled:cursor-not-allowed disabled:bg-[#d4d4d4]`}
      >
        {recording ? <Square className="h-4 w-4" /> : <Mic className="h-5 w-5" />}
        {recording ? "停止并转写" : "按下开始回答"}
      </button>
      <Waveform level={level} active={recording} />
    </div>
  );
}
