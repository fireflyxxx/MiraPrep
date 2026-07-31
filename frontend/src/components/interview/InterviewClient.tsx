"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Image from "next/image";
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

type RestoredInterviewerReplay = {
  content: string;
  offset: number;
  questionId: string | number | null;
};

type InterviewTokenPayload = Extract<
  InterviewStreamEvent,
  { type: "token" }
>["payload"];

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
      return "会话在线";
    case "reconnecting":
      return "正在恢复";
    case "failed":
      return "连接断开";
    default:
      return "正在连接";
  }
}

function formatClock(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainder = safeSeconds % 60;
  return [hours, minutes, remainder]
    .filter((_, index) => hours > 0 || index > 0)
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
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
  const [pendingAnswer, setPendingAnswer] = useState<PendingAnswer | null>(null);
  const [clockNow, setClockNow] = useState<number | null>(null);
  const lastEventSeqRef = useRef(0);
  const restoredReplayRef = useRef<RestoredInterviewerReplay[]>([]);
  const endedRef = useRef(false);
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

  const activeExchange = useMemo(() => {
    let interviewerIndex = -1;
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index].role === "interviewer") {
        interviewerIndex = index;
        break;
      }
    }

    if (interviewerIndex < 0) {
      return { interviewer: undefined, answer: undefined };
    }

    const interviewer = messages[interviewerIndex];
    let answer: ChatMessage | undefined;
    for (let index = messages.length - 1; index > interviewerIndex; index -= 1) {
      const message = messages[index];
      if (
        message.role === "candidate" &&
        message.questionId === interviewer.questionId
      ) {
        answer = message;
        break;
      }
    }

    return { interviewer, answer };
  }, [messages]);

  const interviewStartedAt = useMemo(() => {
    const timestamps = messages
      .map((message) => Date.parse(message.createdAt))
      .filter(Number.isFinite);
    return timestamps.length ? Math.min(...timestamps) : null;
  }, [messages]);
  const currentQuestionStartedAt = activeExchange.interviewer
    ? Date.parse(activeExchange.interviewer.createdAt)
    : null;
  const currentQuestionEndedAt = activeExchange.answer
    ? Date.parse(activeExchange.answer.createdAt)
    : null;
  const totalElapsed =
    clockNow !== null && interviewStartedAt !== null
      ? (clockNow - interviewStartedAt) / 1_000
      : 0;
  const currentQuestionElapsed =
    clockNow !== null &&
    currentQuestionStartedAt !== null &&
    Number.isFinite(currentQuestionStartedAt)
      ? ((currentQuestionEndedAt !== null && Number.isFinite(currentQuestionEndedAt)
          ? currentQuestionEndedAt
          : clockNow) -
          currentQuestionStartedAt) /
        1_000
      : 0;

  const reviewQuestions = useMemo(() => {
    const questions: Array<{
      answer?: ChatMessage;
      question: ChatMessage;
    }> = [];

    for (const message of messages) {
      if (message.questionId === null) continue;

      if (message.role === "interviewer") {
        const previous = questions.at(-1);
        if (
          previous?.question.questionId === message.questionId &&
          previous.question.content === message.content
        ) {
          continue;
        }
        questions.push({ question: message });
        continue;
      }

      const unanswered = [...questions]
        .reverse()
        .find(
          (item) =>
            item.question.questionId === message.questionId && !item.answer,
        );
      if (unanswered) unanswered.answer = message;
    }

    return questions;
  }, [messages]);

  const isRestoredReplayToken = useCallback(
    (payload: InterviewTokenPayload) => {
      const queue = restoredReplayRef.current;
      const expected = queue[0];
      if (!expected) return false;

      const sameQuestion =
        String(expected.questionId) === String(payload.questionId ?? null);
      const remaining = expected.content.slice(expected.offset);
      if (!sameQuestion || !remaining.startsWith(payload.text)) {
        restoredReplayRef.current = [];
        return false;
      }

      expected.offset += payload.text.length;
      if (expected.offset >= expected.content.length) queue.shift();
      return true;
    },
    [],
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

      if (isRestoredReplayToken(event.payload)) return;

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
    [goResult, isRestoredReplayToken, numericSessionId],
  );

  useEffect(() => {
    const initialTimer = window.setTimeout(() => setClockNow(Date.now()), 0);
    const timer = window.setInterval(() => setClockNow(Date.now()), 1_000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, []);

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
        restoredReplayRef.current =
          lastEventSeqRef.current === 0
            ? restoredMessages
                .filter((message) => message.role === "interviewer")
                .map((message) => ({
                  content: message.content,
                  offset: 0,
                  questionId: message.questionId,
                }))
            : [];
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
            onOpen: () => setConnection("connected"),
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
        pending: true,
      },
    ]);
    setAnswerText("");

    const controller = new AbortController();
    try {
      await submitInterviewAnswer(
        numericSessionId,
        answer,
        runtimeToken,
        controller.signal,
      );
      setMessages((items) =>
        items.map((item) =>
          item.key === localKey ? { ...item, pending: false } : item,
        ),
      );
      setPendingAnswer(null);
      setIsThinking(true);
    } catch {
      setMessages((items) => items.filter((item) => item.key !== localKey));
      setAnswerText(content);
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

  // questionId 表示大纲主问题，追问会沿用同一个 id；进度应按实际提问轮次增长。
  const askedQuestionCount = reviewQuestions.length;

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
              role="status"
              aria-live="polite"
              aria-label={`连接状态：${connectionLabel(connection)}`}
              data-tone={
                connection === "connected"
                  ? "quiet"
                  : connection === "failed"
                    ? "critical"
                    : "in-progress"
              }
              className={`inline-flex h-8 items-center gap-2 border-r border-[#eceae6] pr-3 text-[11.5px] font-medium tracking-[0.01em] ${
                connection === "connected"
                  ? "text-[#6b6b68]"
                  : connection === "failed"
                    ? "text-[#8f413b]"
                    : "text-[#806445]"
              }`}
            >
              <span
                aria-hidden="true"
                className="relative flex h-3 w-3 shrink-0 items-center justify-center"
              >
                {(connection === "connecting" || connection === "reconnecting") && (
                  <span className="absolute h-2.5 w-2.5 animate-ping rounded-full bg-[#c58a45]/20 motion-reduce:animate-none" />
                )}
                <span
                  className={`relative block h-1.5 w-1.5 rounded-full ${
                    connection === "connected"
                      ? "bg-[#5f8f72]"
                      : connection === "failed"
                        ? "bg-[#b65b52]"
                        : "bg-[#c58a45]"
                  }`}
                />
              </span>
              <span className="hidden sm:inline">{connectionLabel(connection)}</span>
            </span>
            {connection === "failed" && runtimeToken && (
              <button
                type="button"
                onClick={() => {
                  setConnection("connecting");
                  setErrorMessage(null);
                  setConnectionRetry((value) => value + 1);
                }}
                className="mira-button -ml-1 rounded-md px-2 py-1.5 text-[12px] font-medium text-[#8f413b] underline decoration-[#d8aaa6] underline-offset-4 hover:bg-[#fff7f6]"
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

      <main className="relative flex min-h-0 flex-1 flex-col">
        <div className="shrink-0 px-4 py-3">
          <div className="mx-auto mb-2 flex max-w-[920px] items-center justify-between text-[11.5px] text-[#737373]">
            <span aria-label="面试总用时" className="tabular-nums">
              总用时 {formatClock(totalElapsed)}
            </span>
            <span aria-label="当前问题用时" className="tabular-nums">
              本题用时 {formatClock(currentQuestionElapsed)}
            </span>
          </div>
          <ol
            aria-label={`面试进度：已问 ${askedQuestionCount} 题`}
            className="mx-auto flex min-h-1.5 max-w-[920px] flex-wrap items-center justify-center gap-1.5"
          >
            {Array.from({ length: askedQuestionCount }, (_, index) => (
              <li
                key={index}
                aria-current={index === askedQuestionCount - 1 ? "step" : undefined}
                className={`h-1.5 w-9 rounded-full bg-primary ${
                  index === askedQuestionCount - 1 ? "animate-mira-segment-grow" : ""
                }`}
              />
            ))}
          </ol>
        </div>
        <section
          aria-label="当前面试交流"
          aria-live="polite"
          className="relative min-h-0 flex-1 overflow-y-auto px-5 pb-[180px] md:px-10 md:pb-[190px]"
        >
          <div
            className="pointer-events-none absolute inset-0 overflow-hidden"
            aria-hidden="true"
          >
            <span className="absolute top-[12%] left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-orange-100/55 blur-[90px]" />
            <span className="absolute bottom-[-18%] left-[12%] h-56 w-56 rounded-full bg-amber-50 blur-[80px]" />
          </div>

          {isLoading ? (
            <div className="relative flex flex-col items-center gap-4 text-sm text-[#737373]">
              <StageIcon thinking />
              正在恢复本场面试…
            </div>
          ) : !activeExchange.interviewer && !errorMessage ? (
            <div className="relative flex flex-col items-center gap-4 text-sm text-[#737373]">
              <StageIcon thinking />
              面试官正在准备开场问题
            </div>
          ) : activeExchange.interviewer ? (
            <div
              data-testid="interview-stage-flow"
              className="relative mx-auto flex min-h-full w-full max-w-[920px] shrink-0 flex-col items-center pt-[clamp(1.5rem,6vh,4rem)] pb-10 text-center"
            >
              <div className="relative mb-4">
                <span className="animate-mira-pulse-slow absolute -inset-2 rounded-full border border-orange-200/70" />
                <div className="relative h-24 w-24 overflow-hidden rounded-full border-[3px] border-white bg-orange-50 shadow-[0_18px_48px_-20px_rgba(98,52,22,.65)]">
                  <Image
                    src="/mira-interviewer-v4.webp"
                    alt="Mira 机器人面试官头像"
                    fill
                    sizes="96px"
                    priority
                    className="object-cover"
                  />
                </div>
                <span className="absolute right-0.5 bottom-0.5 h-3.5 w-3.5 rounded-full border-[3px] border-[#fafafa] bg-emerald-500" />
              </div>

              <div className="mb-5 text-[11px] font-medium tracking-[0.16em] text-[#8a8a8a] uppercase">
                Mira 面试官
              </div>

              <p className="m-0 max-w-[880px] text-[clamp(1.4rem,2.4vw,2.2rem)] leading-[1.5] font-medium tracking-[-0.025em] text-[#171717]">
                {activeExchange.interviewer.content}
                {activeExchange.interviewer.streaming && (
                  <span className="ml-1.5 inline-block h-[1.1em] w-0.5 animate-mira-pulse bg-orange-500 align-[-0.12em]" />
                )}
              </p>

              {activeExchange.answer && (
                <div
                  data-testid="candidate-stage-answer"
                  className="animate-mira-answer-pop mt-8 w-full max-w-[760px] text-center md:mt-10"
                >
                  <p className="m-0 whitespace-pre-wrap text-[clamp(1.05rem,1.6vw,1.35rem)] leading-[1.75] font-normal text-[#525252]">
                    {activeExchange.answer.content}
                  </p>
                </div>
              )}

              {(isSubmitting || isThinking) && (
                <div className="mt-6 inline-flex items-center gap-2 text-xs text-[#8a8a8a]">
                  <span className="flex gap-1">
                    {[0, 1, 2].map((item) => (
                      <span
                        key={item}
                        className="animate-mira-pulse block h-1.5 w-1.5 rounded-full bg-orange-400"
                      />
                    ))}
                  </span>
                  面试官正在准备下一个问题
                </div>
              )}
            </div>
          ) : null}
        </section>

        <footer
          data-testid="floating-answer-composer"
          className="pointer-events-none absolute inset-x-0 bottom-0 z-30 px-4 pb-[max(14px,env(safe-area-inset-bottom))] max-sm:bottom-14 md:px-8"
        >
          <div className="pointer-events-auto mx-auto max-w-[840px]">
          {errorMessage && (
            <div
              role="alert"
              className="mx-auto mb-2 max-w-[620px] rounded-xl border border-red-100 bg-red-50/95 px-3 py-2 text-center text-xs text-red-600 shadow-sm backdrop-blur"
            >
              {errorMessage}
            </div>
          )}
          <div className="mb-2 flex justify-center gap-1 text-xs">
            <button
              type="button"
              disabled
              title="语音模式将在 T-114 接入"
              className="cursor-not-allowed rounded-full border border-white/90 bg-white/80 px-3.5 py-1.5 text-[#b5b5b5] shadow-sm backdrop-blur-xl"
            >
              语音回答（即将支持）
            </button>
            <span className="rounded-full bg-orange-500 px-3.5 py-1.5 font-medium text-white shadow-[0_8px_22px_-10px_rgba(249,115,22,.85)]">
              打字回答
            </span>
          </div>
          <div className="flex items-end gap-2 rounded-[20px] border border-white/90 bg-white/88 p-3 shadow-[0_22px_60px_-24px_rgba(30,20,12,.38),0_8px_24px_-16px_rgba(249,115,22,.28)] ring-1 ring-black/[0.06] backdrop-blur-xl transition-[border-color,box-shadow] focus-within:border-orange-300/90 focus-within:shadow-[0_24px_64px_-24px_rgba(30,20,12,.42),0_10px_30px_-14px_rgba(249,115,22,.36)]">
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
              className="max-h-28 min-h-12 flex-1 resize-none border-none bg-transparent px-1.5 py-0.5 text-[14.5px] leading-6 outline-none placeholder:text-[#a3a3a3] disabled:cursor-not-allowed disabled:opacity-60"
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
              className="mira-button shrink-0 rounded-[12px] bg-orange-500 px-4 py-2.5 text-sm font-medium text-white shadow-[0_8px_22px_-10px_rgba(249,115,22,.9)] disabled:cursor-not-allowed disabled:bg-[#d4d4d4] disabled:shadow-none"
            >
              提交回答
            </button>
          </div>
          </div>
        </footer>
      </main>

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
            <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-5">
              {reviewQuestions.length === 0 ? (
                <p className="py-12 text-center text-sm text-[#a3a3a3]">
                  暂无可回看的问答
                </p>
              ) : (
                reviewQuestions.map((item, index) => (
                  <article
                    key={`review-${item.question.key}`}
                    data-testid={`review-question-${index + 1}`}
                    className="rounded-[18px] border border-[#e8e8e8] bg-[#fcfcfc] p-4 shadow-[0_10px_30px_-24px_rgba(0,0,0,.35)]"
                  >
                    <div className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-[0.08em] text-orange-600">
                      <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
                      问题 {index + 1}
                    </div>
                    <p className="m-0 whitespace-pre-wrap text-[14px] leading-6 font-medium text-[#262626]">
                      {item.question.content}
                    </p>
                    <div className="mt-4 border-l-2 border-orange-200 pl-3">
                      <div className="mb-1 text-[11px] font-medium text-[#a3a3a3]">
                        回答
                      </div>
                      <p className="m-0 whitespace-pre-wrap text-[13.5px] leading-6 text-[#525252]">
                        {item.answer?.content ?? "尚未回答"}
                      </p>
                    </div>
                  </article>
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
