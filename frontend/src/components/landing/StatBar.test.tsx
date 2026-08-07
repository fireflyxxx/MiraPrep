import { act, render, screen, waitFor } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import StatBar from "./StatBar";

const motionPreference = vi.hoisted(() => ({ reduced: true }));

vi.mock("./useReducedMotionPreference", () => ({
  useReducedMotionPreference: () => motionPreference.reduced,
}));

describe("StatBar", () => {
  beforeEach(() => {
    motionPreference.reduced = true;
  });

  it("gives every marketing number a readable meaning", () => {
    render(<StatBar />);

    expect(screen.getByText("12,800+")).toBeInTheDocument();
    expect(screen.getByText("已帮助候选人")).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();
    expect(screen.getByText("覆盖岗位方向")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("步完成训练闭环")).toBeInTheDocument();
  });

  it("identifies the trust metrics as a labelled region", () => {
    render(<StatBar />);

    expect(
      screen.getByRole("region", { name: "MiraPrep 使用数据" }),
    ).toBeInTheDocument();
  });

  it("hydrates reduced-motion numbers without replacing server HTML", async () => {
    motionPreference.reduced = false;
    const serverHtml = renderToString(<StatBar />);
    const container = document.createElement("div");
    container.innerHTML = serverHtml;
    document.body.appendChild(container);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    motionPreference.reduced = true;
    const root = hydrateRoot(container, <StatBar />);

    await waitFor(() => expect(container).toHaveTextContent("12,800+"));
    expect(consoleError).not.toHaveBeenCalled();

    await act(async () => root.unmount());
    container.remove();
    consoleError.mockRestore();
  });
});
