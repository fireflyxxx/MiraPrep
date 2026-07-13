"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { clearAuthTokens, useAuthToken } from "@/lib/api/auth-token";
import { refreshAccessToken } from "@/lib/api/client";

/** 在客户端恢复登录态，避免受保护页面各自重复鉴权与跳转逻辑。 */
export default function AuthGuard({ children }: { children: ReactNode }) {
  const { token } = useAuthToken();
  const router = useRouter();
  useEffect(() => {
    if (token) return;

    void refreshAccessToken()
      .catch(() => {
        clearAuthTokens();
        router.replace("/auth");
      });
  }, [router, token]);

  if (!token) return null;
  return <>{children}</>;
}
