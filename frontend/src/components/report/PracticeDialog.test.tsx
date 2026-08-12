import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReportQuestion } from "@/lib/api/report";
import PracticeDialog from "./PracticeDialog";

const { endInterviewRuntime } = vi.hoisted(() => ({
  endInterviewRuntime: vi.fn(() => Promise.resolve({ accepted: true })),
}));

vi.mock("@/lib/api/interview-stream", () => ({ endInterviewRuntime }));

vi.mock("./PracticeRuntimeCard", () => ({
  default: ({
    sessionId,
    onEnded,
    onRequestClose,
  }: {
    sessionId: string;
    onEnded: () => void;
    onRequestClose: () => void;
  }) => (
    <div data-testid="dedicated-answer-card" data-session={sessionId}>
      <h2>重新回答这道题</h2>
      <button type="button" onClick={onEnded}>
        模拟完成作答
      </button>
      <button type="button" onClick={onRequestClose}>
        请求关闭练习
      </button>
    </div>
  ),
}));

const question: ReportQuestion = {
  questionId: 34,
  order: 1,
  phase: "DOMAIN_ASSESSMENT",
  text: "如何定位一次线上性能问题？",
  focusPoints: ["分析路径"],
  answer: "旧回答",
  score: 68,
  thinkSeconds: 10,
  answerSeconds: 60,
  suggestedSeconds: 120,
  referenceAnswer: "参考",
  suggestions: ["补充数据"],
  followUpChain: [],
  audioUrl: null,
};

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {children}
    </QueryClientProvider>
  );
}

describe("PracticeDialog", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    endInterviewRuntime.mockClear();
  });

  it("uses a dedicated answer card instead of embedding the formal interview shell", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/interviews/56/practice-result")) {
        return new Response(
          JSON.stringify({
            code: 0,
            message: "ok",
            data: {
              status: "ready",
              question: question.text,
              source: {
                answer: "旧回答",
                score: 68,
                referenceAnswer: "旧参考",
                suggestions: ["补充数据"],
              },
              current: {
                answer: "新回答更具体",
                score: 82,
                referenceAnswer: "新参考",
                suggestions: ["保持量化表达"],
              },
              comparison: {
                improvements: ["补充了状态流转和多 Agent 协作机制"],
                remainingGaps: ["还缺少量化运行结果"],
                scoreRationale: "关键设计更完整，因此由 68 分提升至 82 分。",
              },
              scoreDelta: 14,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      throw new Error(`unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const onOpenChange = vi.fn();
    const user = userEvent.setup();

    render(
      <PracticeDialog
        open
        onOpenChange={onOpenChange}
        question={question}
        target={{ targetType: "MAIN_QUESTION" }}
        created={{ practiceSessionId: 56, runtimeToken: "practice-runtime-token" }}
        createError={null}
        onRetry={vi.fn()}
      />,
      { wrapper },
    );

    expect(screen.queryByTestId("interview-shell")).not.toBeInTheDocument();
    expect(screen.getByTestId("dedicated-answer-card")).toHaveAttribute(
      "data-session",
      "56",
    );
    expect(
      screen.getByRole("heading", { name: "重新回答这道题" }),
    ).toBeVisible();

    await user.click(screen.getByRole("button", { name: "模拟完成作答" }));

    expect(await screen.findAllByText("本次回答")).toHaveLength(2);
    expect(screen.getByText("旧回答")).toBeInTheDocument();
    expect(screen.getByText("新回答更具体")).toBeInTheDocument();
    expect(screen.getByText("+14 分")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "为什么是这个评分" }),
    ).toBeVisible();
    expect(
      screen.getByText("补充了状态流转和多 Agent 协作机制"),
    ).toBeVisible();
    expect(screen.getByText("还缺少量化运行结果")).toBeVisible();
    expect(
      screen.getByText("关键设计更完整，因此由 68 分提升至 82 分。"),
    ).toBeVisible();
    const scoreDetailStack = screen
      .getByText("这次做得更好")
      .closest("div.rounded-xl")?.parentElement;
    expect(scoreDetailStack).toHaveClass("grid-cols-1");
    expect(scoreDetailStack).not.toHaveClass("sm:grid-cols-2");
    const answerStack = screen
      .getByRole("heading", { name: "上次回答" })
      .closest("section")?.parentElement;
    expect(answerStack).toHaveClass("grid-cols-1");
    expect(answerStack).not.toHaveClass("md:grid-cols-2");
    const currentAnswerHeading = screen
      .getAllByRole("heading", { name: "本次回答" })
      .find((heading) => heading.tagName === "H3");
    const previousAnswerHeading = screen.getByRole("heading", {
      name: "上次回答",
    });
    const rationaleHeading = screen.getByRole("heading", {
      name: "为什么是这个评分",
    });
    expect(
      currentAnswerHeading?.compareDocumentPosition(previousAnswerHeading),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(
      previousAnswerHeading.compareDocumentPosition(rationaleHeading),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(screen.getByRole("dialog")).toHaveClass(
      "[scrollbar-width:none]",
      "[&::-webkit-scrollbar]:hidden",
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });

  it("confirms before closing an active practice", async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();

    render(
      <PracticeDialog
        open
        onOpenChange={onOpenChange}
        question={question}
        target={{ targetType: "MAIN_QUESTION" }}
        created={{ practiceSessionId: 56, runtimeToken: "practice-runtime-token" }}
        createError={null}
        onRetry={vi.fn()}
      />,
      { wrapper },
    );

    await user.click(screen.getByRole("button", { name: "请求关闭练习" }));
    expect(
      screen.getByRole("heading", { name: "退出本次练习？" }),
    ).toBeVisible();
    expect(onOpenChange).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "继续作答" }));
    expect(
      screen.queryByRole("heading", { name: "退出本次练习？" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "请求关闭练习" }));
    await user.click(screen.getByRole("button", { name: "退出练习" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(endInterviewRuntime).toHaveBeenCalledWith(56, "practice-runtime-token");
  });

  it("lets the user close while practice creation is still pending", async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();

    render(
      <PracticeDialog
        open
        onOpenChange={onOpenChange}
        question={question}
        target={{ targetType: "MAIN_QUESTION" }}
        created={null}
        createError={null}
        onRetry={vi.fn()}
      />,
      { wrapper },
    );

    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
