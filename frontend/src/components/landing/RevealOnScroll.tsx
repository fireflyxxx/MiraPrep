"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type HTMLAttributes,
} from "react";
import { useReducedMotionPreference } from "./useReducedMotionPreference";

const subscribeToHydration = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

export default function RevealOnScroll({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  const rootRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotionPreference();
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    getClientSnapshot,
    getServerSnapshot,
  );
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (reducedMotion || typeof IntersectionObserver === "undefined") return;
    const node = rootRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [reducedMotion]);

  const observerUnavailable =
    hydrated && typeof IntersectionObserver === "undefined";
  const shown = reducedMotion || observerUnavailable || visible;

  return (
    <div
      {...props}
      ref={rootRef}
      className={["mira-reveal", className].filter(Boolean).join(" ")}
      style={{
        contentVisibility: "auto",
        containIntrinsicSize: "auto 600px",
        opacity: shown ? 1 : 0,
        transform: shown ? "none" : "translateY(16px)",
        transition: reducedMotion
          ? "none"
          : "opacity 420ms cubic-bezier(.16,1,.3,1), transform 420ms cubic-bezier(.16,1,.3,1)",
        ...props.style,
      }}
    >
      {children}
    </div>
  );
}
