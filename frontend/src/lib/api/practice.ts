"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { apiClient } from "./client";
import { endpoints } from "./endpoints";

export interface CreatePracticeResponse {
  practiceSessionId: number;
  runtimeToken: string;
}

export interface PracticeAttempt {
  answer: string | null;
  score: number | null;
  referenceAnswer: string | null;
  suggestions: string[];
}

export interface PracticeResult {
  status: "grading" | "ready" | "failed";
  question: string | null;
  source: PracticeAttempt | null;
  current: PracticeAttempt | null;
  scoreDelta: number | null;
}

export function createPractice(
  sourceSessionId: string,
  questionId: number,
): Promise<CreatePracticeResponse> {
  return apiClient<CreatePracticeResponse>(
    endpoints.practiceRetry(encodeURIComponent(sourceSessionId), questionId),
    { method: "POST" },
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
    }: {
      sourceSessionId: string;
      questionId: number;
    }) => createPractice(sourceSessionId, questionId),
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
