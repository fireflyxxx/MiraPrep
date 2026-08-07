"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useSetShare, useShareState } from "@/lib/api/report";

/** 剪贴板 API 在非 HTTPS 或旧浏览器上不存在，复制失败要给出可自己选中的兜底。 */
async function copy(text: string) {
  if (!navigator.clipboard?.writeText) {
    throw new Error("当前浏览器不支持一键复制，请手动选中链接");
  }
  await navigator.clipboard.writeText(text);
}

export default function ShareDialog({ sessionId }: { sessionId: string }) {
  const [open, setOpen] = useState(false);
  const { data, isPending } = useShareState(sessionId);
  const setShare = useSetShare(sessionId);
  const enabled = data?.enabled ?? false;
  const shareUrl = data?.shareUrl ?? "";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        className="mira-button hidden rounded-[9px] border border-border bg-surface px-4 py-2 text-[13px] text-muted-foreground sm:block"
        aria-label="分享报告"
      >
        分享
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>分享这份报告</DialogTitle>
          <DialogDescription>
            开启后任何拿到链接的人都能只读查看。公开页会隐去你的姓名、邮箱、电话和录音，
            关闭分享后链接立即失效。
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between rounded-xl border border-border bg-surface-subtle px-4 py-3">
          <div className="text-sm">
            <div className="font-medium">{enabled ? "分享已开启" : "分享已关闭"}</div>
            <div className="text-xs text-muted-foreground">
              {enabled ? "链接对所有人可见" : "只有你自己能看到这份报告"}
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label="分享开关"
            disabled={isPending || setShare.isPending}
            onClick={() => setShare.mutate(!enabled)}
            className={`mira-button rounded-[9px] px-4 py-2 text-[13px] disabled:cursor-not-allowed disabled:opacity-60 ${
              enabled
                ? "border border-border bg-surface text-muted-foreground"
                : "bg-primary text-primary-foreground"
            }`}
          >
            {setShare.isPending ? "处理中…" : enabled ? "关闭分享" : "开启分享"}
          </button>
        </div>

        {enabled && shareUrl ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              readOnly
              value={shareUrl}
              aria-label="分享链接"
              onFocus={(event) => event.currentTarget.select()}
              className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 py-2 font-mono text-[12.5px]"
            />
            <button
              type="button"
              onClick={() =>
                void copy(shareUrl)
                  .then(() => toast.success("链接已复制"))
                  .catch((error: unknown) =>
                    toast.error(
                      error instanceof Error ? error.message : "复制失败，请手动选中链接",
                    ),
                  )
              }
              className="mira-button rounded-xl bg-primary px-4 py-2 text-[13px] text-primary-foreground"
            >
              复制链接
            </button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
