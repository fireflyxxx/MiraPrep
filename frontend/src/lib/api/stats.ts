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

export const overviewStatsKey = ["stats", "overview"] as const;

export function useOverviewStats() {
  return useQuery({
    queryKey: overviewStatsKey,
    queryFn: () => apiClient<StatsOverview>(endpoints.overviewStats),
  });
}
