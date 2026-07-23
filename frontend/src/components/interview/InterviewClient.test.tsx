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
    expect(screen.getAllByText("项目深挖").length).toBeGreaterThan(0);
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
    expect(textarea).toHaveValue("");
    expect(textarea).toBeDisabled();
    expect(screen.getByRole("button", { name: "提交回答" })).toBeDisabled();
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
