"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { z } from "zod";
import Logo from "@/components/Logo";
import { login, register, sendVerificationCode } from "@/lib/api/auth";
import { setAuthTokens } from "@/lib/api/auth-token";
import { ApiError } from "@/lib/api/types";

const loginSchema = z.object({
  email: z.string().trim().email("请输入正确的邮箱地址"),
  password: z.string().min(8, "密码至少需要 8 位").max(128, "密码不能超过 128 位"),
});

const registerSchema = loginSchema.extend({
  nickname: z.string().trim().min(1, "请输入昵称").max(100, "昵称不能超过 100 个字符"),
  code: z.string().length(6, "请输入 6 位验证码"),
});

type FormErrors = Partial<Record<"email" | "password" | "nickname" | "code", string>>;

function fieldClass(error?: string) {
  return `mira-field w-full rounded-[10px] border bg-white px-3.5 py-3 text-sm outline-none ${
    error ? "border-red-500 animate-mira-shake" : "border-[#e5e5e5]"
  }`;
}

function messageFor(error: Error): string {
  if (error instanceof ApiError) {
    if (error.code === 40101) return "邮箱或密码错误";
    if (error.code === 42900) return "尝试次数过多，请稍后再试";
    if (error.code === 40000) return "验证码无效或已过期";
    if (error.code === 42901) return "验证码请求过于频繁，请稍后再试";
  }
  return "请求失败，请稍后重试";
}

function passwordStrength(password: string): string {
  if (!password) return "";
  if (password.length < 8) return "密码至少需要 8 位";
  if (/[A-Z]/.test(password) && /[0-9]/.test(password) && /[^A-Za-z0-9]/.test(password)) {
    return "密码强度：强";
  }
  return "密码强度：可用";
}

export default function AuthPage() {
  const [tab, setTab] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [code, setCode] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [secondsLeft, setSecondsLeft] = useState(0);
  const router = useRouter();
  const isRegister = tab === "register";

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = window.setTimeout(() => setSecondsLeft((seconds) => seconds - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [secondsLeft]);

  const authMutation = useMutation({
    mutationFn: async () => {
      const values = { email, password, nickname, code };
      const showValidationErrors = (zodIssues: z.core.$ZodIssue[]) => {
        const fieldErrors: FormErrors = {};
        for (const issue of zodIssues) {
          const field = issue.path[0] as keyof FormErrors;
          fieldErrors[field] ??= issue.message;
        }
        setErrors(fieldErrors);
      };

      setErrors({});
      if (isRegister) {
        const parsed = registerSchema.safeParse(values);
        if (!parsed.success) {
          showValidationErrors(parsed.error.issues);
          throw new Error("FORM_INVALID");
        }
        return register(parsed.data);
      }

      const parsed = loginSchema.safeParse(values);
      if (!parsed.success) {
        showValidationErrors(parsed.error.issues);
        throw new Error("FORM_INVALID");
      }
      return login(parsed.data);
    },
    onSuccess: (result) => {
      setAuthTokens(result);
      toast.success(isRegister ? "账号创建成功" : "登录成功");
      router.push(result.user.isFirstLogin ? "/onboarding" : "/dashboard", {
        transitionTypes: result.user.isFirstLogin ? ["nav-modal-in"] : ["nav-forward"],
      });
    },
    onError: (error) => {
      if (error.message === "FORM_INVALID") return;
      const message = messageFor(error);
      if (isRegister && error instanceof ApiError && error.code === 40000) {
        setErrors({ code: message });
      } else {
        setErrors({ email: message, password: message });
      }
      toast.error(message);
    },
  });

  const sendCodeMutation = useMutation({
    mutationFn: () => sendVerificationCode(email),
    onSuccess: () => {
      setSecondsLeft(60);
      toast.success("验证码已发送，请查收邮箱");
    },
    onError: (error) => toast.error(messageFor(error)),
  });

  const switchTab = (next: "login" | "register") => {
    setTab(next);
    setErrors({});
  };

  const handleSendCode = () => {
    const parsed = z.string().trim().email("请输入正确的邮箱地址").safeParse(email);
    if (!parsed.success) {
      setErrors({ email: parsed.error.issues[0]?.message });
      return;
    }
    setErrors((current) => ({ ...current, email: undefined }));
    sendCodeMutation.mutate();
  };

  return (
    <div className="flex min-h-screen flex-col justify-between px-7 py-6 md:px-7">
      <Link href="/" transitionTypes={["nav-back"]} className="mira-button w-fit cursor-pointer">
        <Logo />
      </Link>

      <div className="animate-mira-page-in mx-auto w-full max-w-[380px] py-12">
        <h1 className="m-0 mb-2 text-[30px] font-bold tracking-[-0.02em]">
          {isRegister ? "创建 MiraPrep 账号" : "欢迎回来"}
        </h1>
        <p className="m-0 mb-8 text-[14.5px] text-[#737373]">
          {isRegister ? "完成注册后，我们会帮你生成第一套训练配置。" : "登录后继续你的面试准备。"}
        </p>

        <div className="mb-[26px] flex rounded-[11px] bg-[#f5f5f5] p-1">
          <button type="button" onClick={() => switchTab("login")} className={`mira-button flex-1 rounded-lg py-[9px] text-sm font-medium ${tab === "login" ? "bg-white text-[#0a0a0a] shadow-[0_1px_3px_rgba(0,0,0,0.08)]" : "bg-transparent text-[#737373]"}`}>登录</button>
          <button type="button" onClick={() => switchTab("register")} className={`mira-button flex-1 rounded-lg py-[9px] text-sm font-medium ${tab === "register" ? "bg-white text-[#0a0a0a] shadow-[0_1px_3px_rgba(0,0,0,0.08)]" : "bg-transparent text-[#737373]"}`}>注册</button>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            authMutation.mutate();
          }}
        >
          <div key={tab} className="animate-mira-rise">
            {isRegister && <>
              <label htmlFor="nickname" className="mb-[7px] block text-[13px] font-medium">昵称</label>
              <input id="nickname" value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="你希望 Mira 怎么称呼你" className={`${fieldClass(errors.nickname)} mb-1`} />
              {errors.nickname && <p className="mb-3 text-xs text-red-600">{errors.nickname}</p>}
            </>}

            <label htmlFor="email" className="mb-[7px] block text-[13px] font-medium">邮箱</label>
            <input id="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" className={`${fieldClass(errors.email)} mb-1`} />
            {errors.email && <p className="mb-3 text-xs text-red-600">{errors.email}</p>}

            {isRegister && <div className="mb-4 flex gap-2">
              <input aria-label="验证码" value={code} onChange={(event) => setCode(event.target.value)} placeholder="6 位验证码" maxLength={6} className={`${fieldClass(errors.code)} flex-1`} />
              <button type="button" onClick={handleSendCode} disabled={secondsLeft > 0 || sendCodeMutation.isPending} className="mira-button shrink-0 rounded-[10px] border border-[#e5e5e5] px-3 text-[12px] disabled:cursor-not-allowed disabled:opacity-50">
                {secondsLeft > 0 ? `${secondsLeft}s 后重发` : sendCodeMutation.isPending ? "发送中…" : "发送验证码"}
              </button>
            </div>}
            {isRegister && errors.code && <p className="-mt-3 mb-3 text-xs text-red-600">{errors.code}</p>}

            <label htmlFor="password" className="mb-[7px] block text-[13px] font-medium">密码</label>
            <input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" className={`${fieldClass(errors.password)} mb-1`} />
            {isRegister && passwordStrength(password) && <p className="mb-2 text-xs text-[#737373]">{passwordStrength(password)}</p>}
            {errors.password && <p className="mb-3 text-xs text-red-600">{errors.password}</p>}
          </div>

          <button type="submit" disabled={authMutation.isPending} className="mira-button mt-4 mb-4 w-full rounded-[11px] bg-[#0a0a0a] py-[13px] text-[15px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-60">
            {authMutation.isPending ? "请稍候…" : isRegister ? "创建账号" : "登录"}
          </button>
        </form>

        <div className="mb-4 flex items-center gap-3 text-[12.5px] text-[#a3a3a3]"><span className="h-px flex-1 bg-[#eee]" />或<span className="h-px flex-1 bg-[#eee]" /></div>
        <div className="flex gap-2.5">
          <button type="button" className="mira-button flex-1 rounded-[10px] border border-[#e5e5e5] bg-white py-[11px] text-[13.5px]">微信登录</button>
          <button type="button" className="mira-button flex-1 rounded-[10px] border border-[#e5e5e5] bg-white py-[11px] text-[13.5px]">GitHub</button>
        </div>
      </div>

      <div className="text-center text-[12.5px] text-[#a3a3a3]">登录即代表同意 Mira 的服务条款与隐私政策</div>
    </div>
  );
}
