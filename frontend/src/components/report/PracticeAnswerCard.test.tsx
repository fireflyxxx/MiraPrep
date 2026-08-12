import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReportQuestion } from "@/lib/api/report";
import PracticeAnswerCard from "./PracticeAnswerCard";

const submitAnswer = vi.fn(async () => {});

function TestHarness({
  followUp = false,
}: {
  followUp?: boolean;
} = {}) {
  const [answerText, setAnswerText] = useState("");
  return (
    <PracticeAnswerCard
      question={question}
      target={
        followUp
          ? { targetType: "FOLLOW_UP", followUpIndex: 0 }
          : { targetType: "MAIN_QUESTION" }
      }
      activeQuestionText={followUp ? "请补充故障定位的第一步。" : question.text}
      onRequestClose={vi.fn()}
      answerText={answerText}
      asrFinal={false}
      canReplayQuestionAudio
      connection="connected"
      errorMessage={null}
      interviewerSpeaking={false}
      isEnded={false}
      isLoading={false}
      isRecording={false}
      isSubmitting={false}
      isThinking={false}
      isVoiceConnecting={false}
      voiceMode={false}
      voiceNotice={null}
      disableVoiceMode={vi.fn()}
      enableVoiceMode={vi.fn()}
      finishAudio={vi.fn()}
      handleRecorderError={vi.fn()}
      handleRecordingChange={vi.fn()}
      handleSilence={vi.fn()}
      handleTtsSpeakingChange={vi.fn()}
      onBeforeVoiceStart={vi.fn().mockResolvedValue(true)}
      onVoiceLevelChange={vi.fn()}
      replayQuestionAudio={vi.fn()}
      recorderRef={null}
      retryConnection={vi.fn()}
      sendAudioFrame={vi.fn()}
      setAnswerText={setAnswerText}
      setTtsPlayerHandle={vi.fn()}
      submitAnswer={submitAnswer}
      voiceLevel={0}
    />
  );
}

vi.mock("@/components/interview/TTSPlayer", () => ({
  default: () => <div data-testid="practice-tts-player" />,
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

describe("PracticeAnswerCard", () => {
  beforeEach(() => submitAnswer.mockClear());

  it("renders a focused single-question surface without formal interview chrome", () => {
    render(<TestHarness />);

    expect(screen.getByRole("heading", { name: "重练主问题" })).toBeVisible();
    expect(screen.getByText(question.text)).toBeVisible();
    expect(screen.getByText("会根据回答继续追问，最多 3 次")).toBeVisible();
    expect(screen.queryByText(/只提交一次/)).not.toBeInTheDocument();
    expect(screen.queryByTestId("interview-shell")).not.toBeInTheDocument();
    expect(screen.queryByText("Mira 面试官")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("面试总用时")).not.toBeInTheDocument();
    expect(screen.getByTestId("practice-question-layout")).toHaveClass(
      "flex-col",
      "sm:flex-row",
    );
  });

  it("uses one formal-style editor with an inline voice action and submits once", async () => {
    const user = userEvent.setup();
    render(<TestHarness />);

    const answer = screen.getByRole("textbox", { name: "本次回答" });
    const submit = screen.getByRole("button", { name: "提交本次回答" });
    expect(submit).toBeDisabled();
    expect(screen.getByTestId("unified-answer-composer")).toBeVisible();
    expect(screen.getByRole("button", { name: "语音输入" })).toBeVisible();
    expect(screen.queryByRole("group", { name: "回答方式" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("practice-voice-controls")).not.toBeInTheDocument();

    await user.type(answer, "新的回答");
    expect(answer).toHaveValue("新的回答");

    await user.click(submit);
    expect(submitAnswer).toHaveBeenCalledTimes(1);
  });

  it("labels a historical follow-up as one-answer practice", () => {
    render(<TestHarness followUp />);

    expect(screen.getByRole("heading", { name: "重练此追问" })).toBeVisible();
    expect(screen.getByText("请补充故障定位的第一步。")).toBeVisible();
    expect(screen.getByText("回答后直接生成对比反馈")).toBeVisible();
  });
});
