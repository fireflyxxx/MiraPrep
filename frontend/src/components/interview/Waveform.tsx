"use client";

import { useReducedMotionSafe } from "@/lib/motion/use-reduced-motion";

export default function Waveform({
  level,
  active,
  label = "实时麦克风音量",
}: {
  level: number;
  active: boolean;
  label?: string;
}) {
  const reducedMotion = useReducedMotionSafe();
  const normalized = Math.max(0, Math.min(1, level));

  return (
    <div
      role="img"
      aria-label={label}
      data-level={normalized.toFixed(2)}
      className="flex h-8 items-center justify-center gap-1"
    >
      {Array.from({ length: 9 }, (_, index) => {
        const distance = Math.abs(index - 4) / 4;
        // reduced-motion 下柱高固定，只靠透明度反映音量。
        const height =
          active && !reducedMotion ? 6 + normalized * (25 - distance * 9) : 5;
        return (
          <span
            key={index}
            aria-hidden="true"
            className="w-1 rounded-full bg-orange-500"
            style={{
              height,
              transition: reducedMotion ? "opacity 180ms ease-out" : "height 90ms ease-out",
              opacity: active ? 0.55 + normalized * 0.45 : 0.3,
            }}
          />
        );
      })}
    </div>
  );
}
