import Link from "next/link";
import DashboardShell from "@/components/dashboard/DashboardShell";
import DashboardResumeSection from "@/components/resume/DashboardResumeSection";

export default function DashboardPage() {
  return (
    <DashboardShell>
      <div className="mb-[30px]">
        <h1 className="m-0 mb-1.5 text-[27px] font-bold tracking-[-0.02em]">
          下午好，王同学 👋
        </h1>
        <p className="m-0 text-[14.5px] text-muted-foreground">
          距离你上次面试已经 3 天，保持手感，继续练一场吧。
        </p>
      </div>

      <div className="mira-stagger mb-4 grid grid-cols-1 gap-4 md:grid-cols-[1.4fr_1fr]">
        <div className="relative overflow-hidden rounded-[20px] border border-primary/15 bg-primary-soft p-[30px] shadow-[0_24px_60px_-40px_rgba(249,115,22,0.4)]">
          <div
            className="absolute -top-[60px] -right-[30px] h-60 w-60"
            style={{ background: "radial-gradient(circle, rgba(249,115,22,.22), transparent 65%)" }}
          />
          <div
            className="absolute -bottom-[70px] -left-[50px] h-56 w-56"
            style={{ background: "radial-gradient(circle, rgba(249,115,22,.10), transparent 68%)" }}
          />
          <div className="relative">
            <div className="mb-3 font-display text-[12.5px] tracking-[0.05em] text-orange-500">
              READY WHEN YOU ARE
            </div>
            <h2 className="m-0 mb-2 text-2xl font-bold tracking-[-0.01em] text-foreground">
              准备一场新的面试
            </h2>
            <p className="m-0 mb-6 max-w-[320px] text-sm leading-[1.55] text-muted-foreground">
              上传简历、选择岗位，Mira 会为你定制一轮完整的仿真面试。
            </p>
            <Link href="/interview/setup" transitionTypes={["nav-forward"]} className="mira-button inline-block rounded-[11px] bg-orange-500 px-[26px] py-[13px] text-[15px] font-medium text-white shadow-[0_10px_26px_rgba(249,115,22,0.32)] hover:text-white hover:shadow-[0_14px_32px_rgba(249,115,22,0.4)]">
              开始准备 →
            </Link>
          </div>
        </div>
        <div className="grid grid-rows-2 gap-4">
          <div className="mira-surface flex flex-col justify-between rounded-[20px] border border-border-subtle bg-surface p-[22px]">
            <div className="text-[13px] text-muted-foreground">累计面试</div>
            <div className="flex items-baseline gap-2">
              <span className="font-display text-[34px] font-bold">7</span>
              <span className="text-[13px] text-muted-foreground">场</span>
            </div>
          </div>
          <div className="mira-surface flex flex-col justify-between rounded-[20px] border border-border-subtle bg-surface p-[22px]">
            <div className="text-[13px] text-muted-foreground">最高评级</div>
            <div className="flex items-baseline gap-2">
              <span className="font-display text-[34px] font-bold text-orange-500">A-</span>
              <span className="text-[13px] text-muted-foreground">前端 · 上周</span>
            </div>
          </div>
        </div>
      </div>

      <DashboardResumeSection />
    </DashboardShell>
  );
}
