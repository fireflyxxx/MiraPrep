import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import InterviewClient from "./InterviewClient";
import type { InterviewStreamEvent } from "@/lib/api/interview-stream";

const push = vi.fn();
const router = { push };
const getInterviewMessages = vi.fn();
const submitInterviewAnswer = vi.fn();
const endInterviewRuntime = vi.fn();
const streamInterview = vi.fn();
const getInterviewRuntimeToken = vi.fn(() => "runtime-token");
const getInterviewEventCursor = vi.fn(() => 0);
let emit: ((event: InterviewStreamEvent) => void) | undefined;

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
      signal: AbortSignal;
    }) => {
      emit = options.onEvent;
      return streamInterview(options);
    },
  };
});

describe("InterviewClient runtime", () => {
  afterEach(() => {
    vi.useRealTimers();
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
  });

  it("does not read browser storage while rendering the SSR HTML", () => {
    renderToString(<InterviewClient sessionId="42" />);

    expect(getInterviewRuntimeToken).not.toHaveBeenCalled();
    expect(getInterviewEventCursor).not.toHaveBeenCalled();
  });

  it("restores persisted history before subscribing from the saved SSE cursor", async () => {
    render(<InterviewClient sessionId="42" />);

    expect(await screen.findByText("请先介绍一下自己。")).toBeInTheDocument();
    expect(screen.getByText("我是小明。")).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "当前面试交流" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("floating-answer-composer")).toHaveClass(
      "absolute",
      "bottom-0",
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

    const textarea = screen.getByPlaceholderText("输入你的回答，Shift + Enter 换行");
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

    const textarea = screen.getByPlaceholderText("输入你的回答，Shift + Enter 换行");
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

    const textarea = screen.getByPlaceholderText("输入你的回答，Shift + Enter 换行");
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

  it("warns on unload and routes after an interview_end event", async () => {
    render(<InterviewClient sessionId="42" />);
    await waitFor(() => expect(emit).toBeTypeOf("function"));

    const event = new Event("beforeunload", { cancelable: true });
    fireEvent(window, event);
    expect(event.defaultPrevented).toBe(true);

    act(() => {
      emit?.({
        type: "interview_end",
        payload: { reason: "completed" },
        seq: 5,
      });
    });
    expect(push).toHaveBeenCalledWith("/interview/42/result", {
      transitionTypes: ["nav-reveal"],
    });
  });

  it("requires confirmation before manually ending the runtime", async () => {
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
    expect(push).toHaveBeenCalledWith("/interview/42/result", {
      transitionTypes: ["nav-reveal"],
    });
  });

  it("stops after bounded reconnect attempts and offers a manual retry", async () => {
    vi.useFakeTimers();
    streamInterview.mockRejectedValue(new Error("offline"));
    render(<InterviewClient sessionId="42" />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(streamInterview).toHaveBeenCalledTimes(5);
    expect(
      screen.getByRole("button", { name: "重新连接" }),
    ).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(streamInterview).toHaveBeenCalledTimes(5);
  });
});
