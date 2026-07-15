"use client";

import { useEffect, useMemo, useState } from "react";
import {
  selectInitialResumeId,
  useDeleteResume,
  useResumeDetail,
  useResumeLibrary,
  useUpdateResume,
} from "@/lib/api/resume";
import ParsePreviewCard from "./ParsePreviewCard";
import ResumeCard from "./ResumeCard";

export default function ResumeList({
  mode,
  selectedId,
  onSelect,
  emptyMessage,
  retryUpload,
}: {
  mode: "dashboard" | "setup";
  selectedId?: number | null;
  onSelect?: (id: number | null) => void;
  emptyMessage: string;
  retryUpload?: () => void;
}) {
  const library = useResumeLibrary();
  const update = useUpdateResume();
  const remove = useDeleteResume();
  const [previewId, setPreviewId] = useState<number | null>(null);
  const detail = useResumeDetail(previewId);
  const items = useMemo(() => library.data?.items ?? [], [library.data?.items]);

  useEffect(() => {
    if (selectedId && !items.some((item) => item.id === selectedId && item.parseStatus === "success")) {
      onSelect?.(selectInitialResumeId(items, null));
    }
  }, [items, onSelect, selectedId]);

  if (library.isPending) return <div className="grid gap-2 py-3">{[1, 2].map((item) => <div key={item} className="h-[74px] animate-pulse rounded-xl bg-muted" />)}</div>;
  if (library.isError) return <div className="py-8 text-center"><p className="text-sm text-red-600">{library.error instanceof Error ? library.error.message : "简历加载失败"}</p><button type="button" onClick={() => void library.refetch()} className="mt-3 rounded-lg bg-primary-soft px-3 py-2 text-xs font-medium text-primary">重试</button></div>;
  if (!items.length) return <div className="py-10 text-center text-sm text-muted-foreground">{emptyMessage}</div>;

  return (
    <>
      <div className={mode === "setup" ? "flex flex-col gap-2.5" : ""}>
        {items.map((resume) => (
          <ResumeCard
            key={resume.id}
            resume={resume}
            selected={selectedId === resume.id}
            mode={mode}
            onSelect={(id) => onSelect?.(id)}
            onView={setPreviewId}
            onRename={async (id, fileName) => { await update.mutateAsync({ id, fileName }); }}
            onSetDefault={async (id) => { await update.mutateAsync({ id, isDefault: true }); }}
            onDelete={async (id) => { await remove.mutateAsync(id); if (previewId === id) setPreviewId(null); }}
          />
        ))}
      </div>
      {previewId !== null && detail.isPending && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 text-white">正在加载简历详情…</div>}
      {previewId !== null && detail.isError && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-5"><div className="rounded-xl bg-surface p-5 text-center"><p className="text-sm text-red-600">详情加载失败</p><button type="button" onClick={() => void detail.refetch()} className="mt-3 text-sm text-primary">重试</button><button type="button" onClick={() => setPreviewId(null)} className="ml-4 text-sm text-muted-foreground">关闭</button></div></div>}
      {detail.data && <ParsePreviewCard
        resume={detail.data}
        onClose={() => setPreviewId(null)}
        onRetry={retryUpload ? () => {
          setPreviewId(null);
          retryUpload();
        } : undefined}
      />}
    </>
  );
}
