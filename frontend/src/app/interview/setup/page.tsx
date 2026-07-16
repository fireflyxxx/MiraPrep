"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Logo from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import AuthGuard from "@/components/AuthGuard";
import ResumeList from "@/components/resume/ResumeList";
import ResumeUpload, { type ResumeUploadHandle } from "@/components/resume/ResumeUpload";
import { selectInitialResumeId, useResumeLibrary } from "@/lib/api/resume";
import {
  createInterview,
  pollInterviewUntilSettled,
  type CreateInterviewInput,
  type InterviewDifficulty,
  type InterviewDuration,
  type InterviewerStyle,
} from "@/lib/api/interview";
import { ApiError } from "@/lib/api/types";
import {
  difficultyOptions,
  durationOptions,
  focusOptions,
  interviewTypeOptions,
  interviewerStyleOptions,
  jobOptions,
} from "@/lib/interview-options";

interface PreparationFailure {
  title: string;
  message: string;
  retryLabel?: string;
}

function cardClass(selected: boolean, center = false) {
  return `mira-surface cursor-pointer rounded-xl border px-4 py-4 ${
    center ? "flex-1 px-3.5 py-3.5 text-center" : ""
  } ${selected ? "border-primary bg-primary-soft" : "border-border bg-surface"}`;
}

function pillClass(selected: boolean) {
  return `mira-button cursor-pointer rounded-full border px-4 py-2 text-[13px] ${
    selected
      ? "border-primary bg-primary-soft text-primary"
      : "border-border bg-transparent text-foreground"
  }`;
}

function buildCustomRequirements(focus: string[], notes: string): string | undefined {
  const focusLabels = focusOptions
    .filter((option) => focus.includes(option.id))
    .map((option) => option.label);
  const parts = [
    focusLabels.length > 0 ? `重点考察：${focusLabels.join("、")}` : "",
    notes.trim() ? `备注：${notes.trim()}` : "",
  ].filter(Boolean);
  return parts.length > 0 ? parts.join("\n") : undefined;
}

function StepDot({ index, state }: { index: number; state: "done" | "active" | "todo" }) {
  const bg = state === "done" ? "bg-primary" : state === "active" ? "bg-foreground" : "bg-surface";
  const text = state === "todo" ? "text-muted-foreground" : "text-background";
  const border = state === "todo" ? "border-border" : "border-transparent";
  return (
    <span className={`mira-button flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full border-[1.5px] font-display text-[13px] font-semibold ${bg} ${text} ${border}`}>
      {state === "done" ? "✓" : index}
    </span>
  );
}

export default function InterviewSetupPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [preparingState, setPreparingState] = useState<"idle" | "polling" | "failed">("idle");
  const [preparationFailure, setPreparationFailure] = useState<PreparationFailure | null>(null);
  const [retrySessionId, setRetrySessionId] = useState<number | null>(null);
  const [resumeId, setResumeId] = useState<number | null>(null);
  const resumeLibrary = useResumeLibrary();
  const initializedResume = useRef(false);
  const uploadRef = useRef<ResumeUploadHandle>(null);
  const activePreparation = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const [job, setJob] = useState("frontend");
  const [jobTitle, setJobTitle] = useState("");
  const [jdText, setJdText] = useState("");
  const [difficulty, setDifficulty] = useState<InterviewDifficulty>("medium");
  const [duration, setDuration] = useState<InterviewDuration>(30);
  const [interviewTypes, setInterviewTypes] = useState<string[]>(["technical"]);
  const [focus, setFocus] = useState<string[]>(["project", "system"]);
  const [notes, setNotes] = useState("");
  const [interviewerStyle, setInterviewerStyle] = useState<InterviewerStyle>("balanced");
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const selectedResumeReady = resumeLibrary.data?.items.some(
    (resume) => resume.id === resumeId && resume.parseStatus === "success",
  ) ?? false;
  const selectedResume = resumeLibrary.data?.items.find((resume) => resume.id === resumeId);
  const selectedJob = jobOptions.find((option) => option.id === job);
  const selectedDifficulty = difficultyOptions.find((option) => option.id === difficulty);
  const isPreparing = preparingState === "polling";

  const toggleFocus = (id: string) =>
    setFocus((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const toggleInterviewType = (id: string) =>
    setInterviewTypes((current) => {
      if (!current.includes(id)) return [...current, id];
      return current.length === 1 ? current : current.filter((type) => type !== id);
    });

  useEffect(() => {
    if (initializedResume.current || !resumeLibrary.data) return;
    const requestedId = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("resumeId");
    setResumeId(selectInitialResumeId(resumeLibrary.data.items, requestedId));
    initializedResume.current = true;
  }, [resumeLibrary.data]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      activePreparation.current?.abort();
      activePreparation.current = null;
    };
  }, []);

  const stepLabels = { 1: "第 1 步 · 简历", 2: "第 2 步 · 岗位", 3: "第 3 步 · 要求" };

  const startInterview = async () => {
    if (activePreparation.current || resumeId === null) return;
    const controller = new AbortController();
    activePreparation.current = controller;
    setPreparingState("polling");
    setPreparationFailure(null);

    // 超时重试时 sessionId 已存在，跳过创建直接续poll，避免重复建会话。
    let sessionId = retrySessionId;
    try {
      if (sessionId === null) {
        const input: CreateInterviewInput = {
          resumeId,
          jobDirection: job,
          jobTitle: jobTitle.trim() || selectedJob?.label,
          jdText: jdText.trim() || undefined,
          difficulty,
          types: interviewTypes,
          durationMin: duration,
          customRequirements: buildCustomRequirements(focus, notes),
          interviewerStyle,
          voiceEnabled,
        };
        try {
          const created = await createInterview(input);
          sessionId = created.sessionId;
        } catch (error) {
          if (!mounted.current || controller.signal.aborted) return;
          const status = error instanceof ApiError ? error.status : undefined;
          const cannotRetry = status === 400 || status === 403 || status === 404;
          setRetrySessionId(null);
          setPreparationFailure({
            title: "无法创建面试",
            message: status === 404
              ? "请返回配置并重新选择简历。"
              : error instanceof Error
                ? error.message
                : "创建面试失败，请稍后重试。",
            retryLabel: cannotRetry ? undefined : "重试创建",
          });
          setPreparingState("failed");
          return;
        }
      }

      try {
        const settled = await pollInterviewUntilSettled(sessionId, {
          signal: controller.signal,
        });
        if (!mounted.current || controller.signal.aborted) return;
        if (settled.outlineStatus === "ready") {
          setRetrySessionId(null);
          router.push(`/interview/${sessionId}`, {
            transitionTypes: ["nav-forward"],
          });
          return;
        }
        if (settled.outlineStatus === "failed") {
          setRetrySessionId(null);
          setPreparationFailure({
            title: "面试大纲生成失败",
            message: "AI 未能生成可用的大纲，请重新生成。",
            retryLabel: "重新生成",
          });
        } else {
          setRetrySessionId(sessionId);
          setPreparationFailure({
            title: "面试准备超时",
            message: "大纲仍在生成中，你可以继续等待，不会重复创建面试。",
            retryLabel: "继续等待",
          });
        }
        setPreparingState("failed");
      } catch (error) {
        if (!mounted.current || controller.signal.aborted) return;
        setRetrySessionId(sessionId);
        setPreparationFailure({
          title: "暂时无法查询准备进度",
          message: error instanceof Error ? error.message : "状态查询失败，请稍后重试。",
          retryLabel: "继续等待",
        });
        setPreparingState("failed");
      }
    } finally {
      if (activePreparation.current === controller) {
        activePreparation.current = null;
      }
    }
  };

  const goNext = () => {
    if (step === 1 && !selectedResumeReady) return;
    if (step < 3) setStep((s) => (s + 1) as 1 | 2 | 3);
    else void startInterview();
  };

  const goBack = () => {
    if (isPreparing) return;
    if (step === 1) router.push("/dashboard", { transitionTypes: ["nav-back"] });
    else setStep((s) => (s - 1) as 1 | 2 | 3);
  };

  return (
    <AuthGuard>
    <div className="min-h-screen bg-surface-subtle">
      <div className="sticky top-0 z-20 flex items-center justify-between border-b border-border-subtle bg-surface/92 px-6 py-5 backdrop-blur-[12px] md:px-7">
        <div className="flex items-center gap-4">
          <Logo />
          <button
            onClick={goBack}
            disabled={isPreparing}
            className="mira-button rounded-[9px] border border-border bg-surface px-3.5 py-2 text-[13px] text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            ← 退出
          </button>
        </div>
        <div className="flex items-center gap-3 text-[13px] text-muted-foreground"><ThemeToggle />准备面试 · {stepLabels[step]}</div>
      </div>

      <div className="animate-mira-page-in mx-auto max-w-[720px] px-6 pt-11 pb-[120px] md:px-8">
        <div className="mb-10 flex items-center gap-2">
          <StepDot index={1} state={step > 1 ? "done" : "active"} />
          <span className={`h-0.5 flex-1 rounded-sm transition-colors ${step > 1 ? "bg-primary" : "bg-border-subtle"}`} />
          <StepDot index={2} state={step > 2 ? "done" : step === 2 ? "active" : "todo"} />
          <span className={`h-0.5 flex-1 rounded-sm transition-colors ${step > 2 ? "bg-primary" : "bg-border-subtle"}`} />
          <StepDot index={3} state={step === 3 ? "active" : "todo"} />
        </div>

        <div key={step} className="animate-mira-rise">
          {step === 1 && (
            <>
              <h1 className="m-0 mb-1.5 text-[26px] font-bold tracking-[-0.02em]">上传你的简历</h1>
              <p className="m-0 mb-7 text-[14.5px] text-muted-foreground">
                Mira 会解析简历，围绕你的真实经历提问。
              </p>
              <ResumeUpload
                ref={uploadRef}
                onUploaded={(resume) => {
                  if (resume.parseStatus === "success") setResumeId(resume.id);
                }}
              />
              <div className="mb-3 text-[13px] text-muted-foreground">或选择已上传的简历</div>
              <ResumeList
                mode="setup"
                selectedId={resumeId}
                onSelect={setResumeId}
                emptyMessage="还没有可选简历，请先在上方上传。"
                retryUpload={() => uploadRef.current?.openFileDialog()}
              />
            </>
          )}

          {step === 2 && (
            <>
              <h1 className="m-0 mb-1.5 text-[26px] font-bold tracking-[-0.02em]">选择面试岗位</h1>
              <p className="m-0 mb-7 text-[14.5px] text-muted-foreground">决定题目方向、难度与考察重点。</p>
              <div className="mb-3 text-[13px] font-medium">岗位</div>
              <div className="mb-[26px] grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {jobOptions.map((j) => (
                  <button
                    type="button"
                    key={j.id}
                    aria-pressed={job === j.id}
                    onClick={() => setJob(j.id)}
                    className={`${cardClass(job === j.id)} text-left`}
                  >
                    <div className={`text-[14.5px] font-medium ${job === j.id ? "text-primary" : "text-foreground"}`}>{j.label}</div>
                    <div className={`mt-0.5 text-xs ${job === j.id ? "text-primary" : "text-muted-foreground"}`}>{j.sub}</div>
                  </button>
                ))}
              </div>
              <label htmlFor="job-title" className="mb-2.5 block text-[13px] font-medium">
                目标岗位名称（选填）
              </label>
              <input
                id="job-title"
                value={jobTitle}
                onChange={(event) => setJobTitle(event.target.value)}
                placeholder="如：可视化前端工程师"
                className="mira-field mb-[22px] w-full rounded-xl border border-border bg-surface px-3.5 py-3 text-sm outline-none"
              />
              <label htmlFor="jd-text" className="mb-2.5 block text-[13px] font-medium">
                粘贴目标 JD（选填）
              </label>
              <textarea
                id="jd-text"
                value={jdText}
                onChange={(event) => setJdText(event.target.value)}
                placeholder="粘贴职位描述后，Mira 会围绕岗位要求定制问题。"
                className="mira-field mb-[22px] min-h-[110px] w-full resize-y rounded-xl border border-border bg-surface p-3.5 text-sm leading-relaxed outline-none"
              />
              <div className="mb-3 text-[13px] font-medium">面试类型（可多选）</div>
              <div className="mb-[26px] flex flex-wrap gap-2">
                {interviewTypeOptions.map((type) => (
                  <button
                    type="button"
                    key={type.id}
                    aria-pressed={interviewTypes.includes(type.id)}
                    onClick={() => toggleInterviewType(type.id)}
                    className={pillClass(interviewTypes.includes(type.id))}
                  >
                    {type.label}
                  </button>
                ))}
              </div>
              <div className="mb-3 text-[13px] font-medium">难度级别</div>
              <div className="mb-[26px] flex gap-2.5">
                {difficultyOptions.map((d) => (
                  <button
                    type="button"
                    key={d.id}
                    aria-pressed={difficulty === d.id}
                    onClick={() => setDifficulty(d.id)}
                    className={cardClass(difficulty === d.id, true)}
                  >
                    <div className={`text-[14.5px] font-medium ${difficulty === d.id ? "text-primary" : "text-foreground"}`}>{d.label}</div>
                    <div className={`mt-0.5 text-xs ${difficulty === d.id ? "text-primary" : "text-muted-foreground"}`}>{d.sub}</div>
                  </button>
                ))}
              </div>
              <div className="mb-3 text-[13px] font-medium">面试时长</div>
              <div className="flex gap-2">
                {durationOptions.map((d) => (
                  <button
                    type="button"
                    key={d.id}
                    aria-pressed={duration === d.id}
                    onClick={() => setDuration(d.id)}
                    className={pillClass(duration === d.id)}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <h1 className="m-0 mb-1.5 text-[26px] font-bold tracking-[-0.02em]">
                补充要求 <span className="text-[15px] font-normal text-muted-foreground">（选填）</span>
              </h1>
              <p className="m-0 mb-7 text-[14.5px] text-muted-foreground">告诉 Mira 任何你希望它关注或避免的点。</p>
              <div className="mb-2.5 text-[13px] font-medium">想重点被考察的方向</div>
              <div className="mb-6 flex flex-wrap gap-2">
                {focusOptions.map((f) => (
                  <button
                    type="button"
                    key={f.id}
                    aria-pressed={focus.includes(f.id)}
                    onClick={() => toggleFocus(f.id)}
                    className={pillClass(focus.includes(f.id))}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <div className="mb-3 text-[13px] font-medium">面试官风格</div>
              <div className="mb-6 grid gap-2.5 sm:grid-cols-3">
                {interviewerStyleOptions.map((style) => (
                  <button
                    type="button"
                    key={style.id}
                    aria-label={style.label}
                    aria-pressed={interviewerStyle === style.id}
                    onClick={() => setInterviewerStyle(style.id)}
                    className={`${cardClass(interviewerStyle === style.id)} text-left`}
                  >
                    <span className="block text-[14px] font-medium">{style.label}</span>
                    <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                      {style.description}
                    </span>
                  </button>
                ))}
              </div>
              <div className="mb-6 flex items-center justify-between rounded-xl border border-border bg-surface p-4">
                <div>
                  <div className="text-[14px] font-medium">语音面试</div>
                  <div className="mt-1 text-xs text-muted-foreground">开启后进入面试页时优先使用语音模式</div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-label="启用语音面试"
                  aria-checked={voiceEnabled}
                  onClick={() => setVoiceEnabled((enabled) => !enabled)}
                  className={`relative h-7 w-12 rounded-full transition-colors ${
                    voiceEnabled ? "bg-orange-500" : "bg-border"
                  }`}
                >
                  <span
                    className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                      voiceEnabled ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
              <label htmlFor="interviewer-notes" className="mb-2.5 block text-[13px] font-medium">
                给面试官的备注
              </label>
              <textarea
                id="interviewer-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="如：我想应聘的是偏向可视化方向的岗位，希望多问一些图形渲染和性能相关的问题……"
                className="mira-field min-h-[120px] w-full resize-y rounded-xl border border-border bg-surface p-3.5 text-sm leading-relaxed outline-none"
              />
              <div className="mt-6 rounded-xl border border-primary/25 bg-primary-soft p-4 text-sm">
                <div className="font-medium text-primary">已准备就绪</div>
                <p className="mt-1.5 mb-0 leading-relaxed text-muted-foreground">
                  {selectedJob?.label} · {selectedDifficulty?.label} · {duration} 分钟，基于「
                  {selectedResume?.fileName ?? "已选简历"}」。
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="fixed right-0 bottom-0 left-0 z-30 flex items-center justify-between border-t border-border-subtle bg-surface/90 px-6 py-4 backdrop-blur-[10px] md:px-10">
        <button
          onClick={goBack}
          disabled={isPreparing}
          className="mira-button rounded-[10px] border border-border bg-surface px-5 py-[11px] text-sm text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          {step === 1 ? "取消" : "← 上一步"}
        </button>
        <button
          onClick={goNext}
          disabled={isPreparing || (step === 1 && !selectedResumeReady)}
          className="mira-button rounded-[10px] bg-orange-500 px-[26px] py-[11px] text-[14.5px] font-medium text-white shadow-[0_6px_18px_rgba(249,115,22,0.25)] disabled:cursor-not-allowed disabled:opacity-70"
        >
          {step === 3 ? "开始面试 →" : "下一步 →"}
        </button>
      </div>

      {preparingState !== "idle" && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/88 px-6 backdrop-blur-[14px]">
          <div className="animate-mira-soft-pop text-center">
            <div className="mx-auto mb-5 flex h-[72px] w-[72px] items-center justify-center rounded-[22px] bg-primary-soft shadow-[0_18px_50px_-26px_rgba(249,115,22,.8)]">
              <div className="flex h-7 items-end gap-1">
                <span className="animate-mira-bar block h-[45%] w-1.5 rounded bg-orange-500" />
                <span className="animate-mira-bar-2 block h-[80%] w-1.5 rounded bg-orange-500" />
                <span className="animate-mira-bar-4 block h-full w-1.5 rounded bg-orange-500" />
                <span className="animate-mira-bar-6 block h-[60%] w-1.5 rounded bg-orange-500" />
              </div>
            </div>
            {preparingState === "polling" ? (
              <>
                <h2 className="m-0 mb-2 text-[24px] font-bold tracking-[-0.02em]">
                  面试官正在阅读你的简历…
                </h2>
                <p className="m-0 text-[14px] text-muted-foreground">
                  Mira 正在整理岗位要求、题目顺序和追问策略
                </p>
              </>
            ) : (
              <>
                <h2 className="m-0 mb-2 text-[24px] font-bold tracking-[-0.02em]">
                  {preparationFailure?.title}
                </h2>
                <p className="m-0 max-w-[420px] text-[14px] text-muted-foreground">
                  {preparationFailure?.message}
                </p>
                <div className="mt-6 flex justify-center gap-3">
                  {preparationFailure?.retryLabel ? (
                    <button
                      type="button"
                      onClick={() => void startInterview()}
                      className="mira-button rounded-[10px] bg-orange-500 px-5 py-2.5 text-sm font-medium text-white"
                    >
                      {preparationFailure.retryLabel}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      setPreparingState("idle");
                      setPreparationFailure(null);
                      setRetrySessionId(null);
                    }}
                    className="mira-button rounded-[10px] border border-border bg-surface px-5 py-2.5 text-sm text-muted-foreground"
                  >
                    返回配置
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
    </AuthGuard>
  );
}
