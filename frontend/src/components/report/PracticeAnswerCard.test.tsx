import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReportQuestion } from "@/lib/api/report";
import PracticeAnswerCard from "./PracticeAnswerCard";

const submitAnswer = vi.fn(async () => {});

function TestHarness() {
  const [answerText, setAnswerText] = useState("");
  const [voiceMode, setVoiceMode] = useState(false);
  return (
    <PracticeAnswerCard
      question={question}
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
      voiceMode={voiceMode}
      voiceNotice={
        voiceMode ? "语音模式已开启，按下麦克风后开始回答。" : null
      }
      disableVoiceMode={() => setVoiceMode(false)}
      enableVoiceMode={() => setVoiceMode(true)}
      finishAudio={vi.fn()}
      handleRecorderError={vi.fn()}
      handleRecordingChange={vi.fn()}
      handleSilence={vi.fn()}
      handleTtsSpeakingChange={vi.fn()}
      replayQuestionAudio={vi.fn()}
      retryConnection={vi.fn()}
      sendAudioFrame={vi.fn()}
      setAnswerText={setAnswerText}
      setTtsPlayerHandle={vi.fn()}
      submitAnswer={submitAnswer}
    />
  );
}

vi.mock("@/components/interview/VoiceRecorder", () => ({
  default: () => <div data-testid="practice-voice-recorder">录音控制</div>,
}));

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

    expect(screen.getByRole("heading", { name: "重新回答这道题" })).toBeVisible();
    expect(screen.getByText(question.text)).toBeVisible();
    expect(screen.getByText("不会追问")).toBeVisible();
    expect(screen.queryByText(/只提交一次/)).not.toBeInTheDocument();
    expect(screen.queryByTestId("interview-shell")).not.toBeInTheDocument();
    expect(screen.queryByText("Mira 面试官")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("面试总用时")).not.toBeInTheDocument();
    expect(screen.getByTestId("practice-question-layout")).toHaveClass(
      "flex-col",
      "sm:flex-row",
    );
  });

  it("keeps the answer while switching modes and submits it once", async () => {
    const user = userEvent.setup();
    render(<TestHarness />);

    const answer = screen.getByRole("textbox", { name: "本次回答" });
    const submit = screen.getByRole("button", { name: "提交本次回答" });
    expect(submit).toBeDisabled();

    await user.type(answer, "新的回答");
    await user.click(screen.getByRole("button", { name: "语音回答" }));
    expect(screen.getByTestId("practice-voice-recorder")).toBeVisible();
    expect(answer).toHaveValue("新的回答");
    await user.click(screen.getByRole("button", { name: "文字回答" }));
    expect(answer).toHaveValue("新的回答");

    await user.click(submit);
    expect(submitAnswer).toHaveBeenCalledTimes(1);
  });
});
