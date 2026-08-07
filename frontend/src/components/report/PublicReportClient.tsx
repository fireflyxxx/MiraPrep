"use client";

import Link from "next/link";
import Logo from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { usePublicReport } from "@/lib/api/report";
import { ReportBody } from "./ReportClient";

function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-surface-subtle">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border-subtle bg-surface/92 px-4 py-4 backdrop-blur-[12px] sm:px-6 md:px-7">
        <Logo />
        <div className="flex items-center gap-2.5">
          <ThemeToggle />
          <Link
            href="/"
            className="mira-button rounded-[9px] bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground"
          >
            了解 MiraPrep
          </Link>
        </div>
      </header>
      {children}
    </div>
  );
}

/**
 * 公开分享页。没有 AuthGuard——这是全站唯一一个不需要登录的内容页。
 *
 * 页面本身不做脱敏：脱敏必须发生在服务端，前端隐藏等于没隐藏（打开网络面板就看见了）。
 * 这里能拿到什么，就是后端愿意公开的全部。
 */
export default function PublicReportClient({ shareToken }: { shareToken: string }) {
  const { data, isPending, isError } = usePublicReport(shareToken);

  if (isPending) {
    return (
      <PublicShell>
        <main
          aria-label="报告加载中"
          className="mx-auto min-h-[760px] max-w-[920px] animate-pulse px-6 pt-10 pb-20"
        >
          <div className="mb-3 h-4 w-48 rounded bg-muted" />
          <div className="mb-7 h-9 w-80 max-w-full rounded bg-muted" />
          <div className="mb-5 h-[360px] rounded-[20px] bg-muted" />
        </main>
      </PublicShell>
    );
  }

  if (isError || !data) {
    return (
      <PublicShell>
        <main className="mx-auto flex min-h-[620px] max-w-lg items-center px-6 text-center">
          <div className="w-full rounded-2xl border border-border bg-surface p-8">
            <h1 className="mb-2 text-2xl font-semibold">链接已失效</h1>
            <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
              这份报告的分享已被关闭，或者链接不正确。请向分享者索取新的链接。
            </p>
            <Link
              href="/"
              className="mira-button inline-block rounded-xl bg-primary px-5 py-2.5 text-primary-foreground"
            >
              回到首页
            </Link>
          </div>
        </main>
      </PublicShell>
    );
  }

  return (
    <PublicShell>
      <div className="mx-auto max-w-[920px] px-6 pt-6 md:px-8">
        <p className="rounded-xl border border-primary/20 bg-primary-soft px-4 py-3 text-[13px] text-primary">
          这是一份分享的只读面试报告，姓名、联系方式与录音已隐去。
        </p>
      </div>
      {/* 不传 trend：历史趋势是分享者的个人数据，不该跟着链接一起流出去。 */}
      <ReportBody report={data} />
    </PublicShell>
  );
}
