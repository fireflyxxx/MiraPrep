"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Logo from "@/components/Logo";
import {
  configDiffCards,
  configDurations,
  configFocusOptions,
  configJobCards,
  resumes,
} from "@/lib/mock-data";

function cardClass(selected: boolean, center = false) {
  return `mira-surface cursor-pointer rounded-xl border px-4 py-4 ${
    center ? "flex-1 px-3.5 py-3.5 text-center" : ""
  } ${selected ? "border-orange-500 bg-[#fff5ee]" : "border-[#e5e5e5] bg-white"}`;
}

function pillClass(selected: boolean) {
  return `mira-button cursor-pointer rounded-full border px-4 py-2 text-[13px] ${
    selected
      ? "border-orange-500 bg-[#fff5ee] text-[#9a3412]"
      : "border-[#e5e5e5] bg-transparent text-[#0a0a0a]"
  }`;
}

function StepDot({ index, state }: { index: number; state: "done" | "active" | "todo" }) {
  const bg = state === "done" ? "bg-orange-500" : state === "active" ? "bg-[#0a0a0a]" : "bg-white";
  const text = state === "todo" ? "text-[#a3a3a3]" : "text-white";
  const border = state === "todo" ? "border-[#d4d4d4]" : "border-transparent";
  return (
    <span className={`mira-button flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full border-[1.5px] font-display text-[13px] font-semibold ${bg} ${text} ${border}`}>
      {state === "done" ? "✓" : index}
    </span>
  );
}

export default function InterviewSetupPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [uploading, setUploading] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [resumeList, setResumeList] = useState(resumes);
  const [resumeId, setResumeId] = useState(resumes[0].id);
  const [job, setJob] = useState("frontend");
  const [difficulty, setDifficulty] = useState("mid");
  const [duration, setDuration] = useState("30");
  const [focus, setFocus] = useState<string[]>(["project", "system"]);

  const toggleFocus = (id: string) =>
    setFocus((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const handleUpload = () => {
    if (uploading) return;
    setUploading(true);
    setTimeout(() => {
      const id = "v" + Date.now();
      setResumeList((cur) => [
        { id, name: "王同学_前端简历_v4.pdf（刚上传）", meta: "2.3 MB · 刚刚上传" },
        ...cur,
      ]);
      setResumeId(id);
      setUploading(false);
    }, 1100);
  };

  const stepLabels = { 1: "第 1 步 · 简历", 2: "第 2 步 · 岗位", 3: "第 3 步 · 要求" };

  const startInterview = () => {
    if (preparing) return;
    setPreparing(true);
    setTimeout(() => {
      router.push("/interview/demo", { transitionTypes: ["nav-forward"] });
    }, 1200);
  };

  const goNext = () => {
    if (step < 3) setStep((s) => (s + 1) as 1 | 2 | 3);
    else startInterview();
  };

  const goBack = () => {
    if (preparing) return;
    if (step === 1) router.push("/dashboard", { transitionTypes: ["nav-back"] });
    else setStep((s) => (s - 1) as 1 | 2 | 3);
  };

  return (
    <div className="min-h-screen bg-[#fafafa]">
      <div className="sticky top-0 z-20 flex items-center justify-between border-b border-[#eee] bg-white/92 px-6 py-[18px] backdrop-blur-[12px] md:px-10">
        <div className="flex items-center gap-4">
          <button
            onClick={goBack}
            disabled={preparing}
            className="mira-button rounded-[9px] border border-[#e5e5e5] bg-white px-3.5 py-2 text-[13px] text-[#525252] disabled:cursor-not-allowed disabled:opacity-50"
          >
            ← 退出
          </button>
          <Logo size="sm" />
        </div>
        <div className="text-[13px] text-[#a3a3a3]">准备面试 · {stepLabels[step]}</div>
      </div>

      <div className="animate-mira-page-in mx-auto max-w-[720px] px-6 pt-11 pb-[120px] md:px-8">
        <div className="mb-10 flex items-center gap-2">
          <StepDot index={1} state={step > 1 ? "done" : "active"} />
          <span className={`h-0.5 flex-1 rounded-sm transition-colors ${step > 1 ? "bg-orange-500" : "bg-[#eee]"}`} />
          <StepDot index={2} state={step > 2 ? "done" : step === 2 ? "active" : "todo"} />
          <span className={`h-0.5 flex-1 rounded-sm transition-colors ${step > 2 ? "bg-orange-500" : "bg-[#eee]"}`} />
          <StepDot index={3} state={step === 3 ? "active" : "todo"} />
        </div>

        <div key={step} className="animate-mira-rise">
          {step === 1 && (
            <>
              <h1 className="m-0 mb-1.5 text-[26px] font-bold tracking-[-0.02em]">上传你的简历</h1>
              <p className="m-0 mb-7 text-[14.5px] text-[#737373]">
                Mira 会解析简历，围绕你的真实经历提问。
              </p>
              {uploading ? (
                <div className="mb-6 rounded-[18px] border-2 border-dashed border-orange-500 bg-[#fff5ee] p-11 text-center">
                  <div className="mx-auto mb-4 flex h-[52px] w-[52px] items-center justify-center rounded-[14px] bg-white shadow-[0_4px_14px_rgba(249,115,22,0.2)]">
                    <span className="flex h-4 items-end gap-[3px]">
                      <span className="animate-mira-bar block h-full w-[3px] rounded-sm bg-orange-500" />
                      <span className="animate-mira-bar-2 block h-full w-[3px] rounded-sm bg-orange-500" />
                      <span className="animate-mira-bar-4 block h-full w-[3px] rounded-sm bg-orange-500" />
                    </span>
                  </div>
                  <div className="text-[15px] font-medium text-[#9a3412]">正在上传并解析简历…</div>
                </div>
              ) : (
                <div
                  onClick={handleUpload}
                  className="mira-surface mb-6 cursor-pointer rounded-[18px] border-2 border-dashed border-[#d4d4d4] bg-white p-11 text-center hover:border-orange-500"
                >
                  <div className="mx-auto mb-4 flex h-[52px] w-[52px] items-center justify-center rounded-[14px] bg-[#fff5ee]">
                    <span className="block h-4 w-4 rounded-[4px] border-[3px] border-orange-500" />
                  </div>
                  <div className="mb-1 text-[15px] font-medium">拖拽简历到此处，或点击上传</div>
                  <div className="text-[13px] text-[#a3a3a3]">支持 PDF / Word，最大 10 MB</div>
                </div>
              )}
              <div className="mb-3 text-[13px] text-[#737373]">或选择已上传的简历</div>
              <div className="flex flex-col gap-2.5">
                {resumeList.map((r) => (
                  <div
                    key={r.id}
                    onClick={() => setResumeId(r.id)}
                    className={`mira-surface flex cursor-pointer items-center justify-between rounded-xl border bg-white px-[18px] py-3.5 ${resumeId === r.id ? "border-orange-500" : "border-[#eee]"}`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`flex h-11 w-9 items-end justify-center rounded-md border pb-1 font-display text-[9px] ${resumeId === r.id ? "border-[#ffd9bd] bg-[#fff5ee] text-orange-500" : "border-[#e5e5e5] bg-[#f5f5f5] text-[#a3a3a3]"}`}>
                        PDF
                      </span>
                      <div>
                        <div className="text-sm font-medium">{r.name}</div>
                        <div className="text-xs text-[#a3a3a3]">{r.meta}</div>
                      </div>
                    </div>
                    {resumeId === r.id ? (
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-orange-500 text-xs text-white">✓</span>
                    ) : (
                      <span className="block h-5 w-5 rounded-full border-[1.5px] border-[#d4d4d4]" />
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h1 className="m-0 mb-1.5 text-[26px] font-bold tracking-[-0.02em]">选择面试岗位</h1>
              <p className="m-0 mb-7 text-[14.5px] text-[#737373]">决定题目方向、难度与考察重点。</p>
              <div className="mb-3 text-[13px] font-medium">岗位</div>
              <div className="mb-[26px] grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {configJobCards.map((j) => (
                  <div key={j.id} onClick={() => setJob(j.id)} className={cardClass(job === j.id)}>
                    <div className={`text-[14.5px] font-medium ${job === j.id ? "text-[#9a3412]" : "text-[#0a0a0a]"}`}>{j.label}</div>
                    <div className={`mt-0.5 text-xs ${job === j.id ? "text-[#9a3412]" : "text-[#a3a3a3]"}`}>{j.sub}</div>
                  </div>
                ))}
              </div>
              <div className="mb-3 text-[13px] font-medium">难度级别</div>
              <div className="mb-[26px] flex gap-2.5">
                {configDiffCards.map((d) => (
                  <div key={d.id} onClick={() => setDifficulty(d.id)} className={cardClass(difficulty === d.id, true)}>
                    <div className={`text-[14.5px] font-medium ${difficulty === d.id ? "text-[#9a3412]" : "text-[#0a0a0a]"}`}>{d.label}</div>
                    <div className={`mt-0.5 text-xs ${difficulty === d.id ? "text-[#9a3412]" : "text-[#a3a3a3]"}`}>{d.sub}</div>
                  </div>
                ))}
              </div>
              <div className="mb-3 text-[13px] font-medium">面试时长</div>
              <div className="flex gap-2">
                {configDurations.map((d) => (
                  <span key={d.id} onClick={() => setDuration(d.id)} className={pillClass(duration === d.id)}>
                    {d.label}
                  </span>
                ))}
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <h1 className="m-0 mb-1.5 text-[26px] font-bold tracking-[-0.02em]">
                补充要求 <span className="text-[15px] font-normal text-[#a3a3a3]">（选填）</span>
              </h1>
              <p className="m-0 mb-7 text-[14.5px] text-[#737373]">告诉 Mira 任何你希望它关注或避免的点。</p>
              <div className="mb-2.5 text-[13px] font-medium">想重点被考察的方向</div>
              <div className="mb-6 flex flex-wrap gap-2">
                {configFocusOptions.map((f) => (
                  <span key={f.id} onClick={() => toggleFocus(f.id)} className={pillClass(focus.includes(f.id))}>
                    {f.label}
                  </span>
                ))}
              </div>
              <div className="mb-2.5 text-[13px] font-medium">给面试官的备注</div>
              <textarea
                placeholder="如：我想应聘的是偏向可视化方向的岗位，希望多问一些图形渲染和性能相关的问题……"
                className="mira-field min-h-[120px] w-full resize-y rounded-xl border border-[#e5e5e5] bg-white p-3.5 text-sm leading-relaxed outline-none"
              />
            </>
          )}
        </div>
      </div>

      <div className="fixed right-0 bottom-0 left-0 z-30 flex items-center justify-between border-t border-[#eee] bg-white/90 px-6 py-4 backdrop-blur-[10px] md:px-10">
        <button
          onClick={goBack}
          disabled={preparing}
          className="mira-button rounded-[10px] border border-[#e5e5e5] bg-white px-5 py-[11px] text-sm text-[#525252] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {step === 1 ? "取消" : "← 上一步"}
        </button>
        <button
          onClick={goNext}
          disabled={preparing}
          className="mira-button rounded-[10px] bg-orange-500 px-[26px] py-[11px] text-[14.5px] font-medium text-white shadow-[0_6px_18px_rgba(249,115,22,0.25)] disabled:cursor-not-allowed disabled:opacity-70"
        >
          {step === 3 ? "开始面试 →" : "下一步 →"}
        </button>
      </div>

      {preparing && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-white/88 px-6 backdrop-blur-[14px]">
          <div className="animate-mira-soft-pop text-center">
            <div className="mx-auto mb-5 flex h-[72px] w-[72px] items-center justify-center rounded-[22px] bg-[#fff5ee] shadow-[0_18px_50px_-26px_rgba(249,115,22,.8)]">
              <div className="flex h-7 items-end gap-1">
                <span className="animate-mira-bar block h-[45%] w-1.5 rounded bg-orange-500" />
                <span className="animate-mira-bar-2 block h-[80%] w-1.5 rounded bg-orange-500" />
                <span className="animate-mira-bar-4 block h-full w-1.5 rounded bg-orange-500" />
                <span className="animate-mira-bar-6 block h-[60%] w-1.5 rounded bg-orange-500" />
              </div>
            </div>
            <h2 className="m-0 mb-2 text-[24px] font-bold tracking-[-0.02em]">正在准备您的面试</h2>
            <p className="m-0 text-[14px] text-[#737373]">Mira 正在整理简历、岗位要求和追问策略…</p>
          </div>
        </div>
      )}
    </div>
  );
}
