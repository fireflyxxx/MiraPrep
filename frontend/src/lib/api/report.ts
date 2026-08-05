"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "./client";
import { endpoints } from "./endpoints";
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

export type ReportStatus = "none" | "grading" | "ready" | "failed";

interface ReportStatusResponse {
  status: ReportStatus;
}

export const reportKey = (sessionId: string) => ["reports", sessionId] as const;
export const reportStatusKey = (sessionId: string) =>
  ["reports", sessionId, "status"] as const;

/** 评级页和完整报告页共享同一缓存，来回跳转时不会重复闪烁加载态。 */
export function useReport(sessionId: string) {
  const statusQuery = useQuery({
    queryKey: reportStatusKey(sessionId),
    queryFn: () =>
      apiClient<ReportStatusResponse>(
        endpoints.reportStatus(encodeURIComponent(sessionId)),
      ),
    enabled: sessionId.length > 0,
    refetchInterval: (query) =>
      query.state.data?.status === "grading" ? 2_000 : false,
  });
  const status = statusQuery.data?.status;
  const reportQuery = useQuery({
    queryKey: reportKey(sessionId),
    queryFn: () =>
      apiClient<InterviewReport>(endpoints.report(encodeURIComponent(sessionId))),
    enabled: sessionId.length > 0 && status === "ready",
  });

  const terminalStatusError = status === "none" || status === "failed";
  return {
    data: reportQuery.data,
    status,
    isPending:
      statusQuery.isPending ||
      status === "grading" ||
      (status === "ready" && reportQuery.isPending),
    isError: statusQuery.isError || reportQuery.isError || terminalStatusError,
    error:
      statusQuery.error ??
      reportQuery.error ??
      (terminalStatusError ? new Error(status === "failed" ? "报告生成失败" : "报告尚未开始生成") : null),
    refetch: async () => {
      const refreshedStatus = await statusQuery.refetch();
      if (refreshedStatus.data?.status === "ready") {
        await reportQuery.refetch();
      }
    },
  };
}
