"use client";

import Link from "next/link";
import { useState, type MouseEvent } from "react";
import type { ResumeSummary } from "@/lib/api/resume";

function formatSize(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function statusText(status: ResumeSummary["parseStatus"]): string {
  if (status === "pending") return "解析中";
  if (status === "failed") return "解析失败";
  return "解析完成";
}

export default function ResumeCard({
  resume,
  selected = false,
  mode,
  onSelect,
  onView,
  onRename,
  onDelete,
  onSetDefault,
}: {
  resume: ResumeSummary;
  selected?: boolean;
  mode: "dashboard" | "setup";
  onSelect?: (id: number) => void;
  onView: (id: number) => void;
  onRename: (id: number, fileName: string) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onSetDefault: (id: number) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(resume.fileName);
  const selectable = mode !== "setup" || resume.parseStatus === "success";
  const stop = (event: MouseEvent) => event.stopPropagation();
  const saveName = async () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === resume.fileName) { setEditing(false); setName(resume.fileName); return; }
    try {
      await onRename(resume.id, trimmed);
    } catch {
      setName(resume.fileName);
    } finally {
      setEditing(false);
    }
  };

  return (
    <article
      onClick={() => { if (selectable) onSelect?.(resume.id); }}
      className={`mira-button flex flex-wrap items-center gap-3.5 border-b border-muted px-5 py-4 last:border-b-0 hover:bg-surface-subtle ${mode === "setup" ? "rounded-xl border" : ""} ${mode === "setup" && selectable ? "cursor-pointer" : ""} ${mode === "setup" && !selectable ? "cursor-not-allowed opacity-60" : ""} ${selected ? "border-primary bg-primary-soft/40" : ""}`}
    >
      <span className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[10px] bg-primary-soft font-display text-[10px] font-bold text-primary">
        {resume.fileName.toLowerCase().endsWith(".docx") ? "DOCX" : "PDF"}
      </span>
      <div className="min-w-[180px] flex-1">
        {editing ? (
          <div className="flex gap-2" onClick={stop}>
            <input aria-label="简历名称" value={name} onChange={(event) => setName(event.target.value)} className="mira-field min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 py-1 text-sm" autoFocus />
            <button type="button" onClick={() => void saveName()} className="text-xs font-medium text-primary">保存</button>
            <button type="button" onClick={() => { setEditing(false); setName(resume.fileName); }} className="text-xs text-muted-foreground">取消</button>
          </div>
        ) : (
          <div className="truncate text-sm font-medium">{resume.fileName}</div>
        )}
        <div className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
          <span>{formatSize(resume.fileSize)}</span>
          {resume.pageCount ? <span>{resume.pageCount} 页</span> : null}
          <span className={resume.parseStatus === "failed" ? "text-red-600" : resume.parseStatus === "pending" ? "text-primary" : ""}>{statusText(resume.parseStatus)}</span>
          {resume.isDefault ? <span className="text-primary">默认</span> : null}
        </div>
      </div>
      {mode === "setup" && (
        <span aria-label={selected ? "已选择" : "未选择"} className={`flex h-5 w-5 items-center justify-center rounded-full border ${selected ? "border-primary bg-orange-500 text-xs text-white" : "border-border"}`}>
          {selected ? "✓" : ""}
        </span>
      )}
      <div className="flex flex-wrap items-center justify-end gap-1" onClick={stop}>
        <button type="button" onClick={() => onView(resume.id)} className="mira-button rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">查看</button>
        <button type="button" onClick={() => setEditing(true)} className="mira-button rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted">重命名</button>
        {!resume.isDefault && <button type="button" onClick={() => { void onSetDefault(resume.id).catch(() => {}); }} className="mira-button rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted">设为默认</button>}
        <button type="button" onClick={() => { if (window.confirm("确定删除这份简历吗？")) void onDelete(resume.id).catch(() => {}); }} className="mira-button rounded-lg px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-50">删除</button>
        {mode === "dashboard" && resume.parseStatus === "success" && (
          <Link href={`/interview/setup?resumeId=${resume.id}`} transitionTypes={["nav-forward"]} className="mira-button rounded-lg px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-primary-soft">用它面试 →</Link>
        )}
      </div>
    </article>
  );
}
