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

export function buildRadarData(
  scores: DimensionScores,
  historyScores?: DimensionScores | null,
) {
  return DIMENSIONS.map(({ key, label }) => ({
    label,
    current: scores[key],
    history: historyScores?.[key],
  }));
}

export default function RadarChart({
  scores,
  historyScores,
}: {
  scores: DimensionScores;
  historyScores?: DimensionScores | null;
}) {
  const data = buildRadarData(scores, historyScores);

  return (
    <div aria-label="五维能力雷达图" className="min-w-0">
      <div className="mb-3 flex flex-wrap justify-center gap-4 text-xs text-muted-foreground">
        <span
          data-testid="radar-legend-current"
          data-series-style="solid-glow"
          className="inline-flex items-center gap-1.5"
        >
          <span className="h-2.5 w-2.5 rounded-full bg-primary shadow-[0_0_8px_color-mix(in_srgb,var(--primary)_55%,transparent)]" />
          本次
        </span>
        {historyScores ? (
          <span
            data-testid="radar-legend-history"
            data-series-style="dashed-muted"
            className="inline-flex items-center gap-1.5"
          >
            <span className="h-0 w-4 border-t-2 border-dashed border-grade-c" />
            历史均值
          </span>
        ) : null}
      </div>
      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <RechartsRadarChart data={data} outerRadius="74%" margin={{ top: 8, right: 18, bottom: 8, left: 18 }}>
            <PolarGrid stroke="var(--border)" strokeOpacity={0.72} radialLines={false} />
            <PolarAngleAxis
              dataKey="label"
              tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              tickLine={false}
            />
            <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
            {historyScores ? (
              <Radar
                dataKey="history"
                stroke="var(--grade-c)"
                fill="var(--grade-c)"
                fillOpacity={0.08}
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={{ r: 2.5, fill: "var(--surface)", strokeWidth: 1.5 }}
              />
            ) : null}
            <Radar
              dataKey="current"
              stroke="var(--primary)"
              fill="var(--primary)"
              fillOpacity={0.22}
              strokeWidth={2.5}
              dot={{ r: 3.5, fill: "var(--primary)", stroke: "var(--surface)", strokeWidth: 2 }}
            />
            <Tooltip
              contentStyle={{
                borderRadius: 12,
                borderColor: "var(--border)",
                background: "var(--surface)",
                color: "var(--foreground)",
                boxShadow: "0 18px 45px -24px rgb(0 0 0 / 45%)",
              }}
            />
          </RechartsRadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
