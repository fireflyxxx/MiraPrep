import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import FaqAccordion from "./FaqAccordion";

describe("FaqAccordion", () => {
  it("starts with six collapsed, keyboard-accessible questions", () => {
    render(<FaqAccordion />);

    const triggers = screen.getAllByRole("button");
    expect(triggers).toHaveLength(6);
    for (const trigger of triggers) {
      expect(trigger).toHaveAttribute("aria-expanded", "false");
    }
    expect(
      screen.queryByText(/不需要。Mira 会根据你的回答继续追问/),
    ).not.toBeInTheDocument();
  });

  it("opens one answer with Enter and closes it when another opens", async () => {
    const user = userEvent.setup();
    render(<FaqAccordion />);

    const first = screen.getByRole("button", {
      name: "需要邀请真人面试官吗？",
    });
    first.focus();
    await user.keyboard("{Enter}");

    expect(first).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByText(/不需要。Mira 会根据你的回答继续追问/),
    ).toBeVisible();

    const second = screen.getByRole("button", {
      name: "问题会怎样根据我的简历定制？",
    });
    await user.click(second);

    expect(second).toHaveAttribute("aria-expanded", "true");
    expect(first).toHaveAttribute("aria-expanded", "false");
  });

  it("moves between questions with arrow keys", async () => {
    const user = userEvent.setup();
    render(<FaqAccordion />);

    const triggers = screen.getAllByRole("button");
    triggers[0].focus();
    await user.keyboard("{ArrowDown}");
    expect(triggers[1]).toHaveFocus();

    await user.keyboard("{End}");
    expect(triggers.at(-1)).toHaveFocus();
  });
});
