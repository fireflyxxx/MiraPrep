import Link from "next/link";

export default async function InterviewResultPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-white px-6 py-8 text-[#0a0a0a]">
      <div
        className="pointer-events-none absolute top-[-12%] left-1/2 h-[640px] w-[640px] -translate-x-1/2"
        style={{ background: "radial-gradient(circle, rgba(249,115,22,.1), transparent 62%)" }}
      />
      <div className="animate-mira-page-in relative w-full max-w-[520px] text-center">
        <div className="mb-6 font-display text-[13px] tracking-[0.06em] text-[#a3a3a3]">
          面试已完成 · 前端工程师 · 中级
        </div>

        <div className="relative mx-auto mb-[26px] flex h-[170px] w-[170px] items-center justify-center rounded-full bg-white shadow-[0_16px_50px_-16px_rgba(249,115,22,0.3)]">
          <div
            className="animate-mira-progress absolute -inset-px rounded-full p-1.5"
            style={{
              background: "conic-gradient(#f97316 0 78%, #f0f0f0 78% 100%)",
              WebkitMask:
                "radial-gradient(farthest-side, transparent calc(100% - 6px), #000 calc(100% - 6px))",
            }}
          />
          <div className="text-center">
            <div className="font-display text-[64px] leading-none font-bold text-orange-500">A-</div>
            <div className="mt-1 text-xs text-[#a3a3a3]">综合评级</div>
          </div>
        </div>

        <h1 className="m-0 mb-2.5 text-[30px] font-bold tracking-[-0.02em]">
          表现不错，接近优秀！
        </h1>
        <p className="mx-auto mb-8 max-w-[400px] text-[15px] leading-relaxed text-[#737373]">
          你在项目深度和技术表达上很扎实，系统设计题还有提升空间。完整复盘看下面的报告。
        </p>

        <div className="mira-stagger mb-8 grid grid-cols-3 gap-3">
          <div className="rounded-2xl border border-[#eee] bg-[#fafafa] px-3 py-[18px]">
            <div className="font-display text-2xl font-bold">8</div>
            <div className="mt-1 text-xs text-[#a3a3a3]">回答题数</div>
          </div>
          <div className="rounded-2xl border border-[#eee] bg-[#fafafa] px-3 py-[18px]">
            <div className="font-display text-2xl font-bold">
              42<span className="text-sm text-[#a3a3a3]">min</span>
            </div>
            <div className="mt-1 text-xs text-[#a3a3a3]">总用时</div>
          </div>
          <div className="rounded-2xl border border-[#eee] bg-[#fafafa] px-3 py-[18px]">
            <div className="font-display text-2xl font-bold text-orange-500">+2</div>
            <div className="mt-1 text-xs text-[#a3a3a3]">较上次</div>
          </div>
        </div>

        <div className="flex gap-3">
          <Link href="/dashboard" transitionTypes={["nav-back"]} className="mira-button flex-1 rounded-xl border border-[#e5e5e5] bg-white py-3.5 text-[14.5px] text-[#0a0a0a] hover:text-[#0a0a0a]">
            返回工作台
          </Link>
          <Link href={`/report/${sessionId}`} transitionTypes={["nav-forward"]} className="mira-button flex-[1.4] rounded-xl bg-orange-500 py-3.5 text-[14.5px] font-medium text-white shadow-[0_8px_24px_rgba(249,115,22,0.3)] hover:text-white">
            查看完整报告 →
          </Link>
        </div>
      </div>
    </div>
  );
}
