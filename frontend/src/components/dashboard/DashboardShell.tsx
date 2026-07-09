"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import Logo from "@/components/Logo";

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
    <div className="grid min-h-screen grid-cols-1 bg-[#fafafa] md:grid-cols-[248px_1fr]">
      <aside className="sticky top-0 hidden h-screen flex-col border-r border-[#eee] bg-white p-[18px] md:flex">
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
                    ? "bg-[#f5f5f5] font-medium text-[#0a0a0a]"
                    : "text-[#525252] hover:bg-[#fafafa] hover:text-[#0a0a0a]"
                }`}
              >
                <span
                  className={
                    active
                      ? "h-[7px] w-[7px] rounded-[2px] bg-orange-500"
                      : "h-[7px] w-[7px] rounded-[2px] border-[1.5px] border-[#a3a3a3]"
                  }
                />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div ref={userRef} className="relative mt-auto">
          {menuOpen && (
            <div className="animate-mira-soft-pop absolute bottom-[calc(100%+10px)] left-0 w-full min-w-[232px] overflow-hidden rounded-[16px] border border-[#ececec] bg-white p-2 shadow-[0_24px_60px_-22px_rgba(0,0,0,0.3)]">
              <div className="flex items-center gap-2.5 px-2.5 py-2">
                <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-orange-500 text-sm font-semibold text-white">
                  王
                </span>
                <div className="min-w-0">
                  <div className="truncate text-[13.5px] font-medium">王同学</div>
                  <div className="truncate text-[11.5px] text-[#a3a3a3]">wang@example.com</div>
                </div>
              </div>

              <div className="mx-1 mt-1.5 mb-1 rounded-[12px] bg-[#fafafa] px-3 py-2.5">
                <div className="flex items-center justify-between text-[12px]">
                  <span className="text-[#737373]">本月可用额度</span>
                  <span className="font-display font-medium text-[#0a0a0a]">3 / 5 场</span>
                </div>
                <div className="mt-2 h-[6px] w-full overflow-hidden rounded-full bg-[#ececec]">
                  <div className="h-full w-[60%] rounded-full bg-orange-500" />
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-[11px] text-[#a3a3a3]">免费版 · 每月 5 场</span>
                  <span className="cursor-pointer text-[11px] font-medium text-orange-500 hover:underline">
                    升级
                  </span>
                </div>
              </div>

              <div className="my-1 h-px bg-[#f2f2f2]" />

              <button className="mira-button flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-left text-[13px] text-[#404040] hover:bg-[#fafafa]">
                <span className="h-[6px] w-[6px] rounded-[2px] border-[1.5px] border-[#a3a3a3]" />
                账户设置
              </button>
              <button className="mira-button flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-left text-[13px] text-[#404040] hover:bg-[#fafafa]">
                <span className="h-[6px] w-[6px] rounded-[2px] border-[1.5px] border-[#a3a3a3]" />
                通知偏好
              </button>

              <div className="my-1 h-px bg-[#f2f2f2]" />

              <Link
                href="/auth"
                className="mira-button flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-[13px] text-[#404040] hover:bg-[#fafafa]"
              >
                <span className="h-[6px] w-[6px] rounded-[2px] border-[1.5px] border-[#a3a3a3]" />
                退出登录
              </Link>
            </div>
          )}

          <button
            onClick={() => setMenuOpen((v) => !v)}
            className={`mira-button flex w-full items-center gap-2.5 rounded-[12px] border-t border-[#f2f2f2] px-3 py-2.5 text-left ${
              menuOpen ? "bg-[#fafafa]" : "hover:bg-[#fafafa]"
            }`}
          >
            <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-orange-500 text-sm font-semibold text-white">
              王
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13.5px] font-medium">王同学</div>
              <div className="truncate text-[11.5px] text-[#a3a3a3]">前端工程师 · 免费版</div>
            </div>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              className={`shrink-0 text-[#a3a3a3] transition-transform ${menuOpen ? "rotate-180" : ""}`}
            >
              <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </aside>

      <main className="animate-mira-page-in mx-auto w-full max-w-[1000px] px-6 py-9 md:px-11">
        {children}
      </main>
    </div>
  );
}
