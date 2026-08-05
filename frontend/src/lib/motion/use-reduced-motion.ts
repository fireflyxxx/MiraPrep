"use client";

import { useReducedMotion } from "framer-motion";

/** 在 SSR 和测试环境中始终返回明确 boolean，避免 hydration 状态不一致。 */
export function useReducedMotionSafe(): boolean {
  return useReducedMotion() ?? false;
}
