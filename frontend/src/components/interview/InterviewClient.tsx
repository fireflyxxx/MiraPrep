"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import Logo from "@/components/Logo";
import {
  clearInterviewEventCursor,
  clearInterviewRuntimeToken,
  endInterviewRuntime,
  getInterviewEventCursor,
  getInterviewRuntimeToken,
  getInterviewMessages,
  streamInterview,
  storeInterviewEventCursor,
  submitInterviewAnswer,
  type InterviewMessage,
  type InterviewStreamEvent,
} from "@/lib/api/interview-stream";

type ConnectionState = "connecting" | "connected" | "reconnecting" | "failed";

type ChatMessage = InterviewMessage & {
  key: string;
  pending?: boolean;
  streaming?: boolean;
};

type PendingAnswer = {
  answerId: string;
  content: string;
  questionId: string | number | null;
};

const phaseOrder = [
  "GREETING",
  "SELF_INTRO",
  "RESUME_DEEP_DIVE",
  "DOMAIN_ASSESSMENT",
  "BEHAVIORAL",
  "CANDIDATE_QA",
  "CLOSING",
] as const;

const phaseLabels: Record<string, string> = {
  GREETING: "开场",
  SELF_INTRO: "自我介绍",
  RESUME_DEEP_DIVE: "项目深挖",
  DOMAIN_ASSESSMENT: "专业评估",
  BEHAVIORAL: "行为面试",
  CANDIDATE_QA: "候选人提问",
  CLOSING: "收尾",
};

const reconnectDelays = [1_000, 2_000, 4_000, 8_000, 15_000];

function normalizePhase(phase?: string | null): string {
  return phase?.trim().toUpperCase() || "GREETING";
}

function newAnswerId(): string {
  const random =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `answer-${random}`;
}

function sleep(delay: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(resolve, delay);
    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

function StageIcon({ thinking }: { thinking: boolean }) {
  return (
    <div className="relative h-14 w-14 shrink-0">
      <span className="animate-mira-pulse-slow absolute inset-0 rounded-full border border-orange-200" />
      <div className="absolute inset-1 flex items-center justify-center rounded-full bg-[radial-gradient(circle_at_50%_35%,#fff3ea,#ffe0cc)] shadow-[0_10px_28px_-10px_rgba(249,115,22,.55)]">
        {thinking ? (
          <span className="animate-mira-spin block h-5 w-5 rounded-full border-2 border-orange-500/25 border-t-orange-500" />
        ) : (
          <div className="flex h-5 items-center gap-0.5">
            {[45, 85, 100, 65].map((height, index) => (
              <span
                key={height}
                className={`block w-1 rounded-full bg-orange-500 ${
                  index % 2 ? "animate-mira-bar-2" : "animate-mira-bar"
                }`}
                style={{ height: `${height}%` }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function connectionLabel(state: ConnectionState): string {
  switch (state) {
    case "connected":
      return "实时连接正常";
    case "reconnecting":
      return "连接中断，正在重连";
    case "failed":
      return "实时连接失败";
    default:
      return "正在连接面试官";
  }
}

export default function InterviewClient({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const numericSessionId = Number(sessionId);
  const validSessionId =
    Number.isSafeInteger(numericSessionId) && numericSessionId > 0;
  const [runtimeToken, setRuntimeToken] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [phase, setPhase] = useState("GREETING");
  const [answerText, setAnswerText] = useState("");
  const [isLoading, setIsLoading] = useState(validSessionId);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isEnded, setIsEnded] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [confirmEndOpen, setConfirmEndOpen] = useState(false);
  const [connection, setConnection] = useState<ConnectionState>(
    validSessionId ? "connecting" : "failed",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(
    validSessionId ? null : "无效的面试会话编号。",
  );
  const [connectionRetry, setConnectionRetry] = useState(0);
  const [showLatest, setShowLatest] = useState(false);
  const [pendingAnswer, setPendingAnswer] = useState<PendingAnswer | null>(null);
  const lastEventSeqRef = useRef(0);
  const endedRef = useRef(false);
  const chatRef = useRef<HTMLDivElement>(null);
  const requestControllerRef = useRef<AbortController | null>(null);

  const currentQuestion = useMemo(
    () =>
      [...messages]
        .reverse()
        .find(
          (message) =>
            message.role === "interviewer" && message.questionId !== null,
        ),
    [messages],
  );

  const goResult = useCallback(() => {
    if (endedRef.current) return;
    endedRef.current = true;
    setIsEnded(true);
    clearInterviewRuntimeToken(numericSessionId);
    clearInterviewEventCursor(numericSessionId);
    router.push(`/interview/${sessionId}/result`, {
      transitionTypes: ["nav-reveal"],
    });
  }, [numericSessionId, router, sessionId]);

  const handleStreamEvent = useCallback(
    (event: InterviewStreamEvent) => {
      if (event.seq <= lastEventSeqRef.current) return;
      lastEventSeqRef.current = event.seq;
      storeInterviewEventCursor(numericSessionId, event.seq);
      setConnection("connected");

      if (event.type === "phase_change") {
        setPhase(normalizePhase(event.payload.to));
        setMessages((items) =>
          items.map((item) =>
            item.streaming ? { ...item, streaming: false } : item,
          ),
        );
        return;
      }
      if (event.type === "interview_end") {
        goResult();
        return;
      }
      if (event.type === "error") {
        setErrorMessage(
          event.payload.message ??
            event.payload.detail ??
            "面试官暂时无法继续，请稍后重试。",
        );
        setIsThinking(false);
        return;
      }

      const eventPhase = normalizePhase(event.payload.phase);
      setPhase(eventPhase);
      setIsThinking(false);
      setErrorMessage(null);
      setMessages((items) => {
        const last = items.at(-1);
        if (
          last?.role === "interviewer" &&
          last.streaming &&
          last.questionId === (event.payload.questionId ?? null)
        ) {
          return [
            ...items.slice(0, -1),
            {
              ...last,
              content: `${last.content}${event.payload.text}`,
              seq: event.seq,
            },
          ];
        }
        return [
          ...items.map((item) =>
            item.streaming ? { ...item, streaming: false } : item,
          ),
          {
            key: `stream-${event.seq}`,
            role: "interviewer",
            content: event.payload.text,
            phase: eventPhase,
            questionId: event.payload.questionId ?? null,
            audioUrl: null,
            seq: event.seq,
            createdAt: new Date().toISOString(),
            streaming: true,
          },
        ];
      });
    },
    [goResult, numericSessionId],
  );

  useEffect(() => {
    const controller = new AbortController();
    requestControllerRef.current = controller;

    const run = async () => {
      // 保证首屏 SSR 与客户端水合都从相同状态开始，再读取浏览器存储。
      await Promise.resolve();
      if (controller.signal.aborted) return;
      if (!validSessionId) {
        setIsLoading(false);
        return;
      }
      const storedToken = getInterviewRuntimeToken(numericSessionId);
      lastEventSeqRef.current = getInterviewEventCursor(numericSessionId);
      if (!storedToken) {
        setErrorMessage("面试会话凭证不存在，请从面试配置页重新进入。");
        setConnection("failed");
        setIsLoading(false);
        return;
      }
      setRuntimeToken(storedToken);
      setErrorMessage(null);

      try {
        const restored = await getInterviewMessages(
          numericSessionId,
          0,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        const restoredMessages = restored.items
          .slice()
          .sort((left, right) => left.seq - right.seq)
          .map((message) => ({
            ...message,
            key: `persisted-${message.seq}`,
            phase: normalizePhase(message.phase),
          }));
        setMessages(restoredMessages);
        const lastPhase = restoredMessages.at(-1)?.phase;
        if (lastPhase) setPhase(normalizePhase(lastPhase));
        setIsLoading(false);
      } catch (error) {
        if (controller.signal.aborted) return;
        setErrorMessage(
          error instanceof Error
            ? `历史恢复失败：${error.message}`
            : "历史恢复失败，请刷新重试。",
        );
        setConnection("failed");
        setIsLoading(false);
        return;
      }

      let attempt = 0;
      while (!controller.signal.aborted && !endedRef.current) {
        try {
          setConnection(attempt === 0 ? "connecting" : "reconnecting");
          await streamInterview({
            sessionId: numericSessionId,
            runtimeToken: storedToken,
            afterSeq: lastEventSeqRef.current,
            signal: controller.signal,
            onEvent: handleStreamEvent,
          });
        } catch {
          if (controller.signal.aborted || endedRef.current) return;
        }

        if (controller.signal.aborted || endedRef.current) return;
        attempt += 1;
        if (attempt >= reconnectDelays.length) {
          setConnection("failed");
          return;
        }
        setConnection("reconnecting");
        await sleep(reconnectDelays[attempt - 1], controller.signal);
      }
    };

    void run();
    return () => {
      controller.abort();
      if (requestControllerRef.current === controller) {
        requestControllerRef.current = null;
      }
    };
  }, [
    connectionRetry,
    handleStreamEvent,
    numericSessionId,
    validSessionId,
  ]);

  useEffect(() => {
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (endedRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, []);

  useEffect(() => {
    const container = chatRef.current;
    if (!container || showLatest) return;
    container.scrollTop = container.scrollHeight;
  }, [messages, isThinking, showLatest]);

  const handleChatScroll = () => {
    const container = chatRef.current;
    if (!container) return;
    const distance =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    setShowLatest(distance > 100);
  };

  const scrollToLatest = () => {
    const container = chatRef.current;
    if (container) container.scrollTop = container.scrollHeight;
    setShowLatest(false);
  };

  const handleSubmitAnswer = async () => {
    const content = answerText.trim();
    if (!content || isSubmitting || !runtimeToken) return;

    const questionId = currentQuestion?.questionId ?? null;
    const answer =
      pendingAnswer?.content === content &&
      pendingAnswer.questionId === questionId
        ? pendingAnswer
        : { answerId: newAnswerId(), content, questionId };
    setPendingAnswer(answer);
    setIsSubmitting(true);
    setErrorMessage(null);

    const localKey = `pending-${answer.answerId}`;
    const controller = new AbortController();
    try {
      await submitInterviewAnswer(
        numericSessionId,
        answer,
        runtimeToken,
        controller.signal,
      );
      setMessages((items) => [
        ...items.map((item) =>
          item.streaming ? { ...item, streaming: false } : item,
        ),
        {
          key: localKey,
          role: "candidate",
          content,
          phase,
          questionId,
          audioUrl: null,
          seq: lastEventSeqRef.current,
          createdAt: new Date().toISOString(),
        },
      ]);
      setPendingAnswer(null);
      setAnswerText("");
      setIsThinking(true);
    } catch {
      setErrorMessage("回答发送失败，请检查网络后重试。");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleManualEnd = async () => {
    if (!runtimeToken) return;
    setErrorMessage(null);
    const controller = new AbortController();
    try {
      await endInterviewRuntime(
        numericSessionId,
        runtimeToken,
        controller.signal,
      );
      setConfirmEndOpen(false);
      goResult();
    } catch {
      setErrorMessage("结束请求发送失败，请检查网络后重试。");
    }
  };

  const activePhaseIndex = Math.max(
    0,
    phaseOrder.indexOf(phase as (typeof phaseOrder)[number]),
  );

  return (
    <div className="flex h-dvh min-h-[620px] flex-col overflow-hidden bg-[#fafafa] text-[#0a0a0a]">
      <header className="shrink-0 border-b border-[#eee] bg-white px-4 py-3.5 md:px-7">
        <div className="mx-auto flex max-w-[1040px] items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Logo />
            <span className="hidden h-[18px] w-px bg-[#e5e5e5] sm:block" />
            <span className="truncate text-[13px] font-medium text-[#525252]">
              面试会话 #{sessionId}
            </span>
          </div>
          <div className="flex items-center gap-2 md:gap-3">
            <span
              className={`hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-xs sm:inline-flex ${
                connection === "connected"
                  ? "bg-emerald-50 text-emerald-700"
                  : connection === "failed"
                    ? "bg-red-50 text-red-600"
                    : "bg-orange-50 text-orange-600"
              }`}
            >
              <span className="block h-1.5 w-1.5 rounded-full bg-current" />
              {connectionLabel(connection)}
            </span>
            {connection === "failed" && runtimeToken && (
              <button
                type="button"
                onClick={() => {
                  setConnection("connecting");
                  setErrorMessage(null);
                  setConnectionRetry((value) => value + 1);
                }}
                className="mira-button rounded-[9px] border border-orange-200 bg-orange-50 px-3 py-2 text-[13px] text-orange-700"
              >
                重新连接
              </button>
            )}
            <button
              type="button"
              onClick={() => setReviewOpen(true)}
              className="mira-button rounded-[9px] border border-[#e5e5e5] bg-white px-3 py-2 text-[13px]"
            >
              ↗ 回看
            </button>
            <button
              type="button"
              onClick={() => setConfirmEndOpen(true)}
              className="mira-button rounded-[9px] border border-[#e5e5e5] bg-white px-3 py-2 text-[13px] text-[#525252] hover:border-red-200 hover:bg-red-50 hover:text-red-600"
            >
              结束面试
            </button>
          </div>
        </div>
      </header>

      <div className="shrink-0 border-b border-[#f0f0f0] bg-white px-4 py-3">
        <div className="mx-auto flex max-w-[920px] items-start gap-1.5">
          {phaseOrder.map((item, index) => (
            <div key={item} className="min-w-0 flex-1 text-center">
              <span
                className={`mb-1 block h-1.5 rounded-full transition-colors ${
                  index <= activePhaseIndex ? "bg-orange-500" : "bg-[#e5e5e5]"
                } ${index === activePhaseIndex ? "animate-mira-pulse" : ""}`}
              />
              <span
                className={`hidden truncate text-[10px] md:block ${
                  index === activePhaseIndex
                    ? "font-medium text-orange-600"
                    : "text-[#a3a3a3]"
                }`}
              >
                {phaseLabels[item]}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-1 text-center text-xs font-medium text-orange-600 md:hidden">
          {phaseLabels[phase] ?? phase}
        </div>
      </div>

      <main className="relative min-h-0 flex-1">
        <div
          ref={chatRef}
          onScroll={handleChatScroll}
          className="h-full overflow-y-auto px-4 py-6 md:px-8"
          aria-live="polite"
        >
          <div className="mx-auto flex max-w-[820px] flex-col gap-5">
            {isLoading && (
              <div className="flex flex-col items-center gap-3 py-16 text-sm text-[#737373]">
                <StageIcon thinking />
                正在恢复本场面试…
              </div>
            )}
            {!isLoading && messages.length === 0 && !errorMessage && (
              <div className="flex flex-col items-center gap-3 py-16 text-sm text-[#737373]">
                <StageIcon thinking />
                面试官正在准备开场问题
              </div>
            )}
            {messages.map((message) => (
              <div
                key={message.key}
                className={`flex ${
                  message.role === "candidate"
                    ? "justify-end"
                    : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-[14.5px] leading-7 shadow-sm md:max-w-[72%] ${
                    message.role === "candidate"
                      ? "rounded-br-md bg-orange-500 text-white"
                      : "rounded-bl-md border border-[#eee] bg-white text-[#262626]"
                  } ${message.pending ? "opacity-70" : ""}`}
                >
                  <div className="mb-1 text-[11px] opacity-65">
                    {message.role === "candidate" ? "你" : "Mira 面试官"} ·{" "}
                    {phaseLabels[normalizePhase(message.phase)] ??
                      normalizePhase(message.phase)}
                  </div>
                  <p className="m-0 whitespace-pre-wrap">{message.content}</p>
                  {message.streaming && (
                    <span className="ml-1 inline-block h-4 w-0.5 animate-mira-pulse bg-orange-500 align-middle" />
                  )}
                </div>
              </div>
            ))}
            {isThinking && (
              <div className="flex justify-start">
                <div className="inline-flex items-center gap-2 rounded-2xl rounded-bl-md border border-[#eee] bg-white px-4 py-3 text-sm text-[#737373] shadow-sm">
                  <span className="flex gap-1">
                    {[0, 1, 2].map((item) => (
                      <span
                        key={item}
                        className="animate-mira-pulse block h-1.5 w-1.5 rounded-full bg-orange-400"
                      />
                    ))}
                  </span>
                  Mira 正在思考
                </div>
              </div>
            )}
          </div>
        </div>
        {showLatest && (
          <button
            type="button"
            onClick={scrollToLatest}
            className="mira-button absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-orange-200 bg-white px-4 py-2 text-xs text-orange-600 shadow-lg"
          >
            ↓ 回到最新
          </button>
        )}
      </main>

      <footer className="shrink-0 border-t border-[#eee] bg-white px-4 pt-3 pb-[max(14px,env(safe-area-inset-bottom))] md:px-8">
        <div className="mx-auto max-w-[820px]">
          {errorMessage && (
            <div
              role="alert"
              className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-center text-xs text-red-600"
            >
              {errorMessage}
            </div>
          )}
          <div className="mb-2 flex justify-center gap-1 rounded-lg text-xs">
            <button
              type="button"
              disabled
              title="语音模式将在 T-114 接入"
              className="cursor-not-allowed rounded-lg border border-[#eee] px-3 py-1.5 text-[#b5b5b5]"
            >
              语音回答（即将支持）
            </button>
            <span className="rounded-lg bg-orange-500 px-3 py-1.5 font-medium text-white">
              打字回答
            </span>
          </div>
          <div className="flex items-end gap-2 rounded-[14px] border border-[#e5e5e5] bg-white p-2.5 shadow-[0_3px_16px_rgba(0,0,0,.05)] focus-within:border-orange-300">
            <textarea
              value={answerText}
              onChange={(event) => setAnswerText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void handleSubmitAnswer();
                }
              }}
              disabled={isLoading || isSubmitting || isThinking || isEnded}
              placeholder="输入你的回答，Shift + Enter 换行"
              rows={2}
              className="max-h-28 min-h-12 flex-1 resize-none border-none bg-transparent px-1 text-[14.5px] leading-6 outline-none disabled:cursor-not-allowed disabled:opacity-60"
            />
            <button
              type="button"
              onClick={() => void handleSubmitAnswer()}
              disabled={
                isLoading ||
                isSubmitting ||
                isThinking ||
                !answerText.trim() ||
                !runtimeToken
              }
              className="mira-button shrink-0 rounded-[10px] bg-orange-500 px-4 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-[#d4d4d4]"
            >
              {isSubmitting ? "发送中…" : "提交回答"}
            </button>
          </div>
        </div>
      </footer>

      {reviewOpen && (
        <>
          <button
            type="button"
            aria-label="关闭回看"
            onClick={() => setReviewOpen(false)}
            className="fixed inset-0 z-[1500] bg-[#0a0a0a]/35 backdrop-blur-[2px]"
          />
          <aside className="animate-mira-slide-left fixed top-0 right-0 bottom-0 z-[1600] flex w-full max-w-[440px] flex-col bg-white shadow-[-20px_0_60px_-20px_rgba(0,0,0,.25)]">
            <div className="flex items-center justify-between border-b border-[#f2f2f2] px-6 py-5">
              <div>
                <h2 className="m-0 text-[17px] font-semibold">回看本场问答</h2>
                <p className="m-0 mt-1 text-xs text-[#a3a3a3]">
                  来自服务端恢复与本轮实时消息
                </p>
              </div>
              <button
                type="button"
                aria-label="关闭"
                onClick={() => setReviewOpen(false)}
                className="mira-button h-9 w-9 rounded-lg border border-[#eee]"
              >
                ×
              </button>
            </div>
            <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-6 py-5">
              {messages.length === 0 ? (
                <p className="py-12 text-center text-sm text-[#a3a3a3]">
                  暂无可回看的消息
                </p>
              ) : (
                messages.map((message) => (
                  <div
                    key={`review-${message.key}`}
                    className={`rounded-xl border p-3 ${
                      message.role === "candidate"
                        ? "border-orange-100 bg-orange-50"
                        : "border-[#eee] bg-[#fafafa]"
                    }`}
                  >
                    <div className="mb-1 text-[11px] text-[#a3a3a3]">
                      {message.role === "candidate" ? "你的回答" : "面试官"}
                    </div>
                    <p className="m-0 whitespace-pre-wrap text-[13.5px] leading-6 text-[#404040]">
                      {message.content}
                    </p>
                  </div>
                ))
              )}
            </div>
          </aside>
        </>
      )}

      {confirmEndOpen && (
        <>
          <button
            type="button"
            aria-label="取消结束"
            onClick={() => setConfirmEndOpen(false)}
            className="fixed inset-0 z-[1700] bg-[#0a0a0a]/35 backdrop-blur-[2px]"
          />
          <div
            role="dialog"
            aria-modal="true"
            className="animate-mira-soft-pop fixed top-1/2 left-1/2 z-[1800] w-[calc(100%-32px)] max-w-[390px] -translate-x-1/2 -translate-y-1/2 rounded-[18px] border border-red-100 bg-white p-6 shadow-2xl"
          >
            <h2 className="m-0 mb-2 text-xl font-semibold">确认结束面试？</h2>
            <p className="m-0 mb-6 text-sm leading-6 text-[#737373]">
              尚未发送的输入不会被保存；结束后将进入结果页。
            </p>
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => setConfirmEndOpen(false)}
                className="mira-button flex-1 rounded-[10px] border border-[#e5e5e5] py-2.5 text-sm"
              >
                继续面试
              </button>
              <button
                type="button"
                onClick={() => void handleManualEnd()}
                className="mira-button flex-1 rounded-[10px] bg-red-600 py-2.5 text-sm font-medium text-white"
              >
                确认结束
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
