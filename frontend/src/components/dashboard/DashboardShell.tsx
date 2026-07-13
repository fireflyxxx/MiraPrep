"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import Logo from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";

const navItems = [
  { label: "工作台", href: "/dashboard" },
  { label: "我的面试", href: "/interviews" },
  { label: "题库训练", href: "/practice" },
];

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const userRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (userRef.current && !userRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <div className="grid min-h-screen grid-cols-1 bg-surface-subtle md:grid-cols-[248px_1fr]">
      <aside className="sticky top-0 hidden h-screen flex-col border-r border-border-subtle bg-surface p-[18px] md:flex">
        <Link href="/" className="mira-button mb-[26px] px-2.5 py-1.5">
          <Logo />
        </Link>

        <nav className="flex flex-col gap-[3px]">
          {navItems.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`mira-button flex items-center gap-[11px] rounded-[10px] px-3 py-2.5 text-sm ${
                  active
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:bg-surface-subtle hover:text-foreground"
                }`}
              >
                <span
                  className={
                    active
                      ? "h-[7px] w-[7px] rounded-[2px] bg-orange-500"
                      : "h-[7px] w-[7px] rounded-[2px] border-[1.5px] border-muted-foreground"
                  }
                />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto">
          <div className="mb-3 flex justify-end px-1">
            <ThemeToggle />
          </div>
          <div ref={userRef} className="relative">
          {menuOpen && (
            <div className="animate-mira-soft-pop absolute bottom-[calc(100%+10px)] left-0 w-full min-w-[232px] overflow-hidden rounded-[16px] border border-border bg-surface p-2 shadow-[0_24px_60px_-22px_rgba(0,0,0,0.3)]">
              <div className="flex items-center gap-2.5 px-2.5 py-2">
                <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-orange-500 text-sm font-semibold text-white">
                  王
                </span>
                <div className="min-w-0">
                  <div className="truncate text-[13.5px] font-medium">王同学</div>
                  <div className="truncate text-[11.5px] text-muted-foreground">wang@example.com</div>
                </div>
              </div>

              <div className="mx-1 mt-1.5 mb-1 rounded-[12px] bg-surface-subtle px-3 py-2.5">
                <div className="flex items-center justify-between text-[12px]">
                  <span className="text-muted-foreground">本月可用额度</span>
                  <span className="font-display font-medium text-foreground">3 / 5 场</span>
                </div>
                <div className="mt-2 h-[6px] w-full overflow-hidden rounded-full bg-border">
                  <div className="h-full w-[60%] rounded-full bg-orange-500" />
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">免费版 · 每月 5 场</span>
                  <span className="cursor-pointer text-[11px] font-medium text-primary hover:underline">
                    升级
                  </span>
                </div>
              </div>

              <div className="my-1 h-px bg-muted" />

              <button className="mira-button flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-left text-[13px] text-foreground hover:bg-surface-subtle">
                <span className="h-[6px] w-[6px] rounded-[2px] border-[1.5px] border-muted-foreground" />
                账户设置
              </button>
              <button className="mira-button flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-left text-[13px] text-foreground hover:bg-surface-subtle">
                <span className="h-[6px] w-[6px] rounded-[2px] border-[1.5px] border-muted-foreground" />
                通知偏好
              </button>

              <div className="my-1 h-px bg-muted" />

              <Link
                href="/auth"
                className="mira-button flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-[13px] text-foreground hover:bg-surface-subtle"
              >
                <span className="h-[6px] w-[6px] rounded-[2px] border-[1.5px] border-muted-foreground" />
                退出登录
              </Link>
            </div>
          )}

          <button
            onClick={() => setMenuOpen((v) => !v)}
            className={`mira-button flex w-full items-center gap-2.5 rounded-[12px] border-t border-muted px-3 py-2.5 text-left ${
              menuOpen ? "bg-surface-subtle" : "hover:bg-surface-subtle"
            }`}
          >
            <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-orange-500 text-sm font-semibold text-white">
              王
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13.5px] font-medium">王同学</div>
              <div className="truncate text-[11.5px] text-muted-foreground">前端工程师 · 免费版</div>
            </div>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              className={`shrink-0 text-muted-foreground transition-transform ${menuOpen ? "rotate-180" : ""}`}
            >
              <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          </div>
        </div>
      </aside>

      <main className="animate-mira-page-in mx-auto w-full max-w-[1000px] px-6 py-9 md:px-11">
        {children}
      </main>
    </div>
  );
}
