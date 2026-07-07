import Link from "next/link";
import LandingNav from "@/components/landing/LandingNav";
import Logo from "@/components/Logo";

const trackTags = [
  "前端工程",
  "后端开发",
  "算法",
  "产品经理",
  "数据分析",
  "数据科学",
  "运营",
  "市场",
];

const features = [
  {
    title: "会追问的面试官",
    desc: "不是念稿式提问。Mira 会顺着你的回答深挖细节、追问权衡取舍，像真实面试一样带来压力与节奏。",
    icon: (
      <span className="block h-4 w-4 rounded-full border-[3px] border-orange-500" />
    ),
  },
  {
    title: "基于你的简历定制",
    desc: "上传简历后，题目会围绕你的真实项目、技术栈与目标岗位生成，问到你简历里的每一个细节。",
    icon: <span className="block h-4 w-4 rounded-[3px] bg-orange-500" />,
  },
  {
    title: "结构化评估报告",
    desc: "每道题都有你的回答、参考答案、耗时与改进建议，最后给出综合评级，清楚知道下一步该练什么。",
    icon: (
      <span className="block h-4 w-4 rotate-45 border-[3px] border-orange-500" />
    ),
  },
];

const steps = [
  { n: "01", title: "上传简历", desc: "拖入 PDF 简历，或选择历史简历。" },
  { n: "02", title: "选择岗位与要求", desc: "确定目标岗位、难度与补充信息。" },
  { n: "03", title: "进行仿真面试", desc: "语音或打字，与 Mira 完整对话。" },
  { n: "04", title: "获取评级报告", desc: "拿到评级、逐题复盘与改进建议。" },
];

export default function LandingPage() {
  return (
    <div className="relative">
      <LandingNav />

      <section className="mx-auto grid max-w-[1180px] grid-cols-1 items-center gap-14 px-10 pt-24 pb-10 md:grid-cols-[1.05fr_.95fr]">
        <div>
          <h1 className="m-0 mb-[22px] text-[42px] leading-[1.08] font-bold tracking-[-0.03em] md:text-[60px] md:leading-[1.05]">
            像真实面试一样，
            <br />
            练到你拿下{" "}
            <span className="font-display text-orange-500">offer</span>
          </h1>
          <p className="m-0 mb-[34px] max-w-[520px] text-lg leading-relaxed text-[#525252]">
            上传你的简历，Mira 会像真正的面试官一样，围绕你的经历与目标岗位展开一轮完整、有深度、会追问的仿真面试，并给出结构化评估报告。
          </p>
          <div className="flex flex-wrap items-center gap-3.5">
            <Link
              href="/auth"
              transitionTypes={["nav-forward"]}
              className="rounded-[11px] bg-orange-500 px-[26px] py-3.5 text-[15px] font-medium text-white shadow-[0_6px_20px_rgba(249,115,22,0.28)] transition-all hover:-translate-y-0.5 hover:text-white hover:shadow-[0_10px_26px_rgba(249,115,22,0.36)]"
            >
              开始一场面试 →
            </Link>
            <Link
              href="/interview/demo"
              transitionTypes={["nav-forward"]}
              className="rounded-[11px] border border-[#e5e5e5] bg-white px-6 py-3.5 text-[15px] font-medium text-[#0a0a0a] transition-all hover:border-[#d4d4d4] hover:bg-[#fafafa] hover:text-[#0a0a0a]"
            >
              观看演示
            </Link>
          </div>
          <div className="mt-[34px] flex items-center gap-4 text-[13px] text-[#a3a3a3]">
            <div className="flex">
              <span className="h-[30px] w-[30px] rounded-full border-2 border-white bg-[#e5e5e5]" />
              <span className="-ml-2.5 h-[30px] w-[30px] rounded-full border-2 border-white bg-[#d4d4d4]" />
              <span className="-ml-2.5 h-[30px] w-[30px] rounded-full border-2 border-white bg-orange-500" />
            </div>
            已帮助 <span className="font-medium text-[#0a0a0a]">12,800+</span>{" "}
            位候选人准备面试
          </div>
        </div>

        <div className="relative">
          <div
            className="absolute -inset-[30px] rounded-[40px]"
            style={{
              background:
                "radial-gradient(circle at 70% 30%, rgba(249,115,22,.12), transparent 60%)",
            }}
          />
          <div className="animate-mira-float relative rounded-[22px] border border-[#ededed] bg-white p-[22px] shadow-[0_24px_60px_-20px_rgba(0,0,0,0.18)]">
            <div className="mb-[18px] flex items-center justify-between border-b border-[#f2f2f2] pb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] bg-[#0a0a0a] font-display text-[15px] font-bold text-white">
                  M
                </div>
                <div>
                  <div className="text-[13.5px] font-medium">Mira 面试官</div>
                  <div className="text-[11px] text-[#a3a3a3]">
                    前端工程师 · 第 3 / 8 题
                  </div>
                </div>
              </div>
              <div className="rounded-lg bg-[#f5f5f5] px-2.5 py-1 font-display text-[13px] text-[#525252]">
                14:32
              </div>
            </div>
            <div className="mb-3.5 flex gap-2.5">
              <div className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-lg bg-[#0a0a0a] text-[11px] text-white">
                M
              </div>
              <div className="rounded-[4px_14px_14px_14px] bg-[#f6f6f6] px-3.5 py-[11px] text-[13.5px] leading-[1.55] text-[#171717]">
                你在项目里提到用了状态管理，能说说当时为什么不直接用 Context，而选择了额外的库吗？
              </div>
            </div>
            <div className="mb-3.5 flex flex-row-reverse gap-2.5">
              <div className="h-[26px] w-[26px] shrink-0 rounded-lg bg-[#e5e5e5]" />
              <div className="rounded-[14px_4px_14px_14px] border border-[#ffe0cc] bg-[#fff5ee] px-3.5 py-[11px] text-[13.5px] leading-[1.55] text-[#7c2d12]">
                主要是因为跨层级的高频更新，Context 会引起大范围重渲染……
              </div>
            </div>
            <div className="flex items-center gap-2.5 rounded-xl bg-[#0a0a0a] px-3.5 py-2.5">
              <div className="flex h-[18px] items-end gap-[3px]">
                <span className="animate-mira-bar block h-full w-[3px] rounded-sm bg-orange-500" />
                <span className="animate-mira-bar-2 block h-full w-[3px] rounded-sm bg-orange-500" />
                <span className="animate-mira-bar-4 block h-full w-[3px] rounded-sm bg-orange-500" />
                <span className="animate-mira-bar-6 block h-full w-[3px] rounded-sm bg-orange-500" />
              </div>
              <span className="text-[12.5px] text-[#a3a3a3]">
                正在聆听你的回答…
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto mt-10 max-w-[1180px] px-10">
        <div className="mb-[22px] text-center font-display text-[12.5px] tracking-[0.08em] text-[#a3a3a3] uppercase">
          覆盖主流方向的面试题库
        </div>
        <div className="flex flex-wrap justify-center gap-2.5">
          {trackTags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-[#eee] px-4 py-2 text-[13.5px] text-[#525252]"
            >
              {tag}
            </span>
          ))}
        </div>
      </section>

      <section
        id="features"
        className="mx-auto mt-[110px] max-w-[1180px] scroll-mt-[90px] px-10"
      >
        <div className="mb-12 max-w-[640px]">
          <div className="mb-[14px] font-display text-[13px] font-medium tracking-[0.04em] text-orange-500">
            WHY MIRAPREP
          </div>
          <h2 className="m-0 text-[32px] leading-[1.15] font-bold tracking-[-0.02em] md:text-[38px]">
            不是刷题，是真的把面试
            <br />
            完整走一遍
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              className="rounded-[18px] border border-[#eee] p-7 transition-all hover:-translate-y-[3px] hover:border-[#ffd9bd] hover:shadow-[0_12px_30px_-14px_rgba(249,115,22,0.25)]"
            >
              <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-[#fff5ee]">
                {f.icon}
              </div>
              <h3 className="m-0 mb-2.5 text-lg font-semibold">{f.title}</h3>
              <p className="m-0 text-sm leading-relaxed text-[#737373]">
                {f.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section
        id="how"
        className="mx-auto mt-[110px] max-w-[1180px] scroll-mt-[90px] px-10"
      >
        <div className="mb-11 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-[14px] font-display text-[13px] font-medium tracking-[0.04em] text-orange-500">
              HOW IT WORKS
            </div>
            <h2 className="m-0 text-[32px] leading-[1.15] font-bold tracking-[-0.02em] md:text-[38px]">
              四步，开始你的面试
            </h2>
          </div>
          <Link
            href="/auth"
            transitionTypes={["nav-forward"]}
            className="rounded-[10px] border border-[#e5e5e5] bg-white px-[22px] py-3 text-sm font-medium text-[#0a0a0a] hover:text-[#0a0a0a]"
          >
            立即开始
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-[18px] md:grid-cols-4">
          {steps.map((s, i) => (
            <div
              key={s.n}
              className={`pt-5 ${
                i === 0 ? "border-t-2 border-[#0a0a0a]" : "border-t-2 border-[#e5e5e5]"
              }`}
            >
              <div className="mb-3.5 font-display text-sm text-[#a3a3a3]">
                {s.n}
              </div>
              <h3 className="m-0 mb-2 text-base font-semibold">{s.title}</h3>
              <p className="m-0 text-[13.5px] leading-relaxed text-[#737373]">
                {s.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto mt-[110px] max-w-[1180px] px-10">
        <div className="relative overflow-hidden rounded-[26px] bg-[#0a0a0a] px-8 py-16 md:px-14">
          <div
            className="absolute -top-20 -right-10 h-80 w-80"
            style={{
              background:
                "radial-gradient(circle, rgba(249,115,22,.35), transparent 65%)",
            }}
          />
          <div className="relative max-w-[560px]">
            <h2 className="m-0 mb-[18px] text-[32px] leading-[1.1] font-bold tracking-[-0.02em] text-white md:text-[40px]">
              下一场面试，
              <br />
              别再靠临场发挥。
            </h2>
            <p className="m-0 mb-[30px] text-base leading-relaxed text-[#a3a3a3]">
              现在上传简历，5 分钟内开始你的第一场仿真面试。
            </p>
            <Link
              href="/auth"
              transitionTypes={["nav-forward"]}
              className="inline-block rounded-[11px] bg-orange-500 px-7 py-3.5 text-[15px] font-medium text-white hover:text-white"
            >
              免费开始 →
            </Link>
          </div>
        </div>
      </section>

      <footer
        id="faq"
        className="mx-auto mt-20 flex max-w-[1180px] scroll-mt-[90px] flex-wrap items-center justify-between gap-4 border-t border-[#f0f0f0] px-10 pt-10 pb-[60px]"
      >
        <Logo size="sm" />
        <div className="text-[13px] text-[#a3a3a3]">
          © 2026 MiraPrep Labs · 让每一次面试都不慌
        </div>
      </footer>
    </div>
  );
}
