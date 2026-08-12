import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import InterviewClient from "./InterviewClient";
import type { InterviewRuntimeState } from "./InterviewRuntimeTypes";
import type { InterviewStreamEvent } from "@/lib/api/interview-stream";
import type { ReportQuestion } from "@/lib/api/report";
import {
  getInterviewVoicePreference,
  storeInterviewVoicePreference,
  VoiceSocketCloseError,
  type VoiceInterviewEvent,
  type VoiceInterviewSocket,
} from "@/lib/api/interview-ws";

const push = vi.fn();
const router = { push };
const getInterviewMessages = vi.fn();
const submitInterviewAnswer = vi.fn();
const endInterviewRuntime = vi.fn();
const streamInterview = vi.fn();
const getInterviewRuntimeToken = vi.fn(() => "runtime-token");
const getInterviewEventCursor = vi.fn(() => 0);
let emit: ((event: InterviewStreamEvent) => void) | undefined;
let openConnection: (() => void) | undefined;
const streamVoiceInterview = vi.fn();
const voiceSocket: VoiceInterviewSocket = {
  sendAudio: vi.fn(() => true),
  finishAudio: vi.fn(() => true),
  confirmTranscript: vi.fn(() => true),
  setVoice: vi.fn(() => true),
  close: vi.fn(),
};
let emitVoice: ((event: VoiceInterviewEvent) => void) | undefined;
const enqueueAudio = vi.fn();
const stopAudio = vi.fn();
const unlockAudio = vi.fn();

function stubMicrophoneCapture() {
  vi.stubGlobal(
    "AudioWorkletNode",
    class {
      port = { onmessage: null };
      connect() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    "AudioContext",
    class {
      sampleRate = 16_000;
      destination = {};
      audioWorklet = { addModule: vi.fn().mockResolvedValue(undefined) };
      resume = vi.fn().mockResolvedValue(undefined);
      close = vi.fn().mockResolvedValue(undefined);
      createMediaStreamSource = () => ({ connect() {}, disconnect() {} });
      createGain = () => ({ gain: { value: 1 }, connect() {}, disconnect() {} });
    },
  );
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: vi.fn().mockResolvedValue({
        getTracks: () => [{ stop: vi.fn() }],
      }),
    },
  });
}

function MockPracticeAnswerCard(
  runtime: InterviewRuntimeState & {
    question: ReportQuestion;
    onRequestClose: () => void;
  },
) {
  const setTtsPlayerHandle = runtime.setTtsPlayerHandle;
  useEffect(() => {
    setTtsPlayerHandle({
      enqueue: enqueueAudio,
      stop: stopAudio,
      unlock: unlockAudio,
    });
    return () => {
      setTtsPlayerHandle(null);
    };
  }, [setTtsPlayerHandle]);

  return (
    <div data-testid="headless-runtime" data-connection={runtime.connection}>
      <button type="button" onClick={runtime.enableVoiceMode}>
        开启测试语音
      </button>
      <button
        type="button"
        disabled={!runtime.canReplayQuestionAudio}
        onClick={runtime.replayQuestionAudio}
      >
        重播测试题目
      </button>
    </div>
  );
}

vi.mock("@/components/report/PracticeAnswerCard", () => ({
  default: MockPracticeAnswerCard,
}));

const practiceQuestion: ReportQuestion = {
  questionId: 11,
  order: 1,
  phase: "SELF_INTRO",
  text: "请先介绍一下自己。",
  focusPoints: [],
  answer: "",
  score: null,
  thinkSeconds: null,
  answerSeconds: null,
  suggestedSeconds: null,
  referenceAnswer: "",
  suggestions: [],
  followUpChain: [],
  audioUrl: null,
};

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

vi.mock("@/lib/api/interview-stream", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/interview-stream")>(
    "@/lib/api/interview-stream",
  );
  return {
    ...actual,
    getInterviewRuntimeToken: () => getInterviewRuntimeToken(),
    getInterviewEventCursor: () => getInterviewEventCursor(),
    clearInterviewRuntimeToken: vi.fn(),
    getInterviewMessages: (...args: unknown[]) => getInterviewMessages(...args),
    submitInterviewAnswer: (...args: unknown[]) => submitInterviewAnswer(...args),
    endInterviewRuntime: (...args: unknown[]) => endInterviewRuntime(...args),
    streamInterview: (options: {
      onEvent: (event: InterviewStreamEvent) => void;
      onOpen?: () => void;
      signal: AbortSignal;
    }) => {
      emit = options.onEvent;
      openConnection = options.onOpen;
      return streamInterview(options);
    },
  };
});

vi.mock("@/lib/api/interview-ws", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/interview-ws")>(
    "@/lib/api/interview-ws",
  );
  return {
    ...actual,
    clearInterviewAudioCursor: vi.fn(),
    streamVoiceInterview: (options: {
      onEvent: (event: VoiceInterviewEvent) => void;
      onOpen?: (socket: VoiceInterviewSocket) => void;
      signal: AbortSignal;
    }) => {
      emitVoice = options.onEvent;
      options.onOpen?.(voiceSocket);
      return streamVoiceInterview(options);
    },
  };
});

describe("InterviewClient runtime", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    window.sessionStorage.clear();
    push.mockReset();
    getInterviewMessages.mockReset().mockResolvedValue({
      items: [
        {
          role: "interviewer",
          content: "请先介绍一下自己。",
          phase: "self_intro",
          questionId: 11,
          audioUrl: null,
          seq: 3,
          createdAt: "2026-07-24T01:00:00Z",
        },
        {
          role: "candidate",
          content: "我是小明。",
          phase: "self_intro",
          questionId: 11,
          audioUrl: null,
          seq: 4,
          createdAt: "2026-07-24T01:00:10Z",
        },
      ],
    });
    submitInterviewAnswer.mockReset().mockResolvedValue({ accepted: true });
    endInterviewRuntime.mockReset().mockResolvedValue({ accepted: true });
    streamInterview.mockReset().mockImplementation(
      ({ signal }: { signal: AbortSignal }) =>
        new Promise<void>((resolve) => {
          signal.addEventListener("abort", () => resolve(), { once: true });
        }),
    );
    getInterviewRuntimeToken.mockClear();
    getInterviewEventCursor.mockClear();
    emit = undefined;
    openConnection = undefined;
    emitVoice = undefined;
    streamVoiceInterview.mockReset().mockImplementation(
      ({ signal }: { signal: AbortSignal }) =>
        new Promise<void>((resolve) => {
          signal.addEventListener("abort", () => resolve(), { once: true });
        }),
    );
    vi.mocked(voiceSocket.confirmTranscript).mockClear();
    vi.mocked(voiceSocket.finishAudio).mockClear();
    vi.mocked(voiceSocket.setVoice).mockClear();
    enqueueAudio.mockClear();
    stopAudio.mockClear();
    unlockAudio.mockClear();
  });

  it("does not read browser storage while rendering the SSR HTML", () => {
    renderToString(<InterviewClient sessionId="42" />);

    expect(getInterviewRuntimeToken).not.toHaveBeenCalled();
    expect(getInterviewEventCursor).not.toHaveBeenCalled();
  });

  it("restores persisted history before subscribing from the saved SSE cursor", async () => {
    render(<InterviewClient sessionId="42" />);

    expect(await screen.findByText("请先介绍一下自己。")).toBeInTheDocument();
    const shell = screen.getByTestId("interview-shell");
    expect(shell).not.toHaveAttribute("data-theme", "interview-dark");
    expect(shell).toHaveClass(
      "bg-white",
      "text-[#171717]",
      "dark:bg-[#0d0f12]",
      "dark:text-[#f7f7f5]",
    );
    expect(screen.getByTestId("interview-header")).toHaveClass(
      "bg-white/95",
      "dark:bg-[#111318]/95",
    );
    expect(screen.getByText("我是小明。")).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "当前面试交流" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("floating-answer-composer")).toHaveClass(
      "absolute",
      "bottom-0",
    );
    expect(screen.getByTestId("floating-answer-composer")).toHaveAttribute(
      "data-surface",
      "adaptive",
    );
    expect(screen.getByTestId("unified-answer-composer")).toHaveClass(
      "bg-white/95",
      "dark:bg-[#17191f]/92",
    );
    expect(screen.getByTestId("floating-answer-composer")).not.toHaveClass(
      "border-t",
    );
    await waitFor(() =>
      expect(streamInterview).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 42,
          runtimeToken: "runtime-token",
          afterSeq: 0,
        }),
      ),
    );
  });

  it("keeps the healthy connection state visually quiet", async () => {
    render(<InterviewClient sessionId="42" />);
    await waitFor(() => expect(openConnection).toBeTypeOf("function"));

    act(() => openConnection?.());

    const status = screen.getByRole("status", { name: "连接状态：会话在线" });
    expect(status).toHaveAttribute("data-tone", "quiet");
    expect(status).toHaveTextContent("会话在线");
    expect(status).not.toHaveClass("rounded-full", "bg-emerald-50");
    expect(screen.queryByText("实时连接正常")).not.toBeInTheDocument();
  });

  it("shows live total and current-question elapsed time from persisted timestamps", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-07-24T01:00:15Z"));

    render(<InterviewClient sessionId="42" />);

    await waitFor(() =>
      expect(screen.getByLabelText("面试总用时")).toHaveTextContent("00:15"),
    );
    expect(screen.getByLabelText("当前问题用时")).toHaveTextContent("00:10");

    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(screen.getByLabelText("面试总用时")).toHaveTextContent("00:20");
    expect(screen.getByLabelText("当前问题用时")).toHaveTextContent("00:10");
  });

  it("ignores replayed interviewer tokens already represented by restored history", async () => {
    getInterviewMessages.mockResolvedValueOnce({
      items: [
        {
          role: "interviewer",
          content: "你好，我是本次模拟面试官。",
          phase: "GREETING",
          questionId: null,
          audioUrl: null,
          seq: 1,
          createdAt: "2026-07-24T01:00:00Z",
        },
        {
          role: "interviewer",
          content: "请先介绍一下自己。",
          phase: "SELF_INTRO",
          questionId: 11,
          audioUrl: null,
          seq: 2,
          createdAt: "2026-07-24T01:00:01Z",
        },
      ],
    });

    render(<InterviewClient sessionId="42" />);
    await waitFor(() => expect(emit).toBeTypeOf("function"));

    act(() => {
      emit?.({
        type: "token",
        payload: {
          text: "你好，我是本次模拟面试官。",
          questionId: null,
          phase: "GREETING",
        },
        seq: 1,
      });
      emit?.({
        type: "token",
        payload: {
          text: "请先",
          questionId: 11,
          phase: "SELF_INTRO",
        },
        seq: 2,
      });
    });

    expect(screen.getByText("请先介绍一下自己。")).toBeInTheDocument();
    expect(screen.queryByText("你好，我是本次模拟面试官。")).not.toBeInTheDocument();
    expect(screen.queryByText("请先")).not.toBeInTheDocument();
  });

  it("renders token chunks into one interviewer bubble and advances the phase", async () => {
    render(<InterviewClient sessionId="42" />);
    await waitFor(() => expect(emit).toBeTypeOf("function"));

    act(() => {
      emit?.({
        type: "token",
        payload: {
          text: "请讲讲",
          questionId: 12,
          phase: "RESUME_DEEP_DIVE",
        },
        seq: 5,
      });
      emit?.({
        type: "token",
        payload: {
          text: "你的项目。",
          questionId: 12,
          phase: "RESUME_DEEP_DIVE",
        },
        seq: 6,
      });
      emit?.({
        type: "phase_change",
        payload: { from: "SELF_INTRO", to: "RESUME_DEEP_DIVE" },
        seq: 7,
      });
    });

    expect(screen.getByText("请讲讲你的项目。")).toBeInTheDocument();
    expect(screen.queryByText("请先介绍一下自己。")).not.toBeInTheDocument();
    expect(screen.queryByText("我是小明。")).not.toBeInTheDocument();
    expect(screen.queryByText("项目深挖")).not.toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Mira 机器人面试官头像" }),
    ).toBeInTheDocument();
  });

  it("grows the progress bar by one segment per asked question", async () => {
    render(<InterviewClient sessionId="42" />);
    // 恢复出来的历史里只有一道题，所以一开始只有一条。
    const bar = await screen.findByRole("list", { name: /面试进度/ });
    expect(bar.querySelectorAll("li")).toHaveLength(1);
    expect(bar.parentElement).not.toHaveClass("border-b");
    await waitFor(() => expect(streamInterview).toHaveBeenCalled());

    act(() => {
      emit?.({
        type: "token",
        payload: { text: "第二题来了。", questionId: 12, phase: "RESUME_DEEP_DIVE" },
        seq: 5,
      });
    });

    expect(bar.querySelectorAll("li")).toHaveLength(2);
    // 同一道题的续传 token 不该再长出一条。
    act(() => {
      emit?.({
        type: "token",
        payload: { text: "补充一句。", questionId: 12, phase: "RESUME_DEEP_DIVE" },
        seq: 6,
      });
    });

    expect(bar.querySelectorAll("li")).toHaveLength(2);
  });

  it("counts follow-up prompts as progress even when they share one question id", async () => {
    getInterviewMessages.mockResolvedValueOnce({
      items: [
        {
          role: "interviewer",
          content: "Question one",
          phase: "SELF_INTRO",
          questionId: 11,
          audioUrl: null,
          seq: 1,
          createdAt: "2026-07-24T01:00:00Z",
        },
        {
          role: "candidate",
          content: "Answer one",
          phase: "SELF_INTRO",
          questionId: 11,
          audioUrl: null,
          seq: 2,
          createdAt: "2026-07-24T01:00:01Z",
        },
        {
          role: "interviewer",
          content: "Question two",
          phase: "SELF_INTRO",
          questionId: 11,
          audioUrl: null,
          seq: 3,
          createdAt: "2026-07-24T01:00:02Z",
        },
        {
          role: "candidate",
          content: "Answer two",
          phase: "SELF_INTRO",
          questionId: 11,
          audioUrl: null,
          seq: 4,
          createdAt: "2026-07-24T01:00:03Z",
        },
        {
          role: "interviewer",
          content: "Question three",
          phase: "SELF_INTRO",
          questionId: 11,
          audioUrl: null,
          seq: 5,
          createdAt: "2026-07-24T01:00:04Z",
        },
      ],
    });

    render(<InterviewClient sessionId="42" />);

    const bar = await screen.findByRole("list", { name: /面试进度/ });
    expect(bar.querySelectorAll("li")).toHaveLength(3);
  });

  it("submits text, keeps a stable answer id, and shows it in real history", async () => {
    const user = userEvent.setup();
    render(<InterviewClient sessionId="42" />);
    await screen.findByText("请先介绍一下自己。");

    const textarea = screen.getByRole("textbox", { name: "你的回答" });
    await user.type(textarea, "这是我的新回答");
    await user.click(screen.getByRole("button", { name: "提交回答" }));

    await waitFor(() =>
      expect(submitInterviewAnswer).toHaveBeenCalledWith(
        42,
        expect.objectContaining({
          answerId: expect.stringMatching(/^answer-/),
          content: "这是我的新回答",
          questionId: 11,
        }),
        "runtime-token",
        expect.any(AbortSignal),
      ),
    );
    expect(await screen.findByText("这是我的新回答")).toBeInTheDocument();
    expect(screen.getByTestId("candidate-stage-answer")).toHaveClass(
      "animate-mira-answer-pop",
    );
    expect(textarea).toHaveValue("");
    expect(textarea).toBeDisabled();
    expect(screen.getByRole("button", { name: "提交回答" })).toBeDisabled();
  });

  it("moves the answer into the stage immediately without a sending label", async () => {
    let resolveSubmission: ((value: { accepted: boolean }) => void) | undefined;
    submitInterviewAnswer.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSubmission = resolve;
        }),
    );

    const user = userEvent.setup();
    render(<InterviewClient sessionId="42" />);
    await screen.findByText("请先介绍一下自己。");

    const textarea = screen.getByRole("textbox", { name: "你的回答" });
    await user.type(textarea, "这段回答应该立刻进入舞台");
    await user.click(screen.getByRole("button", { name: "提交回答" }));

    const stageAnswer = screen.getByTestId("candidate-stage-answer");
    expect(stageAnswer).toHaveTextContent("这段回答应该立刻进入舞台");
    expect(stageAnswer).toHaveClass("animate-mira-answer-pop", "text-center");
    expect(stageAnswer).not.toHaveClass("border-t");
    expect(stageAnswer).not.toHaveTextContent("你的回答");
    expect(textarea).toHaveValue("");
    expect(screen.queryByText("发送中…")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "提交回答" })).toBeDisabled();
    expect(
      screen.getByText("面试官正在准备下一个问题"),
    ).toBeInTheDocument();

    resolveSubmission?.({ accepted: true });
    await waitFor(() => expect(submitInterviewAnswer).toHaveBeenCalledTimes(1));
  });

  it("groups review history by answered question instead of chat messages", async () => {
    getInterviewMessages.mockResolvedValueOnce({
      items: [
        {
          role: "interviewer",
          content: "你好，我是本次模拟面试官。",
          phase: "GREETING",
          questionId: null,
          audioUrl: null,
          seq: 1,
          createdAt: "2026-07-24T01:00:00Z",
        },
        {
          role: "interviewer",
          content: "请先介绍一下自己。",
          phase: "SELF_INTRO",
          questionId: 11,
          audioUrl: null,
          seq: 2,
          createdAt: "2026-07-24T01:00:01Z",
        },
        {
          role: "candidate",
          content: "我是小明。",
          phase: "SELF_INTRO",
          questionId: 11,
          audioUrl: null,
          seq: 3,
          createdAt: "2026-07-24T01:00:02Z",
        },
        {
          role: "interviewer",
          content: "请介绍一个代表项目。",
          phase: "RESUME_DEEP_DIVE",
          questionId: 12,
          audioUrl: null,
          seq: 4,
          createdAt: "2026-07-24T01:00:03Z",
        },
        {
          role: "candidate",
          content: "我负责了 MiraPrep。",
          phase: "RESUME_DEEP_DIVE",
          questionId: 12,
          audioUrl: null,
          seq: 5,
          createdAt: "2026-07-24T01:00:04Z",
        },
      ],
    });

    const user = userEvent.setup();
    render(<InterviewClient sessionId="42" />);
    await screen.findByText("请介绍一个代表项目。");
    await user.click(screen.getByRole("button", { name: /回看/ }));

    const firstQuestion = screen.getByTestId("review-question-1");
    const secondQuestion = screen.getByTestId("review-question-2");
    expect(firstQuestion).toHaveTextContent("问题 1");
    expect(firstQuestion).toHaveTextContent("请先介绍一下自己。");
    expect(firstQuestion).toHaveTextContent("我是小明。");
    expect(secondQuestion).toHaveTextContent("问题 2");
    expect(secondQuestion).toHaveTextContent("请介绍一个代表项目。");
    expect(secondQuestion).toHaveTextContent("我负责了 MiraPrep。");
    expect(screen.queryByText("你好，我是本次模拟面试官。")).not.toBeInTheDocument();
    expect(screen.queryByText("你的回答")).not.toBeInTheDocument();
  });

  it("retains an unconfirmed answer when submission fails", async () => {
    submitInterviewAnswer.mockRejectedValueOnce(new Error("network down"));
    const user = userEvent.setup();
    render(<InterviewClient sessionId="42" />);
    await screen.findByText("请先介绍一下自己。");

    const textarea = screen.getByRole("textbox", { name: "你的回答" });
    await user.type(textarea, "不要丢掉我");
    await user.click(screen.getByRole("button", { name: "提交回答" }));

    expect(await screen.findByText("回答发送失败，请检查网络后重试。")).toBeInTheDocument();
    expect(textarea).toHaveValue("不要丢掉我");
  });

  it("keeps long interview content inside a top-reachable scroll flow", async () => {
    render(<InterviewClient sessionId="42" />);
    await screen.findByText("请先介绍一下自己。");

    const stage = screen.getByRole("region", { name: "当前面试交流" });
    const flow = screen.getByTestId("interview-stage-flow");

    expect(stage).toHaveClass("overflow-y-auto");
    expect(flow).toHaveClass("shrink-0");
    expect(flow.className).not.toContain("-translate-y");
  });

  it("keeps the closing words visible before routing after interview_end", async () => {
    render(<InterviewClient sessionId="42" />);
    await waitFor(() => expect(emit).toBeTypeOf("function"));
    vi.useFakeTimers();

    const event = new Event("beforeunload", { cancelable: true });
    fireEvent(window, event);
    expect(event.defaultPrevented).toBe(true);

    act(() => {
      emit?.({
        type: "token",
        payload: {
          text: "感谢你的参与，祝你接下来的面试顺利，再见！",
          phase: "CLOSING",
          questionId: 99,
        },
        seq: 5,
      });
      emit?.({
        type: "interview_end",
        payload: { reason: "completed" },
        seq: 6,
      });
    });

    expect(
      screen.getByText("感谢你的参与，祝你接下来的面试顺利，再见！"),
    ).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_999);
    });
    expect(push).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(push).toHaveBeenCalledWith("/interview/42/result", {
      transitionTypes: ["nav-reveal"],
    });
  });

  it("exposes a headless runtime without rendering the formal interview shell", async () => {
    const onEnded = vi.fn();
    render(
      <InterviewClient
        sessionId="42"
        onEnded={onEnded}
        practice={{
          question: practiceQuestion,
          target: { targetType: "MAIN_QUESTION" },
          targetPrompt: practiceQuestion.text,
          onRequestClose: vi.fn(),
        }}
      />,
    );
    await waitFor(() => expect(emit).toBeTypeOf("function"));

    expect(screen.getByTestId("headless-runtime")).toBeInTheDocument();
    expect(screen.queryByTestId("interview-shell")).not.toBeInTheDocument();

    act(() => {
      emit?.({
        type: "interview_end",
        payload: { reason: "practice_completed" },
        seq: 5,
      });
    });
    expect(onEnded).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
  });

  it("replays only the latest question audio from the headless runtime", async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn() },
    });
    Object.defineProperty(globalThis, "AudioContext", {
      configurable: true,
      value: class {
        resume = vi.fn().mockResolvedValue(undefined);
        close = vi.fn().mockResolvedValue(undefined);
      },
    });

    render(
      <InterviewClient
        sessionId="42"
        onEnded={vi.fn()}
        practice={{
          question: practiceQuestion,
          target: { targetType: "MAIN_QUESTION" },
          targetPrompt: practiceQuestion.text,
          onRequestClose: vi.fn(),
        }}
      />,
    );
    await user.click(screen.getByRole("button", { name: "开启测试语音" }));
    await waitFor(() => expect(streamVoiceInterview).toHaveBeenCalled());

    act(() => {
      emitVoice?.({
        type: "audio",
        payload: {
          chunk: "AAA=",
          format: "pcm16/24k",
          forQuestionId: 11,
          frameIndex: 1,
          isFinal: false,
        },
        seq: 8,
      });
      emitVoice?.({
        type: "audio",
        payload: {
          chunk: "",
          format: "pcm16/24k",
          forQuestionId: 11,
          isFinal: true,
        },
        seq: 9,
      });
      emitVoice?.({
        type: "audio",
        payload: {
          chunk: "BBB=",
          format: "pcm16/24k",
          forQuestionId: 12,
          frameIndex: 1,
          isFinal: false,
        },
        seq: 10,
      });
      emitVoice?.({
        type: "audio",
        payload: {
          chunk: "",
          format: "pcm16/24k",
          forQuestionId: 12,
          isFinal: true,
        },
        seq: 11,
      });
    });

    enqueueAudio.mockClear();
    await user.click(screen.getByRole("button", { name: "重播测试题目" }));

    expect(enqueueAudio).toHaveBeenCalledTimes(1);
    expect(enqueueAudio).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ forQuestionId: 12 }),
      }),
    );
  });

  it("requires confirmation before manually ending the runtime", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup();
    render(<InterviewClient sessionId="42" />);
    await screen.findByText("请先介绍一下自己。");

    await user.click(screen.getByRole("button", { name: "结束面试" }));
    expect(screen.getByRole("heading", { name: "确认结束面试？" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "确认结束" }));

    await waitFor(() =>
      expect(endInterviewRuntime).toHaveBeenCalledWith(
        42,
        "runtime-token",
        expect.any(AbortSignal),
      ),
    );
    expect(push).not.toHaveBeenCalled();

    act(() => {
      emit?.({
        type: "token",
        payload: {
          text: "感谢你的参与，评估结果稍后会生成。",
          phase: "CLOSING",
          questionId: 99,
        },
        seq: 5,
      });
      emit?.({
        type: "interview_end",
        payload: { reason: "manual" },
        seq: 6,
      });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_000);
    });
    expect(push).toHaveBeenCalledWith("/interview/42/result", {
      transitionTypes: ["nav-reveal"],
    });
  });

  it("stops after bounded reconnect attempts and offers a manual retry", async () => {
    vi.useFakeTimers();
    streamInterview.mockRejectedValue(new Error("offline"));
    render(<InterviewClient sessionId="42" />);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(streamInterview).toHaveBeenCalledTimes(5);
    expect(
      screen.getByRole("button", { name: "重新连接" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("status", { name: "连接状态：连接断开" }),
    ).toHaveAttribute("data-tone", "critical");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(streamInterview).toHaveBeenCalledTimes(5);
  });

  it("lazily switches to WebSocket voice input, preserves the draft, and confirms edited ASR", async () => {
    const user = userEvent.setup();
    stubMicrophoneCapture();

    render(<InterviewClient sessionId="42" />);
    await screen.findByText("请先介绍一下自己。");
    const editor = screen.getByRole("textbox", { name: "你的回答" });
    await user.type(editor, "已有草稿");
    await user.click(screen.getByRole("button", { name: "语音输入" }));
    await waitFor(() => expect(streamVoiceInterview).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: "停止并转写" }));
    expect(screen.queryByRole("button", { name: "语音回答" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "打字回答" })).not.toBeInTheDocument();
    expect(editor).toHaveValue("已有草稿");

    act(() => {
      emitVoice?.({
        type: "asr_partial",
        payload: { text: "我负责核心模块", isFinal: true, acceptedAudioSeq: 3 },
        seq: 8,
      });
    });

    expect(editor).toHaveValue("已有草稿 我负责核心模块");
    await user.clear(editor);
    await user.type(editor, "我负责了核心模块");

    await user.click(screen.getByRole("button", { name: "语音输入" }));
    act(() => {
      emitVoice?.({
        type: "asr_partial",
        payload: { text: "并补充了上线结果", isFinal: false, acceptedAudioSeq: 4 },
        seq: 9,
      });
    });
    expect(editor).toHaveValue("我负责了核心模块 并补充了上线结果");

    act(() => {
      emitVoice?.({
        type: "error",
        payload: {
          code: "audio_sequence_gap",
          message: "expected audioSeq 93",
          expectedAudioSeq: 93,
        },
        seq: 10,
      } as unknown as VoiceInterviewEvent);
    });
    expect(screen.queryByText("expected audioSeq 93")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "停止并转写" }));

    await user.click(screen.getByRole("button", { name: "提交回答" }));

    expect(voiceSocket.confirmTranscript).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "我负责了核心模块 并补充了上线结果",
        questionId: 11,
      }),
    );
    expect(submitInterviewAnswer).not.toHaveBeenCalled();
  });

  it("returns to the idle microphone action immediately after recording stops", async () => {
    const user = userEvent.setup();
    stubMicrophoneCapture();
    render(<InterviewClient sessionId="42" />);
    await screen.findByText("请先介绍一下自己。");

    await user.click(screen.getByRole("button", { name: "语音输入" }));
    await waitFor(() => expect(streamVoiceInterview).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: "停止并转写" }));

    expect(screen.queryByText("正在完成转写…")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "语音输入" })).toBeEnabled();
  });

  it("silently applies a recoverable audio cursor correction", async () => {
    const user = userEvent.setup();
    stubMicrophoneCapture();
    render(<InterviewClient sessionId="42" />);
    await screen.findByText("请先介绍一下自己。");
    await user.click(screen.getByRole("button", { name: "语音输入" }));
    await waitFor(() => expect(streamVoiceInterview).toHaveBeenCalled());

    act(() => {
      emitVoice?.({
        type: "error",
        payload: {
          code: "audio_sequence_gap",
          message: "expected audioSeq 93",
          expectedAudioSeq: 93,
        },
        seq: 8,
      } as unknown as VoiceInterviewEvent);
    });

    expect(screen.queryByText("expected audioSeq 93")).not.toBeInTheDocument();
  });

  it("enters voice mode when the setup wizard asked for a voice interview", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn() },
    });
    Object.defineProperty(globalThis, "AudioContext", {
      configurable: true,
      value: class {
        resume = vi.fn().mockResolvedValue(undefined);
        close = vi.fn().mockResolvedValue(undefined);
      },
    });
    storeInterviewVoicePreference(42, true);

    render(<InterviewClient sessionId="42" />);
    await screen.findByText("请先介绍一下自己。");

    await waitFor(() => expect(streamVoiceInterview).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "语音回答" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "打字回答" })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "你的回答" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "语音输入" })).toBeInTheDocument();
    expect(streamInterview).not.toHaveBeenCalled();
  });

  it("preserves the typed draft when a requested voice link is refused", async () => {
    const user = userEvent.setup();
    stubMicrophoneCapture();
    streamVoiceInterview.mockRejectedValue(
      new VoiceSocketCloseError("speech provider is not configured", 1013, false),
    );

    render(<InterviewClient sessionId="42" />);
    await screen.findByText("请先介绍一下自己。");
    const editor = screen.getByRole("textbox", { name: "你的回答" });
    await user.type(editor, "不能丢失的文字草稿");
    await user.click(screen.getByRole("button", { name: "语音输入" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("语音服务尚未配置");
    expect(editor).toHaveValue("不能丢失的文字草稿");
    expect(editor).toBeEnabled();
    // 偏好留着的话，刷新后又会被推回同一个连不上的语音链路。
    expect(getInterviewVoicePreference(42)).toBe(false);
  });

  it("syncs the interviewer breathing state with TTS playback", async () => {
    let finishPlayback: (() => void) | undefined;
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn() },
    });
    Object.defineProperty(globalThis, "AudioContext", {
      configurable: true,
      value: class {
        destination = {};
        resume = vi.fn().mockResolvedValue(undefined);
        close = vi.fn().mockResolvedValue(undefined);
        createBuffer = vi.fn(() => ({ getChannelData: () => new Float32Array(1) }));
        createBufferSource = vi.fn(() => ({
          connect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
          set onended(callback: () => void) {
            finishPlayback = callback;
          },
        }));
      },
    });
    storeInterviewVoicePreference(42, true);

    render(<InterviewClient sessionId="42" />);
    await screen.findByText("请先介绍一下自己。");
    await waitFor(() => expect(streamVoiceInterview).toHaveBeenCalled());

    act(() => {
      emitVoice?.({
        type: "audio",
        payload: {
          chunk: "AAA=",
          format: "pcm16/24k",
          forQuestionId: 11,
          forMessageSeq: 7,
          frameIndex: 1,
          isFinal: false,
          latencyMs: 20,
        },
        seq: 8,
      });
    });

    await waitFor(() =>
      expect(screen.getByTestId("interviewer-presence")).toHaveAttribute(
        "data-speaking",
        "true",
      ),
    );
    act(() => finishPlayback?.());
    await waitFor(() =>
      expect(screen.getByTestId("interviewer-presence")).toHaveAttribute(
        "data-speaking",
        "false",
      ),
    );
  });
});
