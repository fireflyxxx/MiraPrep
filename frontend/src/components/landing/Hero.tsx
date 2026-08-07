"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { motion } from "framer-motion";
import HeroBackdrop from "./HeroBackdrop";
import RobotScene from "./RobotScene";
import { useReducedMotionPreference } from "./useReducedMotionPreference";

const rotatingWords = ["offer", "心仪岗位", "理想薪资"];

// Horizontal padding on the pill, in px. Needed as a number because the pill's width is
// animated explicitly and box-sizing is border-box.
const PILL_PADDING_X = 24;
const EXIT_DURATION_MS = 360;
const TYPE_INTERVAL_MS = 110;

function RotatingWord() {
  const reducedMotion = useReducedMotionPreference();
  const [index, setIndex] = useState(0);
  const [visibleLength, setVisibleLength] = useState(rotatingWords[0].length);
  const [isExiting, setIsExiting] = useState(false);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [widths, setWidths] = useState<number[] | null>(null);

  // Measure every word up front so the pill can animate to a real pixel width. Letting
  // framer-motion's `layout` handle it instead animates with a scaleX transform, which
  // stretches the glyphs and the rounded corners on the way — that is the jolt between a
  // long word and a short one.
  useEffect(() => {
    const node = measureRef.current;
    if (!node) return;
    const measure = () =>
      setWidths(
        Array.from(node.children, (child) => child.getBoundingClientRect().width),
      );
    measure();
    // Web fonts land after first paint and change the metrics.
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const word = rotatingWords[index];
  const effectiveVisibleLength = reducedMotion ? word.length : visibleLength;
  const effectiveIsExiting = reducedMotion ? false : isExiting;
  const displayedWord = word.slice(0, effectiveVisibleLength);

  useEffect(() => {
    if (reducedMotion || effectiveIsExiting || effectiveVisibleLength !== word.length) return;
    const timer = setTimeout(() => setIsExiting(true), 2600);
    return () => clearTimeout(timer);
  }, [effectiveIsExiting, effectiveVisibleLength, reducedMotion, word]);

  useEffect(() => {
    if (!isExiting) return;
    const timer = setTimeout(() => {
      setIndex((current) => (current + 1) % rotatingWords.length);
      setVisibleLength(0);
      setIsExiting(false);
    }, EXIT_DURATION_MS);
    return () => clearTimeout(timer);
  }, [isExiting]);

  useEffect(() => {
    if (reducedMotion || effectiveIsExiting || effectiveVisibleLength >= word.length) return;
    const timer = setTimeout(
      () => setVisibleLength((current) => current + 1),
      TYPE_INTERVAL_MS,
    );
    return () => clearTimeout(timer);
  }, [effectiveIsExiting, effectiveVisibleLength, reducedMotion, word]);

  const pillWidth = widths
    ? effectiveIsExiting
      ? PILL_PADDING_X
      : widths[index] * (effectiveVisibleLength / word.length) + PILL_PADDING_X
    : "auto";

  return (
    <>
      <span
        ref={measureRef}
        aria-hidden="true"
        className="pointer-events-none absolute whitespace-pre opacity-0"
      >
        {rotatingWords.map((candidate) => (
          <span key={candidate} className="inline-block">
            {candidate}
          </span>
        ))}
      </span>

      {/* No overflow clip: an inline-block that clips takes its baseline from its bottom
          margin edge instead of its text, which is what dropped the word below the rest of
          the line. */}
      <motion.span
        className="mx-1.5 inline-block whitespace-nowrap rounded-[14px] bg-[#0a0a0a] px-3 py-[0.14em] text-center align-baseline text-white"
        data-testid="rotating-word-pill"
        initial={false}
        animate={{ width: pillWidth }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      >
        <span className="sr-only">{word}</span>
        {/* display:inline is load-bearing. Nesting a second inline-block in here puts the
            word 8.6px below the surrounding line however the line-height is set — measured,
            not guessed. That rules out a transform (CSS drops transforms on non-replaced
            inline boxes), so the swap is an opacity crossfade, which inline honours. */}
        <motion.span
          aria-hidden="true"
          className="inline whitespace-pre"
          animate={
            effectiveIsExiting
              ? { clipPath: "inset(0 100% 0 0)", opacity: 0 }
              : { clipPath: "inset(0 0 0 0)", opacity: 1 }
          }
          transition={{ duration: EXIT_DURATION_MS / 1000, ease: [0.22, 1, 0.36, 1] }}
        >
          <span data-testid="rotating-word-visible">
            {effectiveIsExiting ? word : displayedWord}
          </span>
        </motion.span>
        {!reducedMotion && !effectiveIsExiting && effectiveVisibleLength < word.length ? (
          <span aria-hidden="true" className="ml-0.5 inline-block animate-pulse">|</span>
        ) : null}
      </motion.span>
    </>
  );
}

function HeroOrb() {
  return (
    <div
      // Keep the robot in normal flow with a deliberate responsive height. A `flex-1`
      // slot consumes every spare pixel in a tall viewport, which pushes the explanation
      // and CTAs to the bottom of the screen. This larger, bounded slot preserves the
      // intended top-to-bottom reading order instead.
      className="pointer-events-none relative z-0 mt-3 h-[clamp(320px,40svh,600px)] w-full max-w-[680px] flex-none"
      data-testid="hero-robot-slot"
      // The fade lets the shoulders dissolve into the page instead of ending on a hard cut.
      //
      // no-repeat is load-bearing: mask-repeat defaults to `repeat`, so the gradient tiles
      // across everything the element paints. Pair that with a drop-shadow (which renders
      // well outside the box) and the tiles cut visible bands around all four edges. The
      // shadow is gone now — the backdrop's radial wash does that job for free, without
      // re-rasterising the whole layer every frame — but the trap stays disarmed.
      style={{
        maskImage: "linear-gradient(to bottom, black 58%, transparent 90%)",
        WebkitMaskImage:
          "linear-gradient(to bottom, black 58%, transparent 90%)",
        maskRepeat: "no-repeat",
        WebkitMaskRepeat: "no-repeat",
        maskSize: "100% 100%",
        WebkitMaskSize: "100% 100%",
      }}
    >
      <RobotScene className="h-full w-full" />
    </div>
  );
}

export default function Hero() {
  return (
    // isolate: the backdrop sits on z-0, so without a stacking context of its own it would
    // paint underneath the page's white background instead of behind the copy.
    <section
      className="relative isolate flex flex-col items-center overflow-hidden px-6 pt-[104px] pb-8 text-center md:px-10"
      data-testid="landing-hero"
    >
      <HeroBackdrop />

      <h1 className="relative z-10 m-0 text-[38px] leading-[1.32] font-bold tracking-[-0.04em] md:text-[54px] md:leading-[1.26]">
        像真实面试一样，
        <br />
        练到你拿下
        <RotatingWord />
      </h1>

      {/* Between the headline and the copy: flex-1 hands it exactly the space left over. */}
      <HeroOrb />

      <div className="relative z-10 flex flex-col items-center">
        <p className="relative z-10 m-0 mb-6 max-w-[560px] text-lg leading-relaxed text-[#525252]">
          上传你的简历，Mira
          会围绕经历与目标岗位展开一轮有深度、会追问的仿真面试，并给出结构化评估报告。
        </p>

        <div className="relative z-10 flex flex-wrap items-center justify-center gap-3.5">
          <Link
            href="/auth"
            transitionTypes={["nav-forward"]}
            className="mira-button group rounded-[12px] bg-orange-500 px-[26px] py-3.5 text-[15px] font-medium text-white shadow-[0_10px_28px_-12px_rgba(249,115,22,.72)] hover:text-white"
          >
            开始一场面试
            <ArrowUpRight
              aria-hidden="true"
              className="ml-2 inline h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
            />
          </Link>
          <a
            href="#report-demo"
            className="mira-button rounded-[12px] border border-[#e5e5e5] bg-white px-6 py-3.5 text-[15px] font-medium text-[#0a0a0a] hover:border-[#d4d4d4] hover:bg-[#fafafa] hover:text-[#0a0a0a]"
          >
            查看报告样例
          </a>
        </div>

      </div>
    </section>
  );
}
