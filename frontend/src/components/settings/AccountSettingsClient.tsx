"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { deleteMyAccount } from "@/lib/api/auth";
import { clearAuthTokens } from "@/lib/api/auth-token";
import { ApiError } from "@/lib/api/types";

export default function AccountSettingsClient() {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [accepted, setAccepted] = useState(false);
  const router = useRouter();
  const queryClient = useQueryClient();
  const canDelete = accepted && password.length >= 8 && confirmation === "DELETE";

  const deletion = useMutation({
    mutationFn: () =>
      deleteMyAccount({
        password,
        confirmation: "DELETE",
      }),
    onSuccess: () => {
      clearAuthTokens();
      queryClient.clear();
      toast.success("账号及全部数据已永久删除");
      router.replace("/auth");
    },
    onError: (error) => {
      const message =
        error instanceof ApiError && error.code === 40101
          ? "密码不正确"
          : "删除失败，账号数据尚未移除，请稍后重试";
      toast.error(message);
    },
  });

  return (
    <div className="space-y-7">
      <header>
        <p className="text-sm text-muted-foreground">账户与隐私</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">账户设置</h1>
      </header>

      <section className="rounded-[18px] border border-red-200 bg-surface p-5 shadow-sm sm:p-6">
        <h2 className="text-lg font-semibold text-red-700">删除我的全部数据</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          此操作会永久删除账号、简历、面试会话、消息、报告以及私有存储中的简历和音频，无法恢复。
          删除前请先自行保存仍需保留的报告或资料。
        </p>

        <form
          className="mt-5 max-w-xl space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (canDelete) deletion.mutate();
          }}
        >
          <div>
            <label htmlFor="delete-password" className="mb-1.5 block text-sm font-medium">
              当前密码
            </label>
            <input
              id="delete-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mira-field w-full rounded-[10px] border border-border bg-white px-3.5 py-3 text-sm outline-none"
            />
          </div>

          <div>
            <label htmlFor="delete-confirmation" className="mb-1.5 block text-sm font-medium">
              输入 DELETE 确认
            </label>
            <input
              id="delete-confirmation"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              placeholder="DELETE"
              autoComplete="off"
              className="mira-field w-full rounded-[10px] border border-border bg-white px-3.5 py-3 text-sm outline-none"
            />
          </div>

          <label className="flex items-start gap-2.5 text-sm leading-5 text-muted-foreground">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(event) => setAccepted(event.target.checked)}
              className="mt-1"
            />
            我了解该操作不可逆，并确认删除所有个人数据。
          </label>

          <button
            type="submit"
            disabled={!canDelete || deletion.isPending}
            className="mira-button rounded-[10px] bg-red-600 px-4 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {deletion.isPending ? "正在删除…" : "永久删除账号"}
          </button>
        </form>
      </section>
    </div>
  );
}
