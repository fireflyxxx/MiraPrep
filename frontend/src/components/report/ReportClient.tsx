"use client";

import { useState } from "react";
import Link from "next/link";
import Logo from "@/components/Logo";
import { questions } from "@/lib/mock-data";

const dimensions = [
  { label: "项目深度", note: "优秀", pct: 88, active: true },
  { label: "技术表达", note: "良好", pct: 80, active: true },
  { label: "系统设计", note: "待提升", pct: 58, active: false },
  { label: "沟通与逻辑", note: "良好", pct: 76, active: true },
];

export default function ReportClient({ sessionId }: { sessionId: string }) {
  const [expanded, setExpanded] = useState(false);
  const [viewedHintIndexes] = useState<Set<number>>(() => {
    if (typeof window === "undefined") return new Set();

    const raw = window.localStorage.getItem("miraprep:viewed-hints");
    if (!raw) return new Set();

    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed)
        ? new Set(parsed.filter((value) => Number.isInteger(value)))
        : new Set();
    } catch {
      return new Set();
    }
  });
  const all = questions.map((qq, i) => ({ n: `Q${i + 1}`, ...qq }));
  const visible = expanded ? all : all.slice(0, 3);
  const hiddenCount = all.length - visible.length;

  return (
    <div data-session={sessionId} className="min-h-screen bg-[#fafafa]">
      <div className="sticky top-0 z-20 flex items-center justify-between border-b border-[#eee] bg-white/92 px-6 py-4 backdrop-blur-[12px] md:px-10">
        <div className="flex items-center gap-4">
          <Link href="/dashboard" transitionTypes={["nav-back"]} className="mira-button rounded-[9px] border border-[#e5e5e5] bg-white px-3.5 py-2 text-[13px] text-[#525252]">
            ← 工作台
          </Link>
          <Logo size="sm" />
        </div>
        <div className="flex gap-2.5">
          <button className="mira-button rounded-[9px] border border-[#e5e5e5] bg-white px-4 py-2 text-[13px]">
            导出 PDF
          </button>
          <Link href="/interview/setup" transitionTypes={["nav-forward"]} className="mira-button rounded-[9px] bg-orange-500 px-4 py-2 text-[13px] font-medium text-white hover:text-white">
            再练一场
          </Link>
        </div>
      </div>

      <div className="animate-mira-page-in mx-auto max-w-[840px] px-6 pt-10 pb-20 md:px-8">
        <div className="mb-2 font-display text-[13px] text-[#a3a3a3]">
          INTERVIEW REPORT · 2026.07.05
        </div>
        <h1 className="m-0 mb-7 text-[30px] font-bold tracking-[-0.02em]">
          前端工程师 · 中级 面试报告
        </h1>

        <div className="mb-4 grid grid-cols-1 gap-8 rounded-[20px] border border-[#eee] bg-white p-7 sm:grid-cols-[auto_1fr] sm:items-center">
          <div className="text-center sm:border-r sm:border-[#f2f2f2] sm:pr-8">
            <div className="font-display text-[60px] leading-none font-bold text-orange-500">A-</div>
            <div className="mt-1.5 text-[12.5px] text-[#a3a3a3]">综合评级 · 超过 78% 候选人</div>
          </div>
          <div className="flex flex-col gap-3.5">
            {dimensions.map((d) => (
              <div key={d.label}>
                <div className="mb-1.5 flex justify-between text-[13px]">
                  <span>{d.label}</span>
                  <span className="text-[#737373]">{d.note}</span>
                </div>
                <div className="h-[7px] overflow-hidden rounded-sm bg-[#f2f2f2]">
                  <div className={`animate-mira-progress h-full rounded-sm ${d.active ? "bg-orange-500" : "bg-[#d4d4d4]"}`} style={{ width: `${d.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mb-9 rounded-2xl border border-[#ffe0cc] bg-[#fff5ee] px-6 py-5">
          <div className="mb-2 text-[13px] font-semibold text-[#9a3412]">总体评语</div>
          <p className="m-0 text-sm leading-[1.7] text-[#7c2d12]">
            你在项目经历上的准备非常充分，能清晰讲出优化的动机、方案与数据结果，这是最大的加分项。技术追问时反应稳定。建议重点补强系统设计的分层思考，以及在回答中主动交代权衡取舍（trade-off），这会让你的高级评级更进一步。
          </p>
        </div>

        <div className="mb-[18px] flex items-center justify-between">
          <h2 className="m-0 text-[19px] font-semibold">逐题复盘</h2>
          <span className="text-[13px] text-[#a3a3a3]">共 {all.length} 题</span>
        </div>

        <div className="flex flex-col gap-3.5">
          {visible.map((item) => {
            const questionIndex = Number(item.n.slice(1)) - 1;
            const viewedHint = viewedHintIndexes.has(questionIndex);

            return (
            <div key={item.n} className="mira-surface animate-mira-soft-pop overflow-hidden rounded-[18px] border border-[#eee] bg-white">
              <div className="flex items-center gap-3.5 border-b border-[#f5f5f5] px-[22px] py-[18px]">
                <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg bg-[#0a0a0a] font-display text-[13px] text-white">
                  {item.n}
                </span>
                <div className="flex-1 text-[14.5px] leading-[1.5] font-medium">{item.q}</div>
                <div className="shrink-0 text-right">
                  {viewedHint && (
                    <div className="mb-1 rounded-full bg-[#fff5ee] px-2.5 py-1 text-[11px] font-medium text-[#9a3412]">
                      查看过提示
                    </div>
                  )}
                  <span className="font-display text-[15px] font-semibold" style={{ color: item.gradeColor }}>
                    {item.grade}
                  </span>
                  <div className="text-[11.5px] text-[#a3a3a3]">用时 {item.time}</div>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-5 px-[22px] py-[18px] sm:grid-cols-2">
                <div>
                  <div className="mb-2 text-xs font-medium text-[#a3a3a3]">你的回答</div>
                  <p className="m-0 text-[13.5px] leading-relaxed text-[#404040]">{item.a}</p>
                </div>
                <div>
                  <div className="mb-2 text-xs font-medium text-orange-500">参考答案要点</div>
                  <p className="m-0 text-[13.5px] leading-relaxed text-[#404040]">{item.reference}</p>
                </div>
              </div>
              <div className="border-t border-[#f5f5f5] bg-[#fafafa] px-[22px] py-3.5 text-[13px] leading-relaxed text-[#525252]">
                <b className="text-[#0a0a0a]">建议：</b>
                {item.tip}
              </div>
            </div>
            );
          })}

          {hiddenCount > 0 && (
            <div onClick={() => setExpanded(true)} className="mira-button cursor-pointer p-2 text-center">
              <span className="text-[13.5px] text-orange-500">展开其余 {hiddenCount} 题 →</span>
            </div>
          )}
          {expanded && (
            <div onClick={() => setExpanded(false)} className="mira-button cursor-pointer p-2 text-center">
              <span className="text-[13.5px] text-[#a3a3a3]">收起 ↑</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
