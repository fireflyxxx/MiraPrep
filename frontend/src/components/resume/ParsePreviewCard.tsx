"use client";

import type { ReactNode } from "react";
import type { ResumeDetail } from "@/lib/api/resume";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section><h4 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground">{title}</h4>{children}</section>;
}

export default function ParsePreviewCard({ resume, onClose, onRetry }: { resume: ResumeDetail; onClose: () => void; onRetry?: () => void }) {
  const parsed = resume.parsedJson;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-5 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="简历解析预览">
      <div className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-[20px] border border-border bg-surface p-6 shadow-2xl">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div><h3 className="text-lg font-semibold">{resume.fileName}</h3><p className="mt-1 text-xs text-muted-foreground">{resume.pageCount ? `${resume.pageCount} 页 · ` : ""}结构化解析预览</p></div>
          <button type="button" onClick={onClose} aria-label="关闭预览" className="rounded-lg px-3 py-1 text-muted-foreground hover:bg-muted">×</button>
        </div>
        {resume.parseStatus === "pending" && <div className="py-14 text-center text-primary">Mira 正在解析这份简历…</div>}
        {resume.parseStatus === "failed" && <div className="rounded-xl bg-red-50 p-5 text-sm text-red-700"><p className="font-medium">简历解析失败</p><p className="mt-1 text-red-600">解析服务未能生成有效结果，请检查文件内容后重新上传。</p>{onRetry && <button type="button" onClick={onRetry} className="mt-4 rounded-lg bg-red-600 px-3 py-2 text-xs font-medium text-white">重新上传</button>}</div>}
        {resume.parseStatus === "success" && parsed && (
          <div className="grid gap-5 text-sm">
            <Section title="基本信息"><p className="font-medium">{parsed.basics.name || "未识别姓名"}{parsed.basics.headline ? ` · ${parsed.basics.headline}` : ""}</p><p className="mt-1 text-xs text-muted-foreground">{[parsed.basics.email, parsed.basics.phone, parsed.basics.location].filter(Boolean).join(" · ") || "未识别联系方式"}</p></Section>
            <Section title="教育经历"><div className="grid gap-2">{parsed.education.length ? parsed.education.map((item, index) => <div key={`${item.school}-${index}`} className="rounded-xl bg-surface-subtle p-3"><b>{item.school || "未识别学校"}</b><p className="mt-1 text-xs text-muted-foreground">{[item.degree, item.major, [item.start, item.end].filter(Boolean).join(" - ")].filter(Boolean).join(" · ")}</p></div>) : <p className="text-muted-foreground">未识别教育经历</p>}</div></Section>
            <Section title="工作经历"><div className="grid gap-2">{parsed.experience.length ? parsed.experience.map((item, index) => <div key={`${item.company}-${index}`} className="rounded-xl bg-surface-subtle p-3"><b>{item.company || "未识别公司"}</b>{item.title ? ` · ${item.title}` : ""}<ul className="mt-2 list-disc pl-5 text-xs text-muted-foreground">{item.highlights?.map((highlight, highlightIndex) => <li key={`${highlight}-${highlightIndex}`}>{highlight}</li>)}</ul></div>) : <p className="text-muted-foreground">未识别工作经历</p>}</div></Section>
            <Section title="项目经历"><div className="grid gap-2">{parsed.projects.length ? parsed.projects.map((item, index) => <div key={`${item.name}-${index}`} className="rounded-xl bg-surface-subtle p-3"><b>{item.name || "未命名项目"}</b>{item.role ? ` · ${item.role}` : ""}<p className="mt-1 text-xs text-muted-foreground">{item.description}</p>{item.tech?.length ? <p className="mt-2 text-xs text-primary">{item.tech.join(" · ")}</p> : null}</div>) : <p className="text-muted-foreground">未识别项目经历</p>}</div></Section>
            <Section title="技能"><div className="flex flex-wrap gap-2">{parsed.skills.length ? parsed.skills.map((skill, index) => <span key={`${skill}-${index}`} className="rounded-full bg-primary-soft px-3 py-1 text-xs text-primary">{skill}</span>) : <p className="text-muted-foreground">未识别技能</p>}</div></Section>
          </div>
        )}
      </div>
    </div>
  );
}
