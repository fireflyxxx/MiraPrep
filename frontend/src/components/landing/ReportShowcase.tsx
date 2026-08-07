"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Sparkles, TrendingUp } from "lucide-react";

function ChartPlaceholder() {
  return (
    <div
      data-testid="report-chart-placeholder"
      aria-hidden="true"
      className="h-[370px] animate-pulse rounded-2xl bg-[radial-gradient(circle_at_center,rgba(249,115,22,.12),transparent_55%)]"
    />
  );
}

const RadarChart = dynamic(() => import("@/components/report/RadarChart"), {
  ssr: false,
  loading: ChartPlaceholder,
});

const scores = {
  professionalKnowledge: 86,
  projectDepth: 82,
  communicationLogic: 88,
  adaptability: 78,
  jobFit: 91,
};

const dimensions = [
  ["专业知识", 86],
  ["项目深度", 82],
  ["表达逻辑", 88],
  ["应变能力", 78],
  ["岗位匹配", 91],
] as const;

export default function ReportShowcase() {
  const chartRef = useRef<HTMLDivElement>(null);
  const [chartInView, setChartInView] = useState(false);

  useEffect(() => {
    const node = chartRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setChartInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="relative overflow-hidden rounded-[28px] border border-black/[0.09] bg-[#101010] p-2 shadow-[0_45px_100px_-52px_rgba(0,0,0,.72)] md:p-3">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_78%_18%,rgba(249,115,22,.24),transparent_34%),linear-gradient(rgba(255,255,255,.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.025)_1px,transparent_1px)] bg-[size:auto,28px_28px,28px_28px]" />

      <div className="relative overflow-hidden rounded-[22px] border border-white/10 bg-[#f7f7f5]">
        <div className="flex h-11 items-center justify-between border-b border-black/[0.08] bg-white px-4 md:px-5">
          <div className="flex items-center gap-1.5" aria-hidden="true">
            <span className="h-2.5 w-2.5 rounded-full bg-[#ff6b5f]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#f7bd45]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#4cc561]" />
          </div>
          <div className="rounded-md bg-[#f5f5f3] px-3 py-1 font-display text-[10px] tracking-[0.04em] text-[#a3a3a3]">
            miraprep.app/report/demo
          </div>
          <span className="hidden text-[10px] text-[#a3a3a3] sm:block">
            只读预览
          </span>
        </div>

        <div className="border-b border-black/[0.07] bg-white px-5 py-6 md:px-8 md:py-7">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <div className="mb-2 flex items-center gap-2 text-[11px] font-medium tracking-[0.08em] text-orange-600 uppercase">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                示例报告 · 信息已脱敏
              </div>
              <h3 className="text-[22px] font-semibold tracking-[-0.025em] text-[#171717] md:text-[28px]">
                前端工程师 · 模拟面试报告
              </h3>
              <p className="mt-1.5 text-[12px] text-[#a3a3a3]">
                8 道题 · 32 分钟 · 2026-08-05
              </p>
            </div>
            <div
              aria-label="综合评级 A"
              className="flex items-center gap-3 rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3"
            >
              <div>
                <div className="text-[10px] tracking-[0.08em] text-orange-700 uppercase">
                  综合评级
                </div>
                <div className="text-[11px] text-orange-700/65">超过 82% 候选人</div>
              </div>
              <span className="font-display text-[36px] leading-none font-semibold text-orange-500">
                A
              </span>
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-[.92fr_1.08fr]">
          <div className="border-b border-black/[0.07] bg-white p-5 md:p-7 lg:border-r lg:border-b-0">
            <div
              ref={chartRef}
              className="overflow-hidden rounded-[20px] border border-black/[0.07] bg-[#fcfcfb]"
            >
              {chartInView ? <RadarChart scores={scores} /> : <ChartPlaceholder />}
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-5 lg:grid-cols-2">
              {dimensions.map(([label, score]) => (
                <div key={label} className="min-w-0">
                  <div className="flex items-center justify-between gap-3 text-[11px]">
                    <dt className="truncate text-[#737373]">{label}</dt>
                    <dd className="font-display font-medium text-[#171717] tabular-nums">
                      {score}
                    </dd>
                  </div>
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-black/[0.06]">
                    <div
                      className="h-full rounded-full bg-orange-500"
                      style={{ width: `${score}%` }}
                    />
                  </div>
                </div>
              ))}
            </dl>
          </div>

          <div className="space-y-4 p-5 md:p-7">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[11px] font-medium tracking-[0.08em] text-[#a3a3a3] uppercase">
                  Question review
                </div>
                <h4 className="mt-1 text-[17px] font-semibold text-[#171717]">
                  第 3 题 · 项目深挖
                </h4>
              </div>
              <span className="rounded-full bg-[#ecfdf3] px-2.5 py-1 text-[11px] font-medium text-[#16803c]">
                表现良好
              </span>
            </div>

            <blockquote className="rounded-2xl border border-black/[0.06] bg-white p-4 text-[13px] leading-6 text-[#525252] shadow-[0_12px_30px_-26px_rgba(0,0,0,.55)]">
              “为什么在这个高频更新场景里选择独立状态库，而不是继续使用 Context？”
            </blockquote>

            <div className="rounded-2xl border border-orange-200/80 bg-[#fff8f2] p-4">
              <div className="flex items-center gap-2 text-[12px] font-medium text-[#9a3412]">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                回答亮点
              </div>
              <p className="mt-2 text-[12px] leading-5 text-[#7c2d12]/75">
                能从更新频率、订阅粒度和维护成本三个角度解释选型，且给出了真实压测结果。
              </p>
            </div>

            <div className="rounded-2xl border border-black/[0.08] bg-[#fafafa] p-4 text-[#171717]">
              <div className="flex items-center gap-2 text-[12px] font-medium">
                <TrendingUp className="h-3.5 w-3.5 text-orange-500" aria-hidden="true" />
                下一步最值得练习
              </div>
              <p className="mt-2 text-[12px] leading-5 text-[#737373]">
                把“为什么不选其他方案”补成 30 秒结构化回答：约束 → 对比 → 决策 → 结果。
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
