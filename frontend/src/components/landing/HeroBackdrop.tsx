"use client";

import { motion } from "framer-motion";
import { useReducedMotionPreference } from "./useReducedMotionPreference";

const GRID_CELL = 68;

export default function HeroBackdrop() {
  const reducedMotion = useReducedMotionPreference();

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden [perspective:520px] [perspective-origin:50%_0%]"
    >
      {/* Real 3D: a plane tilted away from the camera, scrolling exactly one cell per loop
          so the ground reads as infinite. */}
      <motion.div
        className="absolute -inset-x-1/2 bottom-[-22%] h-[78%] origin-bottom [transform:rotateX(74deg)]"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(249,115,22,.14) 1px, transparent 1px), linear-gradient(to bottom, rgba(249,115,22,.14) 1px, transparent 1px)",
          backgroundSize: `${GRID_CELL}px ${GRID_CELL}px`,
          maskImage:
            "radial-gradient(ellipse 58% 76% at 50% 100%, black 10%, transparent 70%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 58% 76% at 50% 100%, black 10%, transparent 70%)",
        }}
        animate={reducedMotion ? undefined : { backgroundPositionY: [0, GRID_CELL] }}
        transition={{ duration: 5.5, repeat: Infinity, ease: "linear" }}
      />

      {/* ponytail: one flat radial wash. A previous version ran an fbm noise shader here —
          on a white page the clouds read as stains, not atmosphere. */}
      <div className="absolute top-[4%] left-1/2 h-[620px] w-[900px] max-w-[130vw] -translate-x-1/2 bg-[radial-gradient(circle,rgba(249,115,22,.10),transparent_68%)]" />

      <div className="absolute inset-x-0 bottom-0 h-[30%] bg-[linear-gradient(to_top,white,transparent)]" />
    </div>
  );
}
