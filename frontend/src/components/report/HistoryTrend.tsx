"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useHistoryStats, type HistoryPoint } from "@/lib/api/stats";

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit" }).format(date);
}

export function buildTrendData(points: HistoryPoint[]) {
  return points.map((point) => ({
    ...point,
    label: formatDate(point.date),
  }));
}

/**
 * 同岗位历史得分折线。
 *
 * 只有一场的时候不画折线——一个点连不成趋势，画出来反而像在暗示什么。
 */
export default function HistoryTrend({
  jobDirection,
  jobTitle,
  currentSessionId,
}: {
  jobDirection: string;
  jobTitle: string;
  currentSessionId?: number;
}) {
  const { data, isPending, isError } = useHistoryStats(jobDirection, jobTitle);
  const points = data?.points ?? [];

  if (isPending) {
    return (
      <div
        aria-label="历史趋势加载中"
        className="h-[220px] animate-pulse rounded-2xl bg-muted"
      />
    );
  }

  if (isError) {
    return (
      <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        暂时无法加载历史趋势
      </p>
    );
  }

  if (points.length < 2) {
    return (
      <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        {jobTitle} 目前只有 {points.length} 场完整记录，再练一场就能看到走势了
      </p>
    );
  }

  const chartData = buildTrendData(points);
  const current = chartData.find((point) => point.sessionId === currentSessionId);

  return (
    <div aria-label={`${jobTitle} 历史得分趋势`} className="h-[220px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 12, right: 16, bottom: 4, left: -18 }}>
          <CartesianGrid stroke="var(--border)" strokeOpacity={0.6} vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            width={44}
          />
          <Tooltip
            formatter={(value) => [`${value ?? "—"} 分`, "总分"]}
            contentStyle={{
              borderRadius: 12,
              borderColor: "var(--border)",
              background: "var(--surface)",
              color: "var(--foreground)",
              boxShadow: "0 18px 45px -24px rgb(0 0 0 / 45%)",
            }}
          />
          <Line
            dataKey="score"
            stroke="var(--primary)"
            strokeWidth={2.5}
            dot={{ r: 3.5, fill: "var(--primary)", stroke: "var(--surface)", strokeWidth: 2 }}
            activeDot={{ r: 5 }}
          />
          {/* 本场在整条走势里的位置，一眼就能找到。 */}
          {current ? (
            <ReferenceDot
              x={current.label}
              y={current.score}
              r={7}
              fill="none"
              stroke="var(--primary)"
              strokeWidth={2}
            />
          ) : null}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
