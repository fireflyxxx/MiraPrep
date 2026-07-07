"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Logo from "@/components/Logo";
import { questions } from "@/lib/mock-data";

export default function InterviewClient({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [qIndex, setQIndex] = useState(0);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [inputMode, setInputMode] = useState<"voice" | "text">("voice");
  const [isRecording, setIsRecording] = useState(false);
  const [hasRecorded, setHasRecorded] = useState(false);

  const total = questions.length;
  const cur = questions[qIndex];
  const answered = questions.slice(0, qIndex).map((q, i) => ({ n: `Q${i + 1}`, q: q.q, a: q.a }));
  const qBig = qIndex + 1 < 10 ? `0${qIndex + 1}` : `${qIndex + 1}`;

  const goResult = () =>
    router.push(`/interview/${sessionId}/result`, {
      transitionTypes: ["nav-reveal"],
    });

  const nextQuestion = () => {
    if (isRecording) return;
    if (qIndex >= total - 1) {
      setReviewOpen(false);
      goResult();
    } else {
      setQIndex((i) => i + 1);
      setReviewOpen(false);
      setIsRecording(false);
      setHasRecorded(false);
      window.scrollTo(0, 0);
    }
  };

  const toggleRecording = () => {
    setIsRecording((rec) => {
      if (rec) {
        setHasRecorded(true);
        return false;
      }
      setHasRecorded(false);
      return true;
    });
  };

  const transcriptText = isRecording
    ? "正在聆听你的回答…"
    : hasRecorded
      ? '实时转写："……主要通过预估高度加上渲染后测量真实高度来修正。"'
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
            第 {qIndex + 1} 题 · 进行中
          </span>
          <div className="flex items-center gap-[7px] rounded-[9px] bg-[#f5f5f5] px-3 py-1.5">
            <span className="animate-mira-pulse block h-1.5 w-1.5 rounded-full bg-orange-500" />
            <span className="font-display text-sm">14:32</span>
          </div>
          <button
            onClick={() => setReviewOpen(true)}
            className="rounded-[9px] border border-[#e5e5e5] bg-white px-4 py-2 text-[13px] text-[#0a0a0a]"
          >
            ↩ 回看
          </button>
          <button
            onClick={goResult}
            className="rounded-[9px] border border-[#e5e5e5] bg-white px-4 py-2 text-[13px] text-[#525252]"
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
              className={`h-[5px] w-9 shrink-0 rounded-[3px] bg-orange-500 transition-all ${
                idx === qIndex ? "animate-mira-pulse-slow" : ""
              }`}
            />
          ))}
          <span
            className="h-[5px] w-5 shrink-0 rounded-[3px] opacity-70"
            style={{
              background:
                "repeating-linear-gradient(90deg,#e5e5e5 0 4px,transparent 4px 8px)",
            }}
          />
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center px-5 py-6 md:px-8">
        <div key={qIndex} className="animate-mira-rise w-full max-w-[820px] text-center">
          <div className="relative mx-auto mb-[30px] h-[104px] w-[104px]">
            <span className="animate-mira-pulse-slow absolute -inset-3.5 rounded-full border-[1.5px] border-[#ffe0cc]" />
            <div
              className="flex h-[104px] w-[104px] items-center justify-center rounded-full shadow-[0_12px_40px_-8px_rgba(249,115,22,0.35)]"
              style={{
                background: "radial-gradient(circle at 50% 35%,#fff3ea,#ffe0cc)",
              }}
            >
              <div className="flex h-[30px] items-center gap-1">
                <span className="animate-mira-bar block h-[45%] w-[5px] rounded-[3px] bg-orange-500" />
                <span className="animate-mira-bar-2 block h-[80%] w-[5px] rounded-[3px] bg-orange-500" />
                <span className="animate-mira-bar-4 block h-full w-[5px] rounded-[3px] bg-orange-500" />
                <span className="animate-mira-bar-6 block h-[65%] w-[5px] rounded-[3px] bg-orange-500" />
              </div>
            </div>
          </div>
          <div className="mb-4 font-display text-[13px] tracking-[0.05em] text-[#a3a3a3]">
            MIRA 面试官正在提问 · 问题 {qBig}
          </div>
          <h1 className="mx-auto mb-5 max-w-[720px] text-[24px] leading-[1.4] font-semibold tracking-[-0.01em] md:text-[32px]">
            {cur.q}
          </h1>
          <div className="inline-flex items-center gap-2 rounded-full border border-[#f0f0f0] bg-[#fafafa] px-4 py-2 text-[13px] text-[#737373]">
            <span className="text-orange-500">提示</span>
            {cur.hint}
          </div>
        </div>
      </div>

      <div className="border-t border-[#eee] bg-[#fcfcfc] px-5 pt-[18px] pb-[26px] md:px-8">
        <div className="mx-auto max-w-[820px]">
          <div className="mb-4 flex justify-center">
            <div className="flex gap-0.5 rounded-[11px] border border-[#e5e5e5] bg-white p-1">
              <button
                onClick={() => setInputMode("voice")}
                className={`rounded-lg px-4 py-2.5 text-[13.5px] transition-all ${
                  inputMode === "voice" ? "bg-orange-500 font-medium text-white" : "text-[#a3a3a3]"
                }`}
              >
                🎙 语音回答
              </button>
              <button
                onClick={() => setInputMode("text")}
                className={`rounded-lg px-4 py-2.5 text-[13.5px] transition-all ${
                  inputMode === "text" ? "bg-orange-500 font-medium text-white" : "text-[#525252]"
                }`}
              >
                ⌨ 打字回答
              </button>
            </div>
          </div>

          {inputMode === "voice" ? (
            <div className="flex flex-col items-center gap-4 py-1.5">
              <div className="flex h-10 items-center gap-1">
                <span className="animate-mira-bar block h-[40%] w-1 rounded-[3px] bg-orange-500" />
                <span className="animate-mira-bar-1 block h-[70%] w-1 rounded-[3px] bg-orange-500" />
                <span className="animate-mira-bar-3 block h-full w-1 rounded-[3px] bg-orange-500" />
                <span className="animate-mira-bar-4 block h-[55%] w-1 rounded-[3px] bg-orange-500" />
                <span className="animate-mira-bar-5 block h-[85%] w-1 rounded-[3px] bg-orange-500" />
                <span className="animate-mira-bar-6 block h-[45%] w-1 rounded-[3px] bg-orange-500" />
                <span className="animate-mira-bar-7 block h-[75%] w-1 rounded-[3px] bg-orange-500" />
              </div>
              <div className="flex items-center gap-[18px]">
                <button
                  onClick={toggleRecording}
                  className={`flex h-[58px] w-[58px] items-center justify-center rounded-full bg-orange-500 transition-all ${
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
                  onClick={nextQuestion}
                  disabled={!hasRecorded}
                  className={`rounded-xl px-6 py-3.5 text-[14.5px] font-medium transition-all ${
                    hasRecorded ? "cursor-pointer bg-[#0a0a0a] text-white" : "cursor-not-allowed bg-[#d4d4d4] text-white"
                  }`}
                >
                  提交回答 · 继续 →
                </button>
              </div>
              <div className="text-[12.5px] text-[#a3a3a3]">{transcriptText}</div>
            </div>
          ) : (
            <>
              <div className="flex items-end gap-3 rounded-[14px] border border-[#e5e5e5] bg-white p-3.5 shadow-[0_2px_8px_rgba(0,0,0,0.03)]">
                <textarea
                  placeholder="输入你的回答，Shift + Enter 换行…"
                  className="max-h-[140px] min-h-[26px] flex-1 resize-none border-none bg-transparent text-[14.5px] leading-relaxed text-[#0a0a0a] outline-none"
                />
                <button
                  onClick={nextQuestion}
                  className="shrink-0 rounded-[10px] bg-orange-500 px-[18px] py-2.5 text-sm font-medium whitespace-nowrap text-white"
                >
                  提交回答 · 继续
                </button>
              </div>
              <div className="mt-2.5 text-center text-xs text-[#a3a3a3]">
                提交后 Mira 会进入下一个问题，可随时点击右上角「回看」查看之前的问答
              </div>
            </>
          )}
        </div>
      </div>

      {reviewOpen && (
        <>
          <div
            onClick={() => setReviewOpen(false)}
            className="fixed inset-0 z-[1500] bg-[#0a0a0a]/35 backdrop-blur-[2px]"
          />
          <div className="animate-mira-rise fixed top-0 right-0 bottom-0 z-[1600] flex w-full max-w-[440px] flex-col bg-white shadow-[-20px_0_60px_-20px_rgba(0,0,0,0.25)]">
            <div className="flex items-center justify-between border-b border-[#f2f2f2] px-[26px] py-[22px]">
              <div>
                <div className="text-[17px] font-semibold">回看本场问答</div>
                <div className="mt-0.5 text-[12.5px] text-[#a3a3a3]">面试仍在进行中</div>
              </div>
              <button
                onClick={() => setReviewOpen(false)}
                className="flex h-[34px] w-[34px] items-center justify-center rounded-[9px] border border-[#eee] bg-white text-base text-[#525252]"
              >
                ✕
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
                  <div key={item.n} className="overflow-hidden rounded-2xl border border-[#f0f0f0]">
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
    </div>
  );
}
