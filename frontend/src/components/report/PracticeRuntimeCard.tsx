"use client";

import InterviewClient from "@/components/interview/InterviewClient";
import type { ReportQuestion } from "@/lib/api/report";
import type { PracticeTarget } from "@/lib/api/practice";

interface PracticeRuntimeCardProps {
  sessionId: string;
  question: ReportQuestion;
  target: PracticeTarget;
  targetPrompt: string;
  onEnded: () => void;
  onRequestClose: () => void;
}

export default function PracticeRuntimeCard({
  sessionId,
  question,
  target,
  targetPrompt,
  onEnded,
  onRequestClose,
}: PracticeRuntimeCardProps) {
  return (
    <InterviewClient
      sessionId={sessionId}
      onEnded={onEnded}
      practice={{ question, target, targetPrompt, onRequestClose }}
    />
  );
}
