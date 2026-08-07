"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useReducedMotionPreference } from "./useReducedMotionPreference";

const stats = [
  { value: 12_800, suffix: "+", label: "已帮助候选人" },
  { value: 8, suffix: "", label: "覆盖岗位方向" },
  { value: 4, suffix: "", label: "步完成训练闭环" },
] as const;

const subscribeToHydration = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

function CountUp({ value, duration }: { value: number; duration: number }) {
  const reducedMotion = useReducedMotionPreference();
  const [display, setDisplay] = useState(reducedMotion ? value : 0);

  useEffect(() => {
    if (reducedMotion || value === 0) return;
    let startedAt = 0;
    let frame = 0;
    const tick = (now: number) => {
      if (!startedAt) startedAt = now;
      const progress = Math.min(1, (now - startedAt) / duration);
      setDisplay(Math.round(value * (1 - Math.pow(1 - progress, 3))));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [duration, reducedMotion, value]);

  const rendered = reducedMotion || value === 0 ? value : display;
  return <>{rendered.toLocaleString("zh-CN")}</>;
}

export default function StatBar() {
  const rootRef = useRef<HTMLElement>(null);
  const reducedMotion = useReducedMotionPreference();
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    getClientSnapshot,
    getServerSnapshot,
  );
  const [entered, setEntered] = useState(false);
  const observerUnavailable = typeof IntersectionObserver === "undefined";
  const shouldDisplay =
    hydrated && (reducedMotion || observerUnavailable || entered);

  useEffect(() => {
    if (reducedMotion || observerUnavailable) return;

    const node = rootRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setEntered(true);
          observer.disconnect();
        }
      },
      { threshold: 0.35 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [observerUnavailable, reducedMotion]);

  return (
    <section
      ref={rootRef}
      aria-label="MiraPrep 使用数据"
      className="mx-auto mt-16 max-w-[1180px] px-6 md:px-10"
    >
      <div className="relative grid overflow-hidden rounded-[22px] border border-black/[0.07] bg-white shadow-[0_24px_70px_-52px_rgba(0,0,0,.45)] sm:grid-cols-3">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_140%_at_6%_0%,rgba(249,115,22,.10),transparent_58%)]" />
        {stats.map((stat) => (
          <div key={stat.label} className="relative px-7 py-7 sm:px-8 sm:py-8">
            <div className="relative font-display text-[34px] leading-none font-semibold tracking-[-0.04em] tabular-nums md:text-[42px]">
              <CountUp value={shouldDisplay ? stat.value : 0} duration={380} />
              {stat.suffix}
            </div>
            <p className="relative mt-2.5 text-[13px] tracking-[0.02em] text-[#737373]">
              {stat.label}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
