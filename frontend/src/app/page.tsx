import type { ReactNode } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Check,
  FileText,
  Mic2,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";
import FaqAccordion from "@/components/landing/FaqAccordion";
import Hero from "@/components/landing/Hero";
import LandingNav from "@/components/landing/LandingNav";
import ReportShowcase from "@/components/landing/ReportShowcase";
import RevealOnScroll from "@/components/landing/RevealOnScroll";
import StatBar from "@/components/landing/StatBar";
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

const steps = [
  { n: "01", title: "上传简历", desc: "拖入 PDF 简历，或选择历史简历。" },
  { n: "02", title: "选择岗位与要求", desc: "确定目标岗位、难度与补充信息。" },
  { n: "03", title: "进行仿真面试", desc: "语音或打字，和 Mira 完整对话。" },
  { n: "04", title: "获取评级报告", desc: "拿到评估、逐题复盘与改进建议。" },
];

function SectionEyebrow({ children }: { children: ReactNode }) {
  return (
    <div className="mb-[14px] font-display text-[12px] font-medium tracking-[0.12em] text-orange-500 uppercase">
      {children}
    </div>
  );
}

function FeatureCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <RevealOnScroll
      className={`mira-surface group relative min-h-[300px] overflow-hidden rounded-[24px] border border-black/[0.07] bg-white p-6 hover:border-orange-200 md:p-7 ${className}`}
    >
      {children}
    </RevealOnScroll>
  );
}

export default function LandingPage() {
  return (
    <div
      className="relative overflow-hidden bg-white text-[#0a0a0a]"
      style={{
        fontFamily:
          '"Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif',
      }}
    >
      <LandingNav />

      <Hero />

      <section className="mx-auto mt-10 max-w-[1180px] px-6 md:px-10">
        <div className="mb-[22px] text-center font-display text-[12px] tracking-[0.1em] text-[#a3a3a3] uppercase">
          覆盖主流方向的面试题库
        </div>
        <div className="mira-stagger flex flex-wrap justify-center gap-2.5">
          {trackTags.map((tag) => (
            <span
              key={tag}
              className="mira-surface rounded-full border border-[#eee] bg-white px-4 py-2 text-[13px] text-[#525252]"
            >
              {tag}
            </span>
          ))}
        </div>
      </section>

      <StatBar />

      <section
        id="features"
        aria-labelledby="features-heading"
        className="mx-auto mt-[118px] max-w-[1180px] scroll-mt-[100px] px-6 md:px-10"
      >
        <RevealOnScroll className="mb-12 max-w-[680px]">
          <SectionEyebrow>Why MiraPrep</SectionEyebrow>
          <h2
            id="features-heading"
            className="text-[32px] leading-[1.14] font-bold tracking-[-0.03em] md:text-[42px]"
          >
            一场完整训练，五种核心能力
          </h2>
          <p className="mt-4 max-w-[590px] text-[15px] leading-7 text-[#737373]">
            从简历理解、动态追问到逐题复盘，每一步都在同一条训练链路里，而不是互不相干的刷题工具。
          </p>
        </RevealOnScroll>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <FeatureCard className="lg:col-span-7">
            <div className="pointer-events-none absolute -top-24 -right-16 h-[320px] w-[320px] rounded-full bg-[radial-gradient(circle,rgba(249,115,22,.12),transparent_66%)]" />
            <div className="relative z-10 max-w-[440px]">
              <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500 text-white">
                <Target aria-hidden="true" className="h-5 w-5" />
              </div>
              <h3 className="text-[22px] font-semibold tracking-[-0.025em]">顺着你的回答，继续追问</h3>
              <p className="mt-2 max-w-[420px] text-[14px] leading-6 text-[#737373]">
                Mira 会记住上下文，识别模糊表述和关键决策，把一段回答追到真正能证明能力的细节。
              </p>
            </div>
            <div className="relative z-10 mt-7 grid gap-2 text-[12px] sm:grid-cols-[1fr_18px_1fr_18px_1fr] sm:items-center">
              {[
                ["Q1", "为什么选这个方案？"],
                ["Q2", "当时有哪些约束？"],
                ["Q3", "结果如何验证？"],
              ].map(([label, text], index) => (
                <div key={label} className="contents">
                  <div className="rounded-xl border border-black/[0.07] bg-[#fafafa] p-3.5">
                    <span className="font-display text-[10px] text-orange-500">{label}</span>
                    <div className="mt-1 text-[#525252]">{text}</div>
                  </div>
                  {index < 2 ? (
                    <ArrowUpRight aria-hidden="true" className="hidden h-4 w-4 rotate-45 text-[#d4d4d4] sm:block" />
                  ) : null}
                </div>
              ))}
            </div>
          </FeatureCard>

          <FeatureCard className="lg:col-span-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
              <FileText aria-hidden="true" className="h-5 w-5" />
            </div>
            <h3 className="mt-5 text-[21px] font-semibold tracking-[-0.025em]">真正读懂你的简历</h3>
            <p className="mt-2 text-[14px] leading-6 text-[#737373]">
              项目、技能和目标岗位共同决定问题，不再面对千篇一律的题单。
            </p>
            <div className="mt-7 rounded-2xl border border-black/[0.07] bg-[#fafafa] p-4">
              <div className="flex items-center justify-between border-b border-black/[0.06] pb-3 text-[11px] text-[#a3a3a3]">
                <span>resume_chen.pdf</span>
                <span className="text-[#16a34a]">解析完成</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {["React", "性能优化", "状态管理", "B2B SaaS", "3 年经验"].map((tag) => (
                  <span key={tag} className="rounded-md border border-orange-100 bg-orange-50 px-2.5 py-1.5 text-[11px] text-orange-700">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </FeatureCard>

          <FeatureCard className="lg:col-span-4">
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
                <Mic2 aria-hidden="true" className="h-5 w-5" />
              </div>
              <span className="rounded-full bg-[#f5f5f5] px-2.5 py-1 text-[10px] text-[#737373]">语音 / 文字</span>
            </div>
            <h3 className="mt-5 text-[20px] font-semibold tracking-[-0.02em]">像现场一样说出来</h3>
            <p className="mt-2 text-[13px] leading-6 text-[#737373]">实时转写保留思考节奏，也能随时切回文字确认。</p>
            <div className="mt-7 flex h-16 items-center justify-center gap-1 rounded-2xl border border-[#ffe6d5] bg-[#fff8f2]" aria-hidden="true">
              {[18, 30, 44, 24, 50, 36, 22, 42, 28, 16, 34, 46, 25].map((height, index) => (
                <span
                  key={`${height}-${index}`}
                  className="w-1 rounded-full bg-orange-500/90"
                  style={{ height }}
                />
              ))}
            </div>
          </FeatureCard>

          <FeatureCard className="lg:col-span-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
              <TrendingUp aria-hidden="true" className="h-5 w-5" />
            </div>
            <h3 className="mt-5 text-[20px] font-semibold tracking-[-0.02em]">能力不是一个总分</h3>
            <p className="mt-2 text-[13px] leading-6 text-[#737373]">五个维度拆开看，才能知道下一次该改变什么。</p>
            <div className="mt-6 space-y-3">
              {[
                ["表达逻辑", 88],
                ["项目深度", 82],
                ["岗位匹配", 91],
              ].map(([label, value]) => (
                <div key={label}>
                  <div className="mb-1.5 flex justify-between text-[11px] text-[#737373]">
                    <span>{label}</span>
                    <span className="font-display text-[#171717]">{value}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-black/[0.06]">
                    <div className="h-full rounded-full bg-orange-500" style={{ width: `${value}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </FeatureCard>

          <FeatureCard className="lg:col-span-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
              <Sparkles aria-hidden="true" className="h-5 w-5" />
            </div>
            <h3 className="mt-5 text-[20px] font-semibold tracking-[-0.02em]">建议能直接拿去练</h3>
            <p className="mt-2 text-[13px] leading-6 text-[#737373]">不是“回答得更具体”，而是告诉你下一遍应该怎么组织。</p>
            <div className="mt-6 rounded-2xl border border-orange-200/70 bg-[#fff8f2] p-4">
              <div className="flex gap-2 text-[11px] font-medium text-orange-800">
                <Check aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                用四段结构重答这道题
              </div>
              <div className="mt-3 grid grid-cols-4 gap-1.5 text-center font-display text-[9px] text-orange-700/70">
                {["约束", "对比", "决策", "结果"].map((item) => (
                  <span key={item} className="rounded-md bg-white px-1 py-2 shadow-sm">{item}</span>
                ))}
              </div>
            </div>
          </FeatureCard>
        </div>
      </section>

      <section
        id="report-demo"
        aria-labelledby="report-heading"
        className="mx-auto mt-[124px] max-w-[1180px] scroll-mt-[100px] px-6 md:px-10"
      >
        <RevealOnScroll className="mb-11 flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div className="max-w-[680px]">
            <SectionEyebrow>Evidence, not vibes</SectionEyebrow>
            <h2 id="report-heading" className="text-[32px] leading-[1.14] font-bold tracking-[-0.03em] md:text-[42px]">
              面试结束，真正的提升才开始
            </h2>
          </div>
          <p className="max-w-[360px] text-[14px] leading-6 text-[#737373] md:text-right">
            每道题都留下证据、判断与下一步动作。你看到的不只是一个分数，而是一份可以反复使用的训练计划。
          </p>
        </RevealOnScroll>
        <RevealOnScroll>
          <ReportShowcase />
        </RevealOnScroll>
      </section>

      <section
        id="how"
        aria-labelledby="how-heading"
        className="mx-auto mt-[124px] max-w-[1180px] scroll-mt-[100px] px-6 md:px-10"
      >
        <RevealOnScroll className="mb-11 flex flex-wrap items-end justify-between gap-4">
          <div>
            <SectionEyebrow>How it works</SectionEyebrow>
            <h2 id="how-heading" className="text-[32px] leading-[1.15] font-bold tracking-[-0.03em] md:text-[40px]">
              四步，开始你的面试训练
            </h2>
          </div>
          <Link
            href="/auth"
            transitionTypes={["nav-forward"]}
            className="mira-button rounded-[10px] border border-[#e5e5e5] bg-white px-[22px] py-3 text-sm font-medium text-[#0a0a0a] hover:text-[#0a0a0a]"
          >
            立即开始
          </Link>
        </RevealOnScroll>
        <div className="grid grid-cols-1 gap-[18px] sm:grid-cols-2 md:grid-cols-4">
          {steps.map((step, index) => (
            <RevealOnScroll key={step.n} className={`pt-5 ${index === 0 ? "border-t-2 border-[#0a0a0a]" : "border-t-2 border-[#e5e5e5]"}`}>
              <div className="mb-3.5 font-display text-sm text-[#a3a3a3]">{step.n}</div>
              <h3 className="mb-2 text-base font-semibold">{step.title}</h3>
              <p className="text-[13.5px] leading-relaxed text-[#737373]">{step.desc}</p>
            </RevealOnScroll>
          ))}
        </div>
      </section>

      <section
        id="faq"
        aria-labelledby="faq-heading"
        className="mx-auto mt-[124px] grid max-w-[1180px] scroll-mt-[100px] gap-10 px-6 md:px-10 lg:grid-cols-[.72fr_1.28fr] lg:gap-20"
      >
        <RevealOnScroll>
          <SectionEyebrow>Frequently asked</SectionEyebrow>
          <h2 id="faq-heading" className="text-[32px] leading-[1.14] font-bold tracking-[-0.03em] md:text-[40px]">
            开始前，你可能还想知道
          </h2>
          <p className="mt-4 max-w-[360px] text-[14px] leading-7 text-[#737373]">
            如果这里没有你的问题，也可以先体验演示，不需要上传真实资料。
          </p>
        </RevealOnScroll>
        <RevealOnScroll>
          <FaqAccordion />
        </RevealOnScroll>
      </section>

      <section aria-labelledby="cta-heading" className="mx-auto mt-[124px] max-w-[1180px] px-6 md:px-10">
        <RevealOnScroll className="relative overflow-hidden rounded-[28px] border border-orange-200/70 bg-[linear-gradient(120deg,#fff8f2,#ffffff_62%)] px-7 py-14 shadow-[0_30px_80px_-52px_rgba(249,115,22,.55)] md:px-14 md:py-16">
          <div className="pointer-events-none absolute -top-40 -right-20 h-[440px] w-[440px] rounded-full bg-orange-300/25 blur-[80px]" />
          <div className="relative flex flex-col gap-9 md:flex-row md:items-end md:justify-between">
            <div className="max-w-[610px]">
              <div className="mb-4 font-display text-[11px] tracking-[0.12em] text-orange-500 uppercase">Your next interview</div>
              <h2 id="cta-heading" className="text-[34px] leading-[1.08] font-bold tracking-[-0.035em] md:text-[46px]">
                下一场面试，
                <br />
                别再靠临场发挥。
              </h2>
              <p className="mt-5 text-[15px] leading-7 text-[#737373]">现在上传简历，几分钟内开始你的第一场仿真面试。</p>
            </div>
            <Link
              href="/auth"
              transitionTypes={["nav-forward"]}
              className="mira-button group inline-flex shrink-0 self-start rounded-[12px] bg-orange-500 px-7 py-3.5 text-[15px] font-medium text-white shadow-[0_12px_30px_-12px_rgba(249,115,22,.7)] hover:text-white md:self-auto"
            >
              免费开始
              <ArrowUpRight aria-hidden="true" className="ml-2 h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </Link>
          </div>
        </RevealOnScroll>
      </section>

      <footer className="mx-auto mt-20 flex max-w-[1180px] flex-wrap items-center justify-between gap-4 border-t border-[#f0f0f0] px-6 pt-10 pb-[60px] md:px-10">
        <Logo size="sm" />
        <div className="text-[13px] text-[#a3a3a3]">© 2026 MiraPrep Labs · 让每一次面试都有准备</div>
      </footer>
    </div>
  );
}
