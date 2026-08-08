"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Logo from "@/components/Logo";
import { loginWithGithub } from "@/lib/api/auth";
import { setAuthTokens } from "@/lib/api/auth-token";
import { consumeGitHubState } from "@/lib/api/github-oauth";

/** GitHub 授权后跳回这里，带 `?code=&state=`。换完登录态就把用户送走，这一页不留在历史里。 */
export default function GitHubCallbackPage() {
  const router = useRouter();
  // 授权码只能换一次；React 严格模式下 effect 会跑两次，第二次会烧掉 code 并报错。
  const exchangedRef = useRef(false);

  useEffect(() => {
    if (exchangedRef.current) return;
    exchangedRef.current = true;

    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const expectedState = consumeGitHubState();

    if (!code || !expectedState || params.get("state") !== expectedState) {
      toast.error("GitHub 登录校验失败，请重新发起");
      router.replace("/auth");
      return;
    }

    loginWithGithub(code)
      .then((result) => {
        setAuthTokens(result);
        toast.success("登录成功");
        router.replace(result.user.isFirstLogin ? "/onboarding" : "/dashboard");
      })
      .catch(() => {
        toast.error("GitHub 登录失败，请重试");
        router.replace("/auth");
      });
  }, [router]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-7">
      <Logo />
      <p className="m-0 text-[14.5px] text-[#737373]">正在完成 GitHub 登录…</p>
    </div>
  );
}
