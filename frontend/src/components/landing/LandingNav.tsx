"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Logo from "@/components/Logo";

export default function LandingNav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav className="fixed top-0 right-0 left-0 z-50 flex justify-center px-3 pt-3 md:px-6">
      <div
        className={`relative flex h-[68px] items-center justify-between px-5 transition-[width,border-radius,background-color,box-shadow,backdrop-filter,border-color] duration-[900ms] ease-[cubic-bezier(.22,1,.36,1)] md:px-9 ${
          scrolled
            ? "w-[min(980px,calc(100vw-24px))] rounded-[28px] border border-black/[0.08] bg-white/62 shadow-[0_18px_60px_-34px_rgba(10,10,10,.65)] backdrop-blur-[22px]"
            : "w-full rounded-none border border-transparent bg-white/0 shadow-none backdrop-blur-0"
        }`}
      >
        <Link href="/" className="mira-button z-10 flex items-center gap-2.5">
          <Logo />
        </Link>

        <div className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-9 text-sm text-[#525252] sm:flex">
          <a href="#features" className="text-[#525252] transition-colors hover:text-[#0a0a0a]">
            功能
          </a>
          <a href="#how" className="text-[#525252] transition-colors hover:text-[#0a0a0a]">
            工作原理
          </a>
          <a href="#faq" className="text-[#525252] transition-colors hover:text-[#0a0a0a]">
            常见问题
          </a>
        </div>

        <div className="z-10 flex items-center gap-2 md:gap-3">
          <Link
            href="/auth"
            transitionTypes={["nav-forward"]}
            className="mira-button rounded-[11px] px-4 py-[9px] text-sm text-[#0a0a0a] hover:bg-white/65 hover:text-[#0a0a0a]"
          >
            登录
          </Link>
          <Link
            href="/auth"
            transitionTypes={["nav-forward"]}
            className="mira-button rounded-[13px] bg-[#0a0a0a] px-[18px] py-[9px] text-sm font-medium text-white shadow-[0_8px_22px_-16px_rgba(0,0,0,.65)] hover:text-white"
          >
            免费开始
          </Link>
        </div>
      </div>
    </nav>
  );
}
