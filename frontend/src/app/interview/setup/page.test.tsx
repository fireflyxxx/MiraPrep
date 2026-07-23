import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import InterviewSetupPage from "./page";
import {
  createInterview,
  pollInterviewUntilSettled,
  type InterviewStatusResponse,
} from "@/lib/api/interview";
import { ApiError } from "@/lib/api/types";

const push = vi.fn();

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

async function reachFinalStep(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "下一步 →" }));
  await user.click(screen.getByRole("button", { name: "下一步 →" }));
}

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));
vi.mock("@/components/AuthGuard", () => ({
  default: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/components/Logo", () => ({ default: () => <span>Logo</span> }));
vi.mock("@/components/ThemeToggle", () => ({ ThemeToggle: () => <button>主题</button> }));
vi.mock("@/components/resume/ResumeUpload", () => ({
  default: () => <div>上传简历</div>,
}));
vi.mock("@/components/resume/ResumeList", () => ({
  default: () => <div>已选择 resume.pdf</div>,
}));
vi.mock("@/lib/api/resume", () => ({
  selectInitialResumeId: () => 7,
  useResumeLibrary: () => ({
    data: {
      items: [
        {
          id: 7,
          fileName: "resume.pdf",
          fileSize: 1024,
          pageCount: 1,
          parseStatus: "success",
          isDefault: true,
          createdAt: "2026-07-17T00:00:00Z",
        },
      ],
      total: 1,
      page: 1,
      size: 20,
    },
  }),
}));
vi.mock("@/lib/api/interview", () => ({
  createInterview: vi.fn(),
  pollInterviewUntilSettled: vi.fn(),
}));

describe("InterviewSetupPage", () => {
  beforeEach(() => {
    push.mockReset();
    vi.mocked(createInterview).mockReset();
    vi.mocked(pollInterviewUntilSettled).mockReset();
  });

  it("keeps the voice switch thumb inside its track", async () => {
    const user = userEvent.setup();
    render(<InterviewSetupPage />);

    await reachFinalStep(user);
    const toggle = screen.getByRole("switch");
    const thumb = toggle.querySelector("span");

    expect(thumb).toHaveClass("left-1", "translate-x-0");
    await user.click(toggle);
    expect(thumb).toHaveClass("left-1", "translate-x-5");
    expect(thumb).not.toHaveClass("translate-x-6");
  });

  it("submits every T-032 field and enters the real session after the outline is ready", async () => {
    vi.mocked(createInterview).mockResolvedValue({
      sessionId: 42,
      outlineStatus: "pending",
    });
    vi.mocked(pollInterviewUntilSettled).mockResolvedValue({
      sessionId: 42,
      status: "created",
      outlineStatus: "ready",
      questionCount: 8,
    });
    const user = userEvent.setup();
    render(<InterviewSetupPage />);

    await user.click(screen.getByRole("button", { name: "下一步 →" }));
    await user.type(screen.getByLabelText("目标岗位名称（选填）"), "可视化前端工程师");
    await user.type(screen.getByLabelText("粘贴目标 JD（选填）"), "负责 React 性能优化");
    await user.click(screen.getByRole("button", { name: "HR 面试" }));
    await user.click(screen.getByRole("button", { name: "下一步 →" }));
    await user.click(screen.getByRole("button", { name: "温和引导" }));
    await user.click(screen.getByRole("switch", { name: "启用语音面试" }));
    await user.type(screen.getByLabelText("给面试官的备注"), "多问系统设计");
    await user.click(screen.getByRole("button", { name: "开始面试 →" }));

    await waitFor(() =>
      expect(createInterview).toHaveBeenCalledWith({
        resumeId: 7,
        jobDirection: "frontend",
        jobTitle: "可视化前端工程师",
        jdText: "负责 React 性能优化",
        difficulty: "medium",
        types: ["technical", "hr"],
        durationMin: 30,
        customRequirements: expect.stringContaining("多问系统设计"),
        interviewerStyle: "friendly",
        voiceEnabled: true,
      }),
    );
    expect(await screen.findByText("面试官正在阅读你的简历…")).toBeInTheDocument();
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/interview/42", {
        transitionTypes: ["nav-forward"],
      }),
    );
  });

  it("shows a retry and return choice when outline generation fails", async () => {
    vi.mocked(createInterview)
      .mockResolvedValueOnce({ sessionId: 43, outlineStatus: "pending" })
      .mockResolvedValueOnce({ sessionId: 44, outlineStatus: "pending" });
    vi.mocked(pollInterviewUntilSettled)
      .mockResolvedValueOnce({
        sessionId: 43,
        status: "created",
        outlineStatus: "failed",
        questionCount: 0,
      })
      .mockResolvedValueOnce({
        sessionId: 44,
        status: "created",
        outlineStatus: "ready",
        questionCount: 8,
      });
    const user = userEvent.setup();
    render(<InterviewSetupPage />);

    await reachFinalStep(user);
    await user.click(screen.getByRole("button", { name: "开始面试 →" }));

    expect(await screen.findByText("面试大纲生成失败")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "重新生成" }));

    await waitFor(() => expect(createInterview).toHaveBeenCalledTimes(2));
    expect(pollInterviewUntilSettled).toHaveBeenLastCalledWith(
      44,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/interview/44", {
        transitionTypes: ["nav-forward"],
      }),
    );
  });

  it("sends the selected difficulty and duration as the wire values the backend accepts", async () => {
    vi.mocked(createInterview).mockResolvedValue({
      sessionId: 44,
      outlineStatus: "pending",
    });
    vi.mocked(pollInterviewUntilSettled).mockResolvedValue({
      sessionId: 44,
      status: "created",
      outlineStatus: "ready",
      questionCount: 8,
    });
    const user = userEvent.setup();
    render(<InterviewSetupPage />);

    await user.click(screen.getByRole("button", { name: "下一步 →" }));
    await user.click(screen.getByRole("button", { name: /高级/ }));
    await user.click(screen.getByRole("button", { name: "45 分钟" }));
    await user.click(screen.getByRole("button", { name: "下一步 →" }));
    await user.click(screen.getByRole("button", { name: "开始面试 →" }));

    await waitFor(() =>
      expect(createInterview).toHaveBeenCalledWith(
        expect.objectContaining({ difficulty: "hard", durationMin: 45 }),
      ),
    );
  });

  it("continues polling the same session after a timeout instead of creating a duplicate", async () => {
    vi.mocked(createInterview).mockResolvedValue({
      sessionId: 45,
      outlineStatus: "pending",
    });
    vi.mocked(pollInterviewUntilSettled)
      .mockResolvedValueOnce({
        sessionId: 45,
        status: "created",
        outlineStatus: "pending",
        questionCount: 0,
      })
      .mockResolvedValueOnce({
        sessionId: 45,
        status: "created",
        outlineStatus: "ready",
        questionCount: 8,
      });
    const user = userEvent.setup();
    render(<InterviewSetupPage />);

    await reachFinalStep(user);
    await user.click(screen.getByRole("button", { name: "开始面试 →" }));

    expect(await screen.findByText("面试准备超时")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "继续等待" }));

    await waitFor(() => expect(pollInterviewUntilSettled).toHaveBeenCalledTimes(2));
    expect(createInterview).toHaveBeenCalledTimes(1);
    expect(pollInterviewUntilSettled).toHaveBeenLastCalledWith(
      45,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("does not navigate when the page unmounts before polling returns ready", async () => {
    const pendingPoll = deferred<InterviewStatusResponse>();
    vi.mocked(createInterview).mockResolvedValue({
      sessionId: 46,
      outlineStatus: "pending",
    });
    vi.mocked(pollInterviewUntilSettled).mockReturnValue(pendingPoll.promise);
    const user = userEvent.setup();
    const view = render(<InterviewSetupPage />);

    await reachFinalStep(user);
    await user.click(screen.getByRole("button", { name: "开始面试 →" }));
    await waitFor(() => expect(pollInterviewUntilSettled).toHaveBeenCalled());
    view.unmount();

    await act(async () => {
      pendingPoll.resolve({
        sessionId: 46,
        status: "created",
        outlineStatus: "ready",
        questionCount: 8,
      });
      await pendingPoll.promise;
    });

    expect(push).not.toHaveBeenCalled();
  });

  it("labels a missing-resume create error correctly and does not offer a futile retry", async () => {
    vi.mocked(createInterview).mockRejectedValue(
      new ApiError(40400, "resume not found", 404),
    );
    const user = userEvent.setup();
    render(<InterviewSetupPage />);

    await reachFinalStep(user);
    await user.click(screen.getByRole("button", { name: "开始面试 →" }));

    expect(await screen.findByText("无法创建面试")).toBeInTheDocument();
    expect(screen.getByText("请返回配置并重新选择简历。")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "重试" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "返回配置" })).toBeInTheDocument();
  });
});
