"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type DragEvent,
} from "react";
import {
  useUploadResume,
  validateResumeFile,
  type ResumeDetail,
} from "@/lib/api/resume";

export interface ResumeUploadHandle {
  openFileDialog: () => void;
}

interface ResumeUploadProps {
  onUploaded?: (resume: ResumeDetail) => void;
  compact?: boolean;
}

const ResumeUpload = forwardRef<ResumeUploadHandle, ResumeUploadProps>(function ResumeUpload(
  { onUploaded, compact = false },
  ref,
) {
  const inputRef = useRef<HTMLInputElement>(null);
  const activeUpload = useRef<AbortController | null>(null);
  const [dragging, setDragging] = useState(false);
  const [phase, setPhase] = useState<"idle" | "uploading" | "parsing">("idle");
  const [validationError, setValidationError] = useState<string | null>(null);
  const upload = useUploadResume();

  useImperativeHandle(ref, () => ({
    openFileDialog: () => inputRef.current?.click(),
  }), []);

  // 卸载后解析轮询不再有人看，中止它；onSettled 的失效会让重新挂载时refetch到最新状态。
  useEffect(() => () => activeUpload.current?.abort(), []);

  const chooseFile = async (file?: File) => {
    if (!file || upload.isPending) return;
    const error = validateResumeFile(file);
    setValidationError(error);
    if (error) return;
    setPhase("uploading");
    const controller = new AbortController();
    activeUpload.current = controller;
    try {
      const detail = await upload.mutateAsync({
        file,
        signal: controller.signal,
        onUploadAccepted: () => setPhase("parsing"),
      });
      onUploaded?.(detail);
    } catch {
      // React Query 已保存错误并由下方错误态展示；在事件边界收口 rejection。
    } finally {
      if (activeUpload.current === controller) activeUpload.current = null;
      setPhase("idle");
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    void chooseFile(event.dataTransfer.files[0]);
  };

  const message = phase === "uploading" ? "正在上传简历…" : "Mira 正在解析简历…";
  if (compact) {
    return (
      <div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={upload.isPending}
          className="mira-button flex items-center gap-1.5 rounded-[10px] bg-primary-soft px-3.5 py-2 text-[13px] font-medium text-primary hover:bg-primary/15 disabled:cursor-wait disabled:opacity-60"
        >
          <span className="text-base leading-none">+</span>
          {upload.isPending ? message : "添加简历"}
        </button>
        <input ref={inputRef} type="file" accept=".pdf,.docx" className="hidden" onChange={(event) => void chooseFile(event.target.files?.[0])} />
        {(validationError || upload.error) && (
          <p className="mt-2 text-right text-xs text-red-600" role="alert">
            {validationError ?? (upload.error instanceof Error ? upload.error.message : "上传失败，请重试")}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="mb-6">
      <div
        role="button"
        tabIndex={0}
        aria-label="上传简历"
        onClick={() => inputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") inputRef.current?.click();
        }}
        onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`mira-surface cursor-pointer rounded-[18px] border-2 border-dashed p-9 text-center transition-colors ${dragging || upload.isPending ? "border-primary bg-primary-soft" : "border-border bg-surface hover:border-primary"}`}
      >
        <div className="mx-auto mb-4 flex h-[52px] w-[52px] items-center justify-center rounded-[14px] bg-primary-soft">
          {upload.isPending ? (
            <span className="flex h-5 items-end gap-[3px]" aria-hidden="true">
              <span className="animate-mira-bar block h-full w-[3px] rounded-sm bg-orange-500" />
              <span className="animate-mira-bar-2 block h-full w-[3px] rounded-sm bg-orange-500" />
              <span className="animate-mira-bar-4 block h-full w-[3px] rounded-sm bg-orange-500" />
            </span>
          ) : (
            <span className="block h-4 w-4 rounded-[4px] border-[3px] border-orange-500" />
          )}
        </div>
        <div className="mb-1 text-[15px] font-medium">
          {upload.isPending ? message : dragging ? "松开即可上传" : "拖拽简历到此处，或点击上传"}
        </div>
        <div className="text-[13px] text-muted-foreground">支持 PDF / DOCX，最大 10 MB</div>
      </div>
      <input ref={inputRef} type="file" accept=".pdf,.docx" className="hidden" onChange={(event) => void chooseFile(event.target.files?.[0])} />
      {(validationError || upload.error) && (
        <p className="mt-2 text-sm text-red-600" role="alert">
          {validationError ?? (upload.error instanceof Error ? upload.error.message : "上传失败，请重试")}
        </p>
      )}
    </div>
  );
});

export default ResumeUpload;
