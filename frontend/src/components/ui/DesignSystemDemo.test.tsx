import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("DesignSystemDemo", () => {
  it("renders the reusable shadcn component examples", async () => {
    const modulePath = "./DesignSystemDemo";
    const demoModule = await import(/* @vite-ignore */ modulePath);

    expect(demoModule).toBeDefined();

    if (!demoModule) {
      return;
    }

    const { DesignSystemDemo } = demoModule;
    render(<DesignSystemDemo />);

    expect(screen.getByRole("button", { name: "打开示例弹窗" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "组件状态" })).toBeInTheDocument();
    expect(screen.getByTestId("design-system-skeleton")).toBeInTheDocument();
    expect(screen.getByLabelText("通知区域")).toBeInTheDocument();
  });
});
