"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "./client";
import { endpoints } from "./endpoints";
import { ApiError } from "./types";
import type { DimensionScores, Grade } from "./stats";

export interface ReportConfig {
  jobDirection: string;
  jobTitle: string;
  jdText: string | null;
  difficulty: string;
  types: string[];
  durationMin: number;
  customRequirements: string | null;
  interviewerStyle: string;
  voiceEnabled: boolean;
}

export interface FollowUpReview {
  question: string;
  answer: string;
  answerSeconds: number | null;
  referenceAnswer: string;
  suggestions: string[];
}

export interface ReportQuestion {
  questionId: number;
  order: number;
  phase: string;
  text: string;
  focusPoints: string[];
  answer: string | null;
  score: number | null;
  thinkSeconds: number | null;
  answerSeconds: number | null;
  suggestedSeconds: number | null;
  referenceAnswer: string | null;
  suggestions: string[];
  followUpChain: FollowUpReview[];
  audioUrl: string | null;
}

export interface InterviewReport {
  sessionId: number;
  grade: Grade;
  totalScore: number;
  jobTitle: string;
  createdAt: string;
  config: ReportConfig;
  dimensionScores: DimensionScores | null;
  summary: string;
  highlights: string[];
  weaknesses: string[];
  partial: boolean;
  questions: ReportQuestion[];
}

export const reportKey = (sessionId: string) => ["reports", sessionId] as const;

/** 评级页和完整报告页共享同一缓存，来回跳转时不会重复闪烁加载态。 */
export function useReport(sessionId: string) {
  return useQuery({
    queryKey: reportKey(sessionId),
    queryFn: () =>
      apiClient<InterviewReport>(endpoints.report(encodeURIComponent(sessionId))),
    enabled: sessionId.length > 0,
    retry: (failureCount, error) => {
      if (error instanceof ApiError && error.status === 404) {
        return failureCount < 90;
      }
      return !(error instanceof ApiError) && failureCount < 2;
    },
    retryDelay: (attemptIndex, error) =>
      error instanceof ApiError && error.status === 404
        ? 2_000
        : Math.min(1_000 * 2 ** attemptIndex, 10_000),
  });
}
