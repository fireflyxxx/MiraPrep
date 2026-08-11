"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { base64ToBytes, type TtsAudioEvent } from "@/lib/api/interview-ws";

export interface TTSPlayerHandle {
  enqueue(event: TtsAudioEvent): void;
  unlock(): void;
  stop(): void;
}

export interface TTSPlayerLabels {
  mute: string;
  unmute: string;
  idle: string;
  muted: string;
  speaking: string;
}

const defaultLabels: TTSPlayerLabels = {
  mute: "静音面试官语音",
  unmute: "开启面试官语音",
  idle: "语音开启",
  muted: "已静音",
  speaking: "播放中",
};

function sampleRateFor(format: string): number {
  const match = /pcm16\/(\d+)k/i.exec(format);
  return match ? Number(match[1]) * 1_000 : 24_000;
}

const TTSPlayer = forwardRef<TTSPlayerHandle, {
  labels?: TTSPlayerLabels;
  onSpeakingChange?: (speaking: boolean) => void;
}>(({ labels = defaultLabels, onSpeakingChange }, ref) => {
  const [muted, setMuted] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const contextRef = useRef<AudioContext | null>(null);
  const queueRef = useRef<TtsAudioEvent[]>([]);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const mutedRef = useRef(false);
  const preparingRef = useRef(false);

  const setSpeakingState = (value: boolean) => {
    setSpeaking(value);
    onSpeakingChange?.(value);
  };

  const stop = () => {
    queueRef.current = [];
    try {
      sourceRef.current?.stop();
    } catch {
      // 已结束的 source 再 stop 会抛错，忽略即可。
    }
    sourceRef.current = null;
    setSpeakingState(false);
  };

  const playNext = async () => {
    if (sourceRef.current || preparingRef.current || mutedRef.current) return;
    const event = queueRef.current.shift();
    if (!event) {
      setSpeakingState(false);
      return;
    }
    if (!event.payload.chunk) {
      void playNext();
      return;
    }
    preparingRef.current = true;
    try {
      const context = contextRef.current ?? new AudioContext({ latencyHint: "interactive" });
      contextRef.current = context;
      await context.resume();
      const bytes = base64ToBytes(event.payload.chunk);
      const sampleCount = Math.floor(bytes.byteLength / 2);
      const buffer = context.createBuffer(
        1,
        sampleCount,
        sampleRateFor(event.payload.format),
      );
      const channel = buffer.getChannelData(0);
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      for (let index = 0; index < sampleCount; index += 1) {
        channel[index] = view.getInt16(index * 2, true) / 0x8000;
      }
      // 解码期间可能被静音；此时 stop() 还拿不到 source，只能在这里兜住。
      if (mutedRef.current) return;
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);
      sourceRef.current = source;
      setSpeakingState(true);
      source.onended = () => {
        if (sourceRef.current === source) sourceRef.current = null;
        void playNext();
      };
      source.start();
    } catch {
      setSpeakingState(false);
    } finally {
      preparingRef.current = false;
    }
  };

  useImperativeHandle(ref, () => ({
    enqueue(event) {
      if (mutedRef.current) return;
      if (event.payload.isFinal && !event.payload.chunk) return;
      queueRef.current.push(event);
      void playNext();
    },
    unlock() {
      const context = contextRef.current ?? new AudioContext({ latencyHint: "interactive" });
      contextRef.current = context;
      void context.resume().catch(() => {
        // 浏览器可能要求再次点击播放按钮；后续 enqueue 仍会重试 resume。
      });
    },
    stop,
  }));

  useEffect(
    () => () => {
      queueRef.current = [];
      sourceRef.current?.stop();
      void contextRef.current?.close().catch(() => {});
    },
    [],
  );

  const toggleMuted = () => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    if (next) stop();
  };

  return (
    <button
      type="button"
      aria-pressed={muted}
      aria-label={muted ? labels.unmute : labels.mute}
      onClick={toggleMuted}
      className="mira-button inline-flex h-9 items-center gap-1.5 rounded-full border border-[#e5e5e5] bg-white px-3 text-xs text-[#525252]"
    >
      {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
      {muted ? labels.muted : speaking ? labels.speaking : labels.idle}
    </button>
  );
});

TTSPlayer.displayName = "TTSPlayer";

export default TTSPlayer;
