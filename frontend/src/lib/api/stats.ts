"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "./client";
import { endpoints } from "./endpoints";

export type Grade = "S" | "A" | "B" | "C" | "D";

export interface DimensionScores {
  professionalKnowledge: number;
  projectDepth: number;
  communicationLogic: number;
  adaptability: number;
  jobFit: number;
}

export interface ScoreTrendPoint {
  date: string;
  score: number;
}

/** T-106 冻结的统计响应；报告页和面试列表后续直接复用。 */
export interface StatsOverview {
  totalInterviews: number;
  highestGrade: Grade | null;
  latestGrade: Grade | null;
  lastInterviewAt: string | null;
  overallGrade: Grade | null;
  overallSummary: string | null;
  basedOnCompletedInterviews: number;
  dimensionScores: DimensionScores | null;
  scoreTrend: ScoreTrendPoint[];
  totalPracticeMinutes: number;
}

export interface HistoryPoint {
  sessionId: number;
  date: string;
  score: number;
  grade: Grade;
}

export const overviewStatsKey = ["stats", "overview"] as const;
export const historyStatsKey = (jobDirection: string, jobTitle: string) =>
  ["stats", "history", jobDirection, jobTitle] as const;

/** 同岗位历史得分趋势；后端已按时间正序返回，前端拿到即可直接画。 */
export function useHistoryStats(jobDirection: string, jobTitle: string) {
  return useQuery({
    queryKey: historyStatsKey(jobDirection, jobTitle),
    queryFn: () => {
      const query = new URLSearchParams();
      if (jobDirection) query.set("jobDirection", jobDirection);
      if (jobTitle) query.set("jobTitle", jobTitle);
      const suffix = query.size ? `?${query}` : "";
      return apiClient<{ points: HistoryPoint[] }>(`${endpoints.statsHistory}${suffix}`);
    },
    enabled: jobTitle.length > 0 || jobDirection.length > 0,
  });
}

export function useOverviewStats() {
  return useQuery({
    queryKey: overviewStatsKey,
    queryFn: () => apiClient<StatsOverview>(endpoints.overviewStats),
  });
}
