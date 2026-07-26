"use client";

import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart as RechartsRadarChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import type { DimensionScores } from "@/lib/api/stats";

const DIMENSIONS: Array<{ key: keyof DimensionScores; label: string }> = [
  { key: "professionalKnowledge", label: "专业知识" },
  { key: "projectDepth", label: "项目深度" },
  { key: "communicationLogic", label: "表达逻辑" },
  { key: "adaptability", label: "临场应变" },
  { key: "jobFit", label: "岗位匹配" },
];

export default function RadarChart({
  scores,
  historyScores,
}: {
  scores: DimensionScores;
  historyScores?: DimensionScores | null;
}) {
  const data = DIMENSIONS.map(({ key, label }) => ({
    label,
    current: scores[key],
    history: historyScores?.[key],
  }));

  return (
    <div aria-label="五维能力雷达图" className="min-w-0">
      <div className="mb-3 flex flex-wrap justify-center gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-primary" />
          本次
        </span>
        {historyScores ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-grade-c" />
            历史均值
          </span>
        ) : null}
      </div>
      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <RechartsRadarChart data={data} outerRadius="72%">
            <PolarGrid stroke="var(--border)" />
            <PolarAngleAxis
              dataKey="label"
              tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            />
            <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
            {historyScores ? (
              <Radar
                dataKey="history"
                stroke="var(--grade-c)"
                fill="var(--grade-c)"
                fillOpacity={0.08}
                strokeWidth={2}
              />
            ) : null}
            <Radar
              dataKey="current"
              stroke="var(--primary)"
              fill="var(--primary)"
              fillOpacity={0.2}
              strokeWidth={2}
            />
            <Tooltip
              contentStyle={{
                borderRadius: 12,
                borderColor: "var(--border)",
                background: "var(--surface)",
                color: "var(--foreground)",
              }}
            />
          </RechartsRadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
