"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Logo from "@/components/Logo";

export default function AuthPage() {
  const [tab, setTab] = useState<"login" | "register">("login");
  const router = useRouter();
  const isRegister = tab === "register";

  const handleSubmit = () => {
    router.push(isRegister ? "/onboarding" : "/dashboard");
  };

  return (
    <div className="animate-mira-screen-in flex min-h-screen flex-col justify-between px-6 py-10 md:px-14">
      <Link href="/" className="cursor-pointer">
        <Logo size="lg" />
      </Link>

      <div className="mx-auto w-full max-w-[380px] py-12">
        <h1 className="m-0 mb-2 text-[30px] font-bold tracking-[-0.02em]">
          欢迎回来
        </h1>
        <p className="m-0 mb-8 text-[14.5px] text-[#737373]">
          登录后继续你的面试准备。
        </p>

        <div className="mb-[26px] flex rounded-[11px] bg-[#f5f5f5] p-1">
          <button
            onClick={() => setTab("login")}
            className={`flex-1 rounded-lg py-[9px] text-sm font-medium transition-all ${
              tab === "login"
                ? "bg-white text-[#0a0a0a] shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
                : "bg-transparent text-[#737373]"
            }`}
          >
            登录
          </button>
          <button
            onClick={() => setTab("register")}
            className={`flex-1 rounded-lg py-[9px] text-sm font-medium transition-all ${
              tab === "register"
                ? "bg-white text-[#0a0a0a] shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
                : "bg-transparent text-[#737373]"
            }`}
          >
            注册
          </button>
        </div>

        {isRegister && (
          <>
            <label className="mb-[7px] block text-[13px] font-medium">
              昵称
            </label>
            <input
              placeholder="你希望 Mira 怎么称呼你"
              className="mb-4 w-full rounded-[10px] border border-[#e5e5e5] bg-white px-3.5 py-3 text-sm outline-none"
            />
          </>
        )}

        <label className="mb-[7px] block text-[13px] font-medium">邮箱</label>
        <input
          placeholder="you@example.com"
          className="mb-4 w-full rounded-[10px] border border-[#e5e5e5] bg-white px-3.5 py-3 text-sm outline-none"
        />

        <label className="mb-[7px] block text-[13px] font-medium">密码</label>
        <input
          type="password"
          placeholder="••••••••"
          className="mb-[22px] w-full rounded-[10px] border border-[#e5e5e5] bg-white px-3.5 py-3 text-sm outline-none"
        />

        <button
          onClick={handleSubmit}
          className="mb-4 w-full rounded-[11px] bg-[#0a0a0a] py-[13px] text-[15px] font-medium text-white"
        >
          {isRegister ? "创建账号" : "登录"}
        </button>

        <div className="mb-4 flex items-center gap-3 text-[12.5px] text-[#a3a3a3]">
          <span className="h-px flex-1 bg-[#eee]" />或
          <span className="h-px flex-1 bg-[#eee]" />
        </div>
        <div className="flex gap-2.5">
          <button className="flex-1 rounded-[10px] border border-[#e5e5e5] bg-white py-[11px] text-[13.5px]">
            微信登录
          </button>
          <button className="flex-1 rounded-[10px] border border-[#e5e5e5] bg-white py-[11px] text-[13.5px]">
            GitHub
          </button>
        </div>
      </div>

      <div className="text-center text-[12.5px] text-[#a3a3a3]">
        登录即代表同意 Mira 的服务条款与隐私政策
      </div>
    </div>
  );
}
