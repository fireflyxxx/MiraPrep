import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import UnifiedAnswerComposer, {
  type UnifiedAnswerComposerProps,
} from "./UnifiedAnswerComposer";

function baseProps(
  overrides: Partial<UnifiedAnswerComposerProps> = {},
): UnifiedAnswerComposerProps {
  return {
    answerLocked: false,
    answerText: "",
    asrFinal: false,
    isRecording: false,
    isSubmitting: false,
    isVoiceConnecting: false,
    onAnswerChange: vi.fn(),
    onAudioFrame: vi.fn(),
    onBeforeVoiceStart: vi.fn().mockResolvedValue(true),
    onRecorderError: vi.fn(),
    onRecordingChange: vi.fn(),
    onSilence: vi.fn(),
    onSubmit: vi.fn(),
    onVoiceLevelChange: vi.fn(),
    submitDisabled: false,
    voiceLevel: 0,
    ...overrides,
  };
}

function stubCapturePipeline() {
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

describe("UnifiedAnswerComposer", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders one shared editor and one microphone action without mode toggles", () => {
    render(<UnifiedAnswerComposer {...baseProps()} />);

    expect(screen.getByRole("textbox", { name: "你的回答" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "语音输入" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "语音输入" })).toHaveClass(
      "rounded-full",
      "bg-orange-50",
      "dark:bg-orange-500/10",
    );
    expect(screen.queryByRole("button", { name: "语音回答" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "打字回答" })).not.toBeInTheDocument();
    expect(screen.getByTestId("unified-answer-composer")).toHaveClass(
      "bg-white/95",
      "dark:bg-[#17191f]/92",
    );
  });

  it("shows a non-interactive recording status and one stop action", async () => {
    stubCapturePipeline();
    const user = userEvent.setup();

    function Harness() {
      const [recording, setRecording] = useState(false);
      return (
        <UnifiedAnswerComposer
          {...baseProps({
            answerText: "实时转写内容",
            isRecording: recording,
            onRecordingChange: setRecording,
            voiceLevel: recording ? 0.7 : 0,
          })}
        />
      );
    }

    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "语音输入" }));

    expect(await screen.findByRole("status")).toHaveTextContent("正在聆听");
    expect(screen.getAllByRole("button", { name: "停止并转写" })).toHaveLength(1);
    expect(screen.getByRole("status").tagName).not.toBe("BUTTON");
    expect(screen.queryByText("点击停止")).not.toBeInTheDocument();
  });

  it("submits with Enter, keeps Shift+Enter for a newline, and locks submit while recording", () => {
    const onSubmit = vi.fn();
    const { rerender } = render(
      <UnifiedAnswerComposer
        {...baseProps({ answerText: "有内容", onSubmit })}
      />,
    );
    const editor = screen.getByRole("textbox", { name: "你的回答" });

    fireEvent.keyDown(editor, { key: "Enter", shiftKey: true });
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.keyDown(editor, { key: "Enter", shiftKey: false });
    expect(onSubmit).toHaveBeenCalledOnce();

    rerender(
      <UnifiedAnswerComposer
        {...baseProps({ answerText: "有内容", isRecording: true, onSubmit })}
      />,
    );
    expect(screen.getByRole("button", { name: "提交回答" })).toBeDisabled();
  });

  it("reports the connecting state without creating another recorder action", () => {
    render(
      <UnifiedAnswerComposer {...baseProps({ isVoiceConnecting: true })} />,
    );

    expect(screen.getByRole("button", { name: "正在连接语音…" })).toBeDisabled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });
});
