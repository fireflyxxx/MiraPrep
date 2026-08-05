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
});
