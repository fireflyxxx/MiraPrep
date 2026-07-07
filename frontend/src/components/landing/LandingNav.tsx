"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Logo from "@/components/Logo";

export default function LandingNav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      className={`sticky top-0 z-50 flex items-center justify-between px-10 py-[18px] transition-colors duration-200 ${
        scrolled
          ? "border-b border-[#ececec] bg-white/72 shadow-[0_1px_12px_rgba(0,0,0,0.03)] backdrop-blur-[14px]"
          : "border-b border-transparent bg-transparent"
      }`}
    >
      <div className="flex items-center gap-11">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#0a0a0a] font-display text-[15px] font-bold text-white">
            M
          </span>
          <Logo />
        </Link>
        <div className="flex gap-7.5 text-sm text-[#525252]">
          <a href="#features" className="text-[#525252] hover:text-[#0a0a0a]">
            功能
          </a>
          <a href="#how" className="text-[#525252] hover:text-[#0a0a0a]">
            工作原理
          </a>
          <a href="#faq" className="text-[#525252] hover:text-[#0a0a0a]">
            常见问题
          </a>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Link
          href="/auth"
          className="rounded-[9px] px-4 py-[9px] text-sm text-[#0a0a0a] hover:text-[#0a0a0a]"
        >
          登录
        </Link>
        <Link
          href="/auth"
          className="rounded-[9px] bg-[#0a0a0a] px-[18px] py-[9px] text-sm font-medium text-white hover:text-white"
        >
          免费开始
        </Link>
      </div>
    </nav>
  );
}
