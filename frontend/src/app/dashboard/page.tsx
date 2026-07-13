import Link from "next/link";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { resumes } from "@/lib/mock-data";

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

      <div className="animate-mira-soft-pop overflow-hidden rounded-[20px] border border-border-subtle bg-surface [animation-delay:.16s]">
        <div className="flex items-center justify-between border-b border-muted px-6 py-5">
          <div>
            <h3 className="m-0 text-base font-semibold">我的简历</h3>
            <p className="m-0 mt-0.5 text-[12.5px] text-muted-foreground">
              面试题目会围绕这些简历生成
            </p>
          </div>
          <label
            htmlFor="resume-upload"
            className="mira-button flex cursor-pointer items-center gap-1.5 rounded-[10px] bg-primary-soft px-3.5 py-2 text-[13px] font-medium text-primary hover:bg-primary/15"
          >
            <span className="text-base leading-none">+</span>
            添加简历
          </label>
          <input id="resume-upload" type="file" accept=".pdf" className="hidden" />
        </div>
        <div>
          {resumes.map((r) => (
            <div
              key={r.id}
              className="mira-button flex items-center gap-3.5 border-b border-muted px-6 py-4 last:border-b-0 hover:bg-surface-subtle"
            >
              <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px] bg-primary-soft font-display text-[11px] font-bold text-primary">
                PDF
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{r.name}</div>
                <div className="text-xs text-muted-foreground">{r.meta}</div>
              </div>
              <button className="mira-button rounded-lg px-3 py-1.5 text-[12.5px] text-muted-foreground hover:bg-muted hover:text-foreground">
                查看
              </button>
              <Link
                href="/interview/setup"
                transitionTypes={["nav-forward"]}
                className="mira-button rounded-lg px-3 py-1.5 text-[12.5px] font-medium text-primary hover:bg-primary-soft"
              >
                用它面试 →
              </Link>
            </div>
          ))}
        </div>
      </div>
    </DashboardShell>
  );
}
