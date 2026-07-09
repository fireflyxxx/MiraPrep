import Link from "next/link";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { interviewHistory } from "@/lib/mock-data";

const dimensions = [
  { label: "技术深度", score: 82 },
  { label: "结构化思维", score: 74 },
  { label: "表达沟通", score: 88 },
  { label: "临场反应", score: 69 },
];

export default function InterviewsPage() {
  return (
    <DashboardShell>
      <div className="mb-[30px]">
        <h1 className="m-0 mb-1.5 text-[27px] font-bold tracking-[-0.02em]">我的面试</h1>
        <p className="m-0 text-[14.5px] text-[#737373]">
          你的面试综合表现与每一场的复盘记录都在这里。
        </p>
      </div>

      <div className="mira-stagger mb-4 grid grid-cols-1 gap-4 md:grid-cols-[1fr_1.5fr]">
        <div className="mira-surface flex flex-col justify-between rounded-[20px] border border-[#eee] bg-white p-[26px]">
          <div className="font-display text-[12.5px] tracking-[0.05em] text-orange-500">
            OVERALL GRADE
          </div>
          <div className="mt-4 flex items-end gap-3">
            <span className="font-display text-[64px] leading-[0.9] font-bold text-orange-500">
              B+
            </span>
            <span className="mb-1.5 text-[13px] text-[#a3a3a3]">综合评级</span>
          </div>
          <p className="m-0 mt-3 text-[13px] leading-[1.6] text-[#737373]">
            基于最近 7 场面试的加权表现。技术表达稳定，系统设计题仍有提升空间。
          </p>
        </div>

        <div className="mira-surface rounded-[20px] border border-[#eee] bg-white p-[26px]">
          <div className="mb-5 text-sm font-semibold">能力维度</div>
          <div className="flex flex-col gap-[18px]">
            {dimensions.map((d) => (
              <div key={d.label}>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-[13px] text-[#525252]">{d.label}</span>
                  <span className="font-display text-[13px] font-medium text-[#0a0a0a]">
                    {d.score}
                  </span>
                </div>
                <div className="h-[7px] w-full overflow-hidden rounded-full bg-[#f0f0f0]">
                  <div
                    className="h-full rounded-full bg-orange-500"
                    style={{ width: `${d.score}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="animate-mira-soft-pop overflow-hidden rounded-[20px] border border-[#eee] bg-white [animation-delay:.16s]">
        <div className="flex items-center justify-between border-b border-[#f2f2f2] px-6 py-5">
          <h3 className="m-0 text-base font-semibold">全部面试</h3>
          <span className="font-display text-[13px] text-[#a3a3a3]">
            共 {interviewHistory.length} 场
          </span>
        </div>
        <div>
          {interviewHistory.map((item, i) => (
            <Link
              key={i}
              href={`/report/demo-${i + 1}`}
              transitionTypes={["nav-forward"]}
              className={`mira-button grid cursor-pointer grid-cols-[1fr_auto_auto_auto] items-center gap-5 px-6 py-4 hover:bg-[#fafafa] ${
                i < interviewHistory.length - 1 ? "border-b border-[#f5f5f5]" : ""
              }`}
            >
              <div className="flex items-center gap-3.5">
                <span
                  className="flex h-[38px] w-[38px] items-center justify-center rounded-[10px] font-display font-bold"
                  style={{ background: item.gradeBg, color: item.gradeColor }}
                >
                  {item.grade}
                </span>
                <div>
                  <div className="text-sm font-medium">{item.role}</div>
                  <div className="text-xs text-[#a3a3a3]">{item.meta}</div>
                </div>
              </div>
              <span className="text-[12.5px] text-[#a3a3a3]">{item.when}</span>
              <span className="rounded-full bg-[#f0fdf4] px-2.5 py-1 text-xs text-[#16a34a]">
                已完成
              </span>
              <span className="text-[13px] text-orange-500">查看报告 →</span>
            </Link>
          ))}
        </div>
      </div>
    </DashboardShell>
  );
}
