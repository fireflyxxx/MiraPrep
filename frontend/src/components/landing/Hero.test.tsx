import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Hero from "./Hero";

const motionPreference = vi.hoisted(() => ({ reduced: true }));

vi.mock("./useReducedMotionPreference", () => ({
  useReducedMotionPreference: () => motionPreference.reduced,
}));

describe("Hero", () => {
  beforeEach(() => {
    motionPreference.reduced = true;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("survives a browser with no WebGL instead of blanking the page", () => {
    // jsdom has no WebGL, so getContext("webgl") returns null — the same path a blocked
    // GPU takes. The copy and the CTAs have to render regardless of the backdrop.
    render(<Hero />);

    expect(screen.getByTestId("robot-scene")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: /像真实面试一样/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /开始一场面试/ })).toBeInTheDocument();
    // The robot is a canvas, so the label is the only thing a screen reader gets.
    expect(screen.getByRole("img", { name: "Mira 机器人面试官" })).toBeInTheDocument();
  });

  it("keeps the enlarged robot in a fixed vertical slot so the CTA follows it", () => {
    render(<Hero />);

    const robotSlot = screen.getByTestId("hero-robot-slot");
    expect(robotSlot).toHaveClass("flex-none");
    expect(robotSlot).not.toHaveClass("flex-1");
    expect(robotSlot).toHaveClass("h-[clamp(320px,40svh,600px)]");
  });

  it("does not reserve a full viewport after the CTA", () => {
    render(<Hero />);

    const hero = screen.getByTestId("landing-hero");
    expect(hero).not.toHaveClass("min-h-[100svh]");
  });

  it("keeps the rotating headline word readable to screen readers as it cycles", () => {
    motionPreference.reduced = false;
    vi.useFakeTimers();

    render(<Hero />);
    // The visible chars are aria-hidden, so the sr-only copy is the only accessible name —
    // it has to track the word actually on screen.
    expect(screen.getByText("offer", { selector: ".sr-only" })).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(2600));
    expect(screen.getByText("offer", { selector: ".sr-only" })).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(360));
    expect(screen.getByText("心仪岗位", { selector: ".sr-only" })).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(110));
    expect(screen.getByText("心仪岗位", { selector: ".sr-only" })).toBeInTheDocument();
  });

  it("wipes the old word away before typing the next one", () => {
    motionPreference.reduced = false;
    vi.useFakeTimers();

    render(<Hero />);

    act(() => vi.advanceTimersByTime(2600));
    expect(screen.getByTestId("rotating-word-visible")).toHaveTextContent("offer");

    act(() => vi.advanceTimersByTime(360));
    expect(screen.getByTestId("rotating-word-visible")).toHaveTextContent("");

    act(() => vi.advanceTimersByTime(110));
    expect(screen.getByTestId("rotating-word-visible")).toHaveTextContent("心");
  });

  it("keeps the typing word and cursor on one line while the pill expands", () => {
    motionPreference.reduced = false;
    vi.useFakeTimers();

    render(<Hero />);
    act(() => vi.advanceTimersByTime(2600 + 360));

    expect(screen.getByTestId("rotating-word-pill")).toHaveClass("whitespace-nowrap");
  });

  it("holds the headline still when the visitor asks for reduced motion", () => {
    vi.useFakeTimers();

    render(<Hero />);
    act(() => {
      vi.advanceTimersByTime(2600 * 3);
    });

    expect(screen.getByText("offer", { selector: ".sr-only" })).toBeInTheDocument();
  });
});
