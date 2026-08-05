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
  const [display, setDisplay] = useState(reducedMotion ? value : 0);
  const previousRef = useRef(0);

  useEffect(() => {
    if (reducedMotion) {
      previousRef.current = value;
      return;
    }
    const startValue = previousRef.current;
    const startedAt = performance.now();
    let frame = 0;
    const tick = (now: number) => {
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
  }, [duration, reducedMotion, value]);

  const renderedValue = reducedMotion ? value : display;
  return <>{children ? children(renderedValue) : renderedValue.toLocaleString("zh-CN")}</>;
}
