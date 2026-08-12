"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { apiClient } from "./client";
import { endpoints } from "./endpoints";

export interface CreatePracticeResponse {
  practiceSessionId: number;
  runtimeToken: string;
}

export type PracticeTargetType = "MAIN_QUESTION" | "FOLLOW_UP";

export interface PracticeTarget {
  targetType: PracticeTargetType;
  followUpIndex?: number;
}

export interface PracticeFollowUp {
  question: string;
  answer: string;
  score: number | null;
  referenceAnswer: string;
  suggestions: string[];
}

export interface PracticeAttempt {
  answer: string | null;
  score: number | null;
  referenceAnswer: string | null;
  suggestions: string[];
  followUps: PracticeFollowUp[];
}

export interface PracticeAnswerComparison {
  improvements: string[];
  remainingGaps: string[];
  scoreRationale: string;
}

export interface PracticeResult {
  status: "grading" | "ready" | "failed";
  targetType: PracticeTargetType;
  followUpIndex: number | null;
  question: string | null;
  source: PracticeAttempt | null;
  current: PracticeAttempt | null;
  comparison: PracticeAnswerComparison | null;
  scoreDelta: number | null;
}

export function createPractice(
  sourceSessionId: string,
  questionId: number,
  target: PracticeTarget,
): Promise<CreatePracticeResponse> {
  return apiClient<CreatePracticeResponse>(
    endpoints.practiceRetry(encodeURIComponent(sourceSessionId), questionId),
    { method: "POST", body: JSON.stringify(target) },
  );
}

export function getPracticeResult(practiceSessionId: string): Promise<PracticeResult> {
  return apiClient<PracticeResult>(
    endpoints.practiceResult(encodeURIComponent(practiceSessionId)),
  );
}

export function useCreatePractice() {
  return useMutation({
    mutationFn: ({
      sourceSessionId,
      questionId,
      target,
    }: {
      sourceSessionId: string;
      questionId: number;
      target: PracticeTarget;
    }) => createPractice(sourceSessionId, questionId, target),
  });
}

export function usePracticeResult(practiceSessionId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["practice-result", practiceSessionId],
    queryFn: () => getPracticeResult(practiceSessionId!),
    enabled: enabled && practiceSessionId !== null,
    refetchInterval: (query) =>
      query.state.data?.status === "grading" ? 2_000 : false,
    retry: false,
  });
}
