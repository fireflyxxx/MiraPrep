"use client";

import {
  useEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";
import { motion } from "framer-motion";
import {
  fadeVariants,
  motionTransition,
  slideUpVariants,
  staggerVariants,
} from "./constants";
import { useReducedMotionSafe } from "./use-reduced-motion";

type MotionDivProps = ComponentPropsWithoutRef<typeof motion.div>;

export function FadeIn({ children, ...props }: MotionDivProps) {
  return (
    <motion.div
      variants={fadeVariants}
      initial="hidden"
      animate="visible"
      transition={motionTransition.pageIn}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function SlideUp({ children, ...props }: MotionDivProps) {
  const reducedMotion = useReducedMotionSafe();
  return (
    <motion.div
      variants={reducedMotion ? fadeVariants : slideUpVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.15 }}
      transition={motionTransition.pageIn}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function Stagger({ children, ...props }: MotionDivProps) {
  const reducedMotion = useReducedMotionSafe();
  return (
    <motion.div
      variants={reducedMotion ? fadeVariants : staggerVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.1 }}
      transition={motionTransition.pageIn}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, ...props }: MotionDivProps) {
  const reducedMotion = useReducedMotionSafe();
  return (
    <motion.div
      variants={reducedMotion ? fadeVariants : slideUpVariants}
      transition={motionTransition.pageIn}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function MotionCard({ children, ...props }: MotionDivProps) {
  const reducedMotion = useReducedMotionSafe();
  return (
    <motion.div
      whileHover={reducedMotion ? undefined : { y: -2 }}
      transition={motionTransition.micro}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function CountUp({
  value,
  duration = 700,
  children,
}: {
  value: number;
  duration?: number;
  children?: (value: number) => ReactNode;
}) {
  const reducedMotion = useReducedMotionSafe();
  const [display, setDisplay] = useState(0);
  const previousRef = useRef(0);
  // 后台标签页里 rAF 一帧都不会被调度，动画停在 0 上；那种时候直接显示真实数字，
  // 免得用户看到的是「0 分」这种错的数。
  const canAnimate =
    !reducedMotion && !(typeof document !== "undefined" && document.hidden);

  useEffect(() => {
    if (!canAnimate) {
      previousRef.current = value;
      return;
    }
    const startValue = previousRef.current;
    // 起点取第一帧的时间戳而不是 performance.now()：两者在浏览器里同源，
    // 但混用会让任何时钟不一致直接算出负进度，把数字甩到目标值之外。
    let startedAt = 0;
    let frame = 0;
    const tick = (now: number) => {
      if (!startedAt) startedAt = now;
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = Math.round(startValue + (value - startValue) * eased);
      setDisplay(next);
      // 逐帧记录当前值，动画被新的 value 打断时才能从眼前的数字继续。
      previousRef.current = next;
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [canAnimate, duration, value]);

  const renderedValue = canAnimate ? display : value;
  return <>{children ? children(renderedValue) : renderedValue.toLocaleString("zh-CN")}</>;
}
