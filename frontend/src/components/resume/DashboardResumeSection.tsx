"use client";

import { useRef } from "react";
import ResumeList from "./ResumeList";
import ResumeUpload, { type ResumeUploadHandle } from "./ResumeUpload";

export default function DashboardResumeSection() {
  const uploadRef = useRef<ResumeUploadHandle>(null);

  return (
    <div className="animate-mira-soft-pop overflow-hidden rounded-[20px] border border-border-subtle bg-surface [animation-delay:.16s]">
      <div className="flex items-center justify-between border-b border-muted px-6 py-5">
        <div>
          <h3 className="m-0 text-base font-semibold">我的简历</h3>
          <p className="m-0 mt-0.5 text-[12.5px] text-muted-foreground">
            面试题目会围绕这些简历生成
          </p>
        </div>
        <ResumeUpload ref={uploadRef} compact />
      </div>
      <ResumeList
        mode="dashboard"
        emptyMessage="还没有简历，点击右上角添加第一份简历。"
        retryUpload={() => uploadRef.current?.openFileDialog()}
      />
    </div>
  );
}
