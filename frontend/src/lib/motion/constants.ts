import type { Transition, Variants } from "framer-motion";

export const motionDuration = {
  micro: 0.18,
  pageIn: 0.3,
  ceremony: 0.75,
} as const;

export const easeOut = [0.16, 1, 0.3, 1] as const;

export const motionTransition = {
  micro: { duration: motionDuration.micro, ease: easeOut },
  pageIn: { duration: motionDuration.pageIn, ease: easeOut },
  ceremony: { duration: motionDuration.ceremony, ease: easeOut },
  spring: { type: "spring", stiffness: 300, damping: 30 },
} satisfies Record<string, Transition>;

export const fadeVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

export const slideUpVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0 },
};

export const staggerVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};
