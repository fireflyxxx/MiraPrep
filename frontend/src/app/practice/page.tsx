import DashboardShell from "@/components/dashboard/DashboardShell";

export default function PracticePage() {
  return (
    <DashboardShell>
      <div className="mb-[30px]">
        <h1 className="m-0 mb-1.5 text-[27px] font-bold tracking-[-0.02em]">题库训练</h1>
        <p className="m-0 text-[14.5px] text-muted-foreground">
          按方向、难度自由刷题，随时练习单点能力。
        </p>
      </div>

      <div className="flex min-h-[280px] flex-col items-center justify-center rounded-[20px] border border-dashed border-border bg-surface px-6 py-16 text-center">
        <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-[14px] bg-primary-soft font-display text-lg font-bold text-primary">
          ⌁
        </span>
        <h2 className="m-0 mb-2 text-lg font-semibold">题库训练即将上线</h2>
        <p className="m-0 max-w-[360px] text-sm leading-[1.6] text-muted-foreground">
          正在整理覆盖各方向的高频面试题，很快你就能在这里进行针对性练习。
        </p>
      </div>
    </DashboardShell>
  );
}
