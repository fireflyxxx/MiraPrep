import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CountUp } from "./primitives";

const reducedMotionDefault = window.matchMedia;

/** 全局 setup 把所有测试都钉在 reduced-motion 上；这里放开，覆盖真正会动的分支。 */
function allowMotion() {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

describe("CountUp", () => {
  afterEach(() => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: reducedMotionDefault,
    });
  });

  it("lands exactly on the target instead of stopping a rounding error short", async () => {
    allowMotion();
    render(
      <span data-testid="score">
        <CountUp value={87} duration={40} />
      </span>,
    );

    // 缓动函数逐帧取整，收尾必须正好落在目标值上，否则评分会显示成 86。
    expect(screen.getByTestId("score")).not.toHaveTextContent("87");
    await waitFor(() => expect(screen.getByTestId("score")).toHaveTextContent("87"));
  });

  // reduced-motion 分支由全局 setup 钉住，已被 InterviewResultClient 等用例覆盖；
  // framer-motion 只读一次媒体查询并缓存，所以本文件放开后无法再切回去。

  it("shows the real number in a hidden tab, where no animation frame ever runs", () => {
    allowMotion();
    const hidden = vi
      .spyOn(document, "hidden", "get")
      .mockReturnValue(true);

    render(
      <span data-testid="score">
        <CountUp value={87} />
      </span>,
    );

    expect(screen.getByTestId("score")).toHaveTextContent("87");
    hidden.mockRestore();
  });

  it("hands the animated value to a render prop for custom formatting", async () => {
    allowMotion();
    render(
      <span data-testid="score">
        <CountUp value={5} duration={40}>
          {(current) => `${current} 场`}
        </CountUp>
      </span>,
    );

    await waitFor(() => expect(screen.getByTestId("score")).toHaveTextContent("5 场"));
  });
});
