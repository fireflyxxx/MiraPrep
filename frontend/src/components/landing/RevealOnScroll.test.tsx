import { act, cleanup, render, screen } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import RevealOnScroll from "./RevealOnScroll";

let reducedMotion = false;

vi.mock("./useReducedMotionPreference", () => ({
  useReducedMotionPreference: () => reducedMotion,
}));

describe("RevealOnScroll", () => {
  afterEach(() => {
    cleanup();
    reducedMotion = false;
  });

  it("starts a normal reveal slightly below its resting position", () => {
    render(<RevealOnScroll>可见内容</RevealOnScroll>);

    expect(screen.getByText("可见内容")).toHaveStyle({
      opacity: "0",
      transform: "translateY(16px)",
      contentVisibility: "auto",
      containIntrinsicSize: "auto 600px",
    });
  });

  it("shows content immediately without translation for reduced motion", () => {
    reducedMotion = true;
    render(<RevealOnScroll>减弱动态效果内容</RevealOnScroll>);

    const wrapper = screen.getByText("减弱动态效果内容");
    expect(wrapper).toHaveClass("mira-reveal");
    expect(wrapper).toHaveStyle({ opacity: "1" });
    expect(wrapper).not.toHaveStyle({ transform: "translateY(16px)" });
  });

  it("hydrates without changing visibility when IntersectionObserver only exists in the browser", async () => {
    const originalObserver = globalThis.IntersectionObserver;
    Object.assign(globalThis, { IntersectionObserver: undefined });
    const serverHtml = renderToString(<RevealOnScroll>hydration content</RevealOnScroll>);
    const container = document.createElement("div");
    container.innerHTML = serverHtml;
    document.body.appendChild(container);

    class BrowserIntersectionObserver {
      observe() {}
      disconnect() {}
    }
    Object.assign(globalThis, { IntersectionObserver: BrowserIntersectionObserver });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const root = hydrateRoot(
      container,
      <RevealOnScroll>hydration content</RevealOnScroll>,
    );
    await act(async () => {});

    expect(consoleError).not.toHaveBeenCalled();

    await act(async () => root.unmount());
    container.remove();
    consoleError.mockRestore();
    Object.assign(globalThis, { IntersectionObserver: originalObserver });
  });
});
