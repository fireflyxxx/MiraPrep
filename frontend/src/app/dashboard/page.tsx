import Link from "next/link";
import Logo from "@/components/Logo";
import { interviewHistory } from "@/lib/mock-data";

const sidebarItems = [
  { label: "工作台", active: true },
  { label: "我的简历", active: false },
  { label: "面试记录", active: false },
  { label: "题库训练", active: false },
  { label: "设置", active: false },
];

export default function DashboardPage() {
  return (
    <div className="animate-mira-screen-in grid min-h-screen grid-cols-1 bg-[#fafafa] md:grid-cols-[248px_1fr]">
      <aside className="sticky top-0 hidden h-screen flex-col border-r border-[#eee] bg-white p-[18px] pt-6 md:flex">
        <Link href="/" className="mb-[26px] px-2.5 py-1.5">
          <Logo />
        </Link>
        <nav className="flex flex-col gap-[3px]">
          {sidebarItems.map((item) => (
            <div
              key={item.label}
              className={`flex cursor-pointer items-center gap-[11px] rounded-[10px] px-3 py-2.5 text-sm ${
                item.active
                  ? "bg-[#f5f5f5] font-medium"
                  : "text-[#525252]"
              }`}
            >
              <span
                className={
                  item.active
                    ? "h-[7px] w-[7px] rounded-[2px] bg-orange-500"
                    : "h-[7px] w-[7px] rounded-[2px] border-[1.5px] border-[#a3a3a3]"
                }
              />
              {item.label}
            </div>
          ))}
        </nav>
        <div className="mt-auto flex items-center gap-2.5 border-t border-[#f2f2f2] px-3 py-2.5">
          <span className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-orange-500 text-sm font-semibold text-white">
            王
          </span>
          <div className="min-w-0">
            <div className="text-[13.5px] font-medium">王同学</div>
            <div className="text-[11.5px] text-[#a3a3a3]">前端工程师 · 免费版</div>
          </div>
        </div>
      </aside>

      <main className="mx-auto w-full max-w-[1000px] px-6 py-9 md:px-11">
        <div className="mb-[30px] flex items-start justify-between">
          <div>
            <h1 className="m-0 mb-1.5 text-[27px] font-bold tracking-[-0.02em]">
              下午好，王同学 👋
            </h1>
            <p className="m-0 text-[14.5px] text-[#737373]">
              距离你上次面试已经 3 天，保持手感，继续练一场吧。
            </p>
          </div>
          <span className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-orange-500 font-semibold text-white">
            王
          </span>
        </div>

        <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-[1.4fr_1fr]">
          <div className="relative overflow-hidden rounded-[20px] bg-[#0a0a0a] p-[30px]">
            <div
              className="absolute -top-[60px] -right-[30px] h-60 w-60"
              style={{
                background:
                  "radial-gradient(circle, rgba(249,115,22,.4), transparent 65%)",
              }}
            />
            <div className="relative">
              <div className="mb-3 font-display text-[12.5px] tracking-[0.05em] text-orange-500">
                READY WHEN YOU ARE
              </div>
              <h2 className="m-0 mb-2 text-2xl font-bold tracking-[-0.01em] text-white">
                准备一场新的面试
              </h2>
              <p className="m-0 mb-6 max-w-[320px] text-sm leading-[1.55] text-[#a3a3a3]">
                上传简历、选择岗位，Mira 会为你定制一轮完整的仿真面试。
              </p>
              <Link
                href="/interview/setup"
                className="inline-block rounded-[11px] bg-orange-500 px-[26px] py-[13px] text-[15px] font-medium text-white hover:text-white"
              >
                开始准备 →
              </Link>
            </div>
          </div>
          <div className="grid grid-rows-2 gap-4">
            <div className="flex flex-col justify-between rounded-[20px] border border-[#eee] bg-white p-[22px]">
              <div className="text-[13px] text-[#737373]">累计面试</div>
              <div className="flex items-baseline gap-2">
                <span className="font-display text-[34px] font-bold">7</span>
                <span className="text-[13px] text-[#a3a3a3]">场</span>
              </div>
            </div>
            <div className="flex flex-col justify-between rounded-[20px] border border-[#eee] bg-white p-[22px]">
              <div className="text-[13px] text-[#737373]">最高评级</div>
              <div className="flex items-baseline gap-2">
                <span className="font-display text-[34px] font-bold text-orange-500">
                  A-
                </span>
                <span className="text-[13px] text-[#a3a3a3]">前端 · 上周</span>
              </div>
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-[20px] border border-[#eee] bg-white">
          <div className="flex items-center justify-between border-b border-[#f2f2f2] px-6 py-5">
            <h3 className="m-0 text-base font-semibold">面试记录</h3>
            <span className="cursor-pointer text-[13px] text-[#a3a3a3]">
              查看全部
            </span>
          </div>
          <div>
            {interviewHistory.map((item, i) => (
              <Link
                key={i}
                href={`/report/demo-${i + 1}`}
                className={`grid cursor-pointer grid-cols-[1fr_auto_auto_auto] items-center gap-5 px-6 py-4 hover:bg-[#fafafa] ${
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
      </main>
    </div>
  );
}
