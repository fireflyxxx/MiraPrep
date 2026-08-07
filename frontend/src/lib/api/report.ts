"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
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

export interface ShareState {
  enabled: boolean;
  shareToken: string | null;
  shareUrl: string | null;
}

export const shareKey = (sessionId: string) => ["reports", sessionId, "share"] as const;
export const publicReportKey = (shareToken: string) =>
  ["public-reports", shareToken] as const;

export function useShareState(sessionId: string) {
  return useQuery({
    queryKey: shareKey(sessionId),
    queryFn: () =>
      apiClient<ShareState>(endpoints.reportShare(encodeURIComponent(sessionId))),
    enabled: sessionId.length > 0,
  });
}

export function useSetShare(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) =>
      apiClient<ShareState>(endpoints.reportShare(encodeURIComponent(sessionId)), {
        method: "POST",
        body: JSON.stringify({ enabled }),
      }),
    onSuccess: (state) => queryClient.setQueryData(shareKey(sessionId), state),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "分享设置失败，请稍后重试"),
  });
}

/**
 * 公开报告：故意不带登录凭证。
 *
 * 分享页是给外人看的，token 就是全部凭证。如果照常带上本地的 access token，一旦它过期，
 * 统一客户端会触发刷新并把访客踢去 /auth——那是一个纯公开页面最不该有的行为。
 */
export function usePublicReport(shareToken: string) {
  return useQuery({
    queryKey: publicReportKey(shareToken),
    queryFn: () =>
      apiClient<InterviewReport>(endpoints.publicReport(encodeURIComponent(shareToken)), {
        anonymous: true,
        skipAuthRefresh: true,
      }),
    enabled: shareToken.length > 0,
    retry: false,
  });
}

export type ReportStatus = "none" | "grading" | "ready" | "failed";

interface ReportStatusResponse {
  status: ReportStatus;
}

export const reportKey = (sessionId: string) => ["reports", sessionId] as const;
export const reportStatusKey = (sessionId: string) =>
  ["reports", sessionId, "status"] as const;

/**
 * 触发一次 PDF 下载。
 *
 * 浏览器没有「保存这段二进制」的 API，通用做法是把 Blob 包成一个临时的 object URL，
 * 塞给一个隐藏的 <a download>，用代码点它一下，再把临时 URL 释放掉。
 */
function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function useExportReport(sessionId: string) {
  return useMutation({
    mutationFn: () =>
      apiClient<Blob>(endpoints.reportExport(encodeURIComponent(sessionId)), {
        blob: true,
      }),
    onSuccess: (pdf) => saveBlob(pdf, `MiraPrep-report-${sessionId}.pdf`),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "导出 PDF 失败，请稍后重试"),
  });
}

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
