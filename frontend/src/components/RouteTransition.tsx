"use client";

import { ViewTransition } from "react";

const animationByType = {
  "nav-forward": "nav-forward",
  "nav-back": "nav-back",
  "nav-modal-in": "nav-modal-in",
  "nav-modal-out": "nav-modal-out",
  "nav-reveal": "nav-reveal",
  default: "nav-fade",
};

export default function RouteTransition({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ViewTransition enter={animationByType} exit={animationByType}>
      {children}
    </ViewTransition>
  );
}
