"use client";

import InterviewClient from "@/components/interview/InterviewClient";
import type { ReportQuestion } from "@/lib/api/report";

interface PracticeRuntimeCardProps {
  sessionId: string;
  question: ReportQuestion;
  onEnded: () => void;
  onRequestClose: () => void;
}

export default function PracticeRuntimeCard({
  sessionId,
  question,
  onEnded,
  onRequestClose,
}: PracticeRuntimeCardProps) {
  return (
    <InterviewClient
      sessionId={sessionId}
      onEnded={onEnded}
      practice={{ question, onRequestClose }}
    />
  );
}
