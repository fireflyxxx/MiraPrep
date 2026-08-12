import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import TTSPlayer from "./TTSPlayer";

describe("TTSPlayer", () => {
  it("lets the candidate mute and re-enable interviewer speech", async () => {
    const user = userEvent.setup();
    render(<TTSPlayer />);

    const mute = screen.getByRole("button", { name: "静音面试官语音" });
    await user.click(mute);
    expect(
      screen.getByRole("button", { name: "开启面试官语音" }),
    ).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "开启面试官语音" }));
    expect(
      screen.getByRole("button", { name: "静音面试官语音" }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("uses practice-specific speech labels outside the formal interview", () => {
    render(
      <TTSPlayer
        labels={{
          mute: "关闭题目语音",
          unmute: "开启题目语音",
          idle: "题目语音开启",
          muted: "题目已静音",
          speaking: "题目播放中",
        }}
      />,
    );

    expect(
      screen.getByRole("button", { name: "关闭题目语音" }),
    ).toHaveTextContent("题目语音开启");
  });
});
