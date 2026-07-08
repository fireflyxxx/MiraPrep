"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Logo from "@/components/Logo";
import { questions } from "@/lib/mock-data";

type AnsweredItem = {
  n: string;
  q: string;
  a: string;
};

function StageIcon({
  loading,
  mode,
  recording,
}: {
  loading: boolean;
  mode: "voice" | "text";
  recording: boolean;
}) {
  const iconState = loading ? "loading" : mode;

  return (
    <div className="relative mx-auto mb-[30px] h-[104px] w-[104px]">
      <span className="animate-mira-pulse-slow absolute -inset-3.5 rounded-full border-[1.5px] border-[#ffe0cc]" />
      <div
        className="flex h-[104px] w-[104px] items-center justify-center rounded-full shadow-[0_12px_40px_-8px_rgba(249,115,22,0.35)] transition-all duration-500 ease-[cubic-bezier(.16,1,.3,1)]"
        style={{ background: "radial-gradient(circle at 50% 35%,#fff3ea,#ffe0cc)" }}
      >
        <div key={iconState} className="animate-mira-icon-swap flex h-10 w-10 items-center justify-center">
          {loading ? (
            <span className="animate-mira-spin block h-8 w-8 rounded-full border-[3px] border-orange-500/25 border-t-orange-500" />
          ) : mode === "voice" ? (
            <div className="flex h-[30px] items-center gap-1">
              <span className={`${recording ? "animate-mira-bar" : ""} block h-[45%] w-[5px] rounded-[3px] bg-orange-500`} />
              <span className={`${recording ? "animate-mira-bar-2" : ""} block h-[80%] w-[5px] rounded-[3px] bg-orange-500`} />
              <span className={`${recording ? "animate-mira-bar-4" : ""} block h-full w-[5px] rounded-[3px] bg-orange-500`} />
              <span className={`${recording ? "animate-mira-bar-6" : ""} block h-[65%] w-[5px] rounded-[3px] bg-orange-500`} />
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <span className="block h-[4px] w-8 rounded-full bg-orange-500" />
              <span className="block h-[4px] w-6 rounded-full bg-orange-500/80" />
              <span className="block h-[4px] w-7 rounded-full bg-orange-500/60" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const voiceAnswerPreview =
  "主要是因为跨层级的高频更新，Context 会引起较大范围重渲染。我当时选择额外状态库，是为了把订阅粒度控制得更细，同时让调试和状态回放更清楚。";

const viewedHintsStorageKey = "miraprep:viewed-hints";

export default function InterviewClient({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [qIndex, setQIndex] = useState(0);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [inputMode, setInputMode] = useState<"voice" | "text">("voice");
  const [isRecording, setIsRecording] = useState(false);
  const [hasRecorded, setHasRecorded] = useState(false);
  const [answerText, setAnswerText] = useState("");
  const [submittedAnswer, setSubmittedAnswer] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [answered, setAnswered] = useState<AnsweredItem[]>([]);
  const [confirmEndOpen, setConfirmEndOpen] = useState(false);
  const [viewedHints, setViewedHints] = useState<Set<number>>(new Set());

  const total = questions.length;
  const cur = questions[qIndex];
  const qBig = qIndex + 1 < 10 ? `0${qIndex + 1}` : `${qIndex + 1}`;
  const isBusy = isProcessing || isGenerating;
  const canSubmit =
    !isBusy && !isRecording && (inputMode === "voice" ? hasRecorded : answerText.trim().length > 0);

  const goResult = () =>
    router.push(`/interview/${sessionId}/result`, { transitionTypes: ["nav-reveal"] });

  const handleSubmitAnswer = () => {
    if (!canSubmit) return;

    const answer = inputMode === "voice" ? voiceAnswerPreview : answerText.trim();
    setSubmittedAnswer(answer);
    setAnswered((items) => [
      ...items,
      { n: `Q${qIndex + 1}`, q: cur.q, a: answer },
    ]);
    setIsProcessing(true);
    setReviewOpen(false);

    setTimeout(() => {
      setIsProcessing(false);

      if (qIndex >= total - 1) {
        goResult();
        return;
      }

      setIsGenerating(true);

      setTimeout(() => {
        setSubmittedAnswer(null);
        setIsGenerating(false);
        setQIndex((i) => i + 1);
        setAnswerText("");
        setHasRecorded(false);
        setIsRecording(false);
        window.scrollTo(0, 0);
      }, 1150);
    }, 1050);
  };

  const toggleRecording = () => {
    if (isBusy) return;
    setIsRecording((rec) => {
      if (rec) {
        setHasRecorded(true);
        return false;
      }
      setHasRecorded(false);
      return true;
    });
  };

  const switchInputMode = (mode: "voice" | "text") => {
    if (isBusy || mode === inputMode) return;
    setIsRecording(false);
    setInputMode(mode);
  };

  const showHint = () => {
    setViewedHints((cur) => {
      const next = new Set(cur);
      next.add(qIndex);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(viewedHintsStorageKey, JSON.stringify(Array.from(next)));
      }
      return next;
    });
  };

  const transcriptText = isRecording
    ? "正在聆听你的回答…"
    : hasRecorded
      ? `实时转写：${voiceAnswerPreview}`
      : "点击左侧麦克风，开始语音回答";

  return (
    <div className="flex min-h-screen flex-col bg-white text-[#0a0a0a]">
      <div className="flex items-center justify-between border-b border-[#eee] px-5 py-4 md:px-8">
        <div className="flex items-center gap-3.5">
          <Logo size="sm" />
          <span className="h-[18px] w-px bg-[#e5e5e5]" />
          <div className="text-[13.5px] font-medium">前端工程师 · 中级</div>
        </div>
        <div className="flex items-center gap-3 md:gap-5">
          <span className="hidden font-display text-[13px] text-[#a3a3a3] sm:inline">
            第 {qIndex + 1} 题 · {isGenerating ? "生成中" : isProcessing ? "处理中" : "进行中"}
          </span>
          <div className="flex items-center gap-[7px] rounded-[9px] bg-[#f5f5f5] px-3 py-1.5">
            <span className="animate-mira-pulse block h-1.5 w-1.5 rounded-full bg-orange-500" />
            <span className="font-display text-sm">14:32</span>
          </div>
          <button
            onClick={() => setReviewOpen(true)}
            className="mira-button rounded-[9px] border border-[#e5e5e5] bg-white px-4 py-2 text-[13px] text-[#0a0a0a]"
          >
            ↗ 回看
          </button>
          <button
            onClick={() => setConfirmEndOpen(true)}
            className="mira-button rounded-[9px] border border-[#e5e5e5] bg-white px-4 py-2 text-[13px] text-[#525252] hover:border-red-200 hover:bg-red-50 hover:text-red-600"
          >
            结束面试
          </button>
        </div>
      </div>

      <div className="px-5 md:px-8">
        <div className="mx-auto flex max-w-[900px] justify-center gap-[5px] pt-3.5">
          {Array.from({ length: qIndex + 1 }).map((_, idx) => (
            <span
              key={idx}
              className={`h-[5px] w-9 shrink-0 rounded-[3px] bg-orange-500 ${
                idx === qIndex ? "animate-mira-segment-grow" : ""
              }`}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center px-5 py-6 md:px-8">
        <div key={qIndex} className="animate-mira-rise w-full max-w-[820px] text-center">
          <StageIcon loading={isProcessing || isGenerating} mode={inputMode} recording={isRecording} />

          <div className={`mb-4 font-display text-[13px] tracking-[0.05em] ${isGenerating ? "text-orange-500" : "text-[#a3a3a3]"}`}>
            {isGenerating ? "MIRA AGENT 正在生成问题" : "MIRA 面试官正在提问"} · 问题 {qBig}
          </div>
          <h1 className="mx-auto mb-5 max-w-[720px] text-[24px] leading-[1.4] font-semibold tracking-[-0.01em] md:text-[32px]">
            {cur.q}
          </h1>
          <button
            onClick={showHint}
            aria-expanded={viewedHints.has(qIndex)}
            disabled={viewedHints.has(qIndex)}
            className={`mira-button relative inline-flex min-h-10 items-center justify-center overflow-hidden rounded-full border border-[#f0f0f0] bg-[#fafafa] px-[18px] py-2 text-[13px] whitespace-nowrap text-[#737373] transition-[max-width,padding,border-color,background-color,box-shadow] duration-[850ms] ease-[cubic-bezier(.22,1,.36,1)] ${
              viewedHints.has(qIndex)
                ? "max-w-[min(620px,calc(100vw-48px))] cursor-default border-[#ffe0cc] bg-[#fff7f1] px-4 shadow-[0_12px_30px_-22px_rgba(249,115,22,.55)]"
                : "max-w-[64px] cursor-pointer hover:border-[#ffe0cc] hover:bg-[#fff7f1]"
            }`}
          >
            <span className="shrink-0 text-orange-500 transition-[transform,opacity] duration-300">
              提示
            </span>
            <span
              className={`overflow-hidden text-left transition-[max-width,opacity,transform,margin] duration-[650ms] ease-[cubic-bezier(.16,1,.3,1)] ${
                viewedHints.has(qIndex)
                  ? "ml-2 max-w-[520px] translate-x-0 opacity-100 delay-150"
                  : "ml-0 max-w-0 translate-x-2 opacity-0"
              }`}
            >
              <span className="block truncate">{cur.hint}</span>
            </span>
          </button>

          {submittedAnswer && (
            <div className="animate-mira-soft-pop mx-auto mt-8 max-w-[620px] text-center">
              <div className="mb-2 font-display text-[12px] tracking-[0.05em] text-[#a3a3a3]">
                你的回答
              </div>
              <p className="m-0 text-[17px] leading-relaxed font-medium text-[#404040] md:text-[19px]">
                {submittedAnswer}
              </p>
              {(isProcessing || isGenerating) && (
                <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#fafafa] px-4 py-2 text-[13px] text-[#737373]">
                  <span className="animate-mira-pulse block h-1.5 w-1.5 rounded-full bg-orange-500" />
                  {isProcessing ? "正在处理中" : "正在生成下一道追问"}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-[#eee] bg-[#fcfcfc] px-5 pt-[18px] pb-[26px] md:px-8">
        <div className="mx-auto max-w-[820px]">
          <div className="mb-4 flex justify-center">
            <div className="flex gap-0.5 rounded-[11px] border border-[#e5e5e5] bg-white p-1">
              <button
                onClick={() => switchInputMode("voice")}
                disabled={isBusy}
                className={`mira-button rounded-lg px-4 py-2.5 text-[13.5px] disabled:cursor-not-allowed disabled:opacity-60 ${
                  inputMode === "voice" ? "bg-orange-500 font-medium text-white" : "text-[#a3a3a3]"
                }`}
              >
                语音回答
              </button>
              <button
                onClick={() => switchInputMode("text")}
                disabled={isBusy}
                className={`mira-button rounded-lg px-4 py-2.5 text-[13.5px] disabled:cursor-not-allowed disabled:opacity-60 ${
                  inputMode === "text" ? "bg-orange-500 font-medium text-white" : "text-[#525252]"
                }`}
              >
                打字回答
              </button>
            </div>
          </div>

          {inputMode === "voice" ? (
            <div key="voice-input" className="animate-mira-rise flex flex-col items-center gap-4 py-1.5">
              <div className="flex items-center gap-[18px]">
                <button
                  onClick={toggleRecording}
                  disabled={isBusy}
                  className={`flex h-[58px] w-[58px] items-center justify-center rounded-full bg-orange-500 transition-all disabled:cursor-not-allowed disabled:opacity-60 ${
                    isRecording
                      ? "animate-mira-pulse border-[6px] border-orange-500/30 shadow-[0_8px_26px_rgba(249,115,22,0.45)]"
                      : "border-[6px] border-orange-500/15 shadow-[0_8px_24px_rgba(249,115,22,0.3)]"
                  }`}
                >
                  {isRecording ? (
                    <span className="block h-[15px] w-[15px] rounded-[4px] bg-white" />
                  ) : (
                    <span
                      className="ml-1 block h-0 w-0"
                      style={{
                        borderLeft: "11px solid #fff",
                        borderTop: "8px solid transparent",
                        borderBottom: "8px solid transparent",
                      }}
                    />
                  )}
                </button>
                <button
                  onClick={handleSubmitAnswer}
                  disabled={!canSubmit}
                  className={`mira-button rounded-xl px-6 py-3.5 text-[14.5px] font-medium ${
                    canSubmit ? "cursor-pointer bg-[#0a0a0a] text-white" : "cursor-not-allowed bg-[#d4d4d4] text-white"
                  }`}
                >
                  {isProcessing ? "处理中…" : "提交回答 · 继续 →"}
                </button>
              </div>
              <div className="max-w-[720px] text-center text-[12.5px] text-[#a3a3a3]">{transcriptText}</div>
            </div>
          ) : (
            <div key="text-input" className="animate-mira-rise">
              <div className="flex items-end gap-3 rounded-[14px] border border-[#e5e5e5] bg-white p-3.5 shadow-[0_2px_8px_rgba(0,0,0,0.03)]">
                <textarea
                  value={answerText}
                  onChange={(e) => setAnswerText(e.target.value)}
                  disabled={isBusy}
                  placeholder="输入你的回答，Shift + Enter 换行…"
                  className="max-h-[140px] min-h-[26px] flex-1 resize-none border-none bg-transparent text-[14.5px] leading-relaxed text-[#0a0a0a] outline-none disabled:cursor-not-allowed disabled:opacity-60"
                />
                <button
                  onClick={handleSubmitAnswer}
                  disabled={!canSubmit}
                  className={`mira-button shrink-0 rounded-[10px] px-[18px] py-2.5 text-sm font-medium whitespace-nowrap text-white ${
                    canSubmit ? "bg-orange-500" : "cursor-not-allowed bg-[#d4d4d4]"
                  }`}
                >
                  {isProcessing ? "处理中…" : "提交回答 · 继续"}
                </button>
              </div>
              <div className="mt-2.5 text-center text-xs text-[#a3a3a3]">
                提交后答案会先进入处理状态，Mira 随后生成下一道追问
              </div>
            </div>
          )}
        </div>
      </div>

      {reviewOpen && (
        <>
          <div
            onClick={() => setReviewOpen(false)}
            className="fixed inset-0 z-[1500] bg-[#0a0a0a]/35 backdrop-blur-[2px]"
          />
          <div className="animate-mira-slide-left fixed top-0 right-0 bottom-0 z-[1600] flex w-full max-w-[440px] flex-col bg-white shadow-[-20px_0_60px_-20px_rgba(0,0,0,0.25)]">
            <div className="flex items-center justify-between border-b border-[#f2f2f2] px-[26px] py-[22px]">
              <div>
                <div className="text-[17px] font-semibold">回看本场问答</div>
                <div className="mt-0.5 text-[12.5px] text-[#a3a3a3]">面试仍在进行中</div>
              </div>
              <button
                onClick={() => setReviewOpen(false)}
                className="mira-button flex h-[34px] w-[34px] items-center justify-center rounded-[9px] border border-[#eee] bg-white text-base text-[#525252]"
              >
                ×
              </button>
            </div>
            <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-[26px] py-[22px]">
              {answered.length === 0 ? (
                <div className="py-[60px] text-center text-[13.5px] text-[#a3a3a3]">
                  还没有已回答的问题
                  <br />
                  回答后即可在此回看
                </div>
              ) : (
                answered.map((item) => (
                  <div key={item.n} className="mira-surface overflow-hidden rounded-2xl border border-[#f0f0f0]">
                    <div className="flex gap-2.5 border-b border-[#f2f2f2] bg-[#fafafa] px-4 py-3.5">
                      <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[7px] bg-[#0a0a0a] font-display text-xs text-white">
                        {item.n}
                      </span>
                      <div className="text-[13.5px] leading-[1.5] font-medium">{item.q}</div>
                    </div>
                    <div className="px-4 py-3.5">
                      <div className="mb-1.5 text-[11.5px] text-[#a3a3a3]">你的回答</div>
                      <p className="m-0 text-[13.5px] leading-relaxed text-[#404040]">{item.a}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}

      {confirmEndOpen && (
        <>
          <div
            onClick={() => setConfirmEndOpen(false)}
            className="fixed inset-0 z-[1700] bg-[#0a0a0a]/35 backdrop-blur-[2px]"
          />
          <div className="animate-mira-soft-pop fixed top-1/2 left-1/2 z-[1800] w-[calc(100%-32px)] max-w-[380px] -translate-x-1/2 -translate-y-1/2 rounded-[18px] border border-[#fee2e2] bg-white p-6 shadow-[0_26px_70px_-24px_rgba(127,29,29,.45)]">
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-red-50 text-[18px] font-semibold text-red-600">
              !
            </div>
            <h2 className="m-0 mb-2 text-[19px] font-semibold tracking-[-0.01em]">
              确认结束面试？
            </h2>
            <p className="m-0 mb-6 text-[14px] leading-relaxed text-[#737373]">
              结束后将直接生成本场面试结果，当前题目的未提交内容不会继续记录。
            </p>
            <div className="flex gap-2.5">
              <button
                onClick={() => setConfirmEndOpen(false)}
                className="mira-button flex-1 rounded-[10px] border border-[#e5e5e5] bg-white py-2.5 text-[14px] text-[#525252]"
              >
                继续面试
              </button>
              <button
                onClick={goResult}
                className="mira-button flex-1 rounded-[10px] bg-red-600 py-2.5 text-[14px] font-medium text-white shadow-[0_8px_22px_rgba(220,38,38,.24)] hover:bg-red-700"
              >
                结束并生成结果
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
