import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ReportShowcase from "./ReportShowcase";

describe("ReportShowcase", () => {
  it("keeps the anonymized report useful even without its chart", () => {
    render(<ReportShowcase />);

    expect(screen.getByText("示例报告 · 信息已脱敏")).toBeInTheDocument();
    expect(screen.getByLabelText("综合评级 A")).toBeInTheDocument();
    expect(screen.getByText("专业知识")).toBeInTheDocument();
    expect(screen.getByText("86")).toBeInTheDocument();
    expect(screen.getByText("项目深度")).toBeInTheDocument();
    expect(screen.getByText("82")).toBeInTheDocument();
    expect(screen.getByText("表达逻辑")).toBeInTheDocument();
    expect(screen.getByText("88")).toBeInTheDocument();
    expect(screen.getByText("应变能力")).toBeInTheDocument();
    expect(screen.getByText("78")).toBeInTheDocument();
    expect(screen.getByText("岗位匹配")).toBeInTheDocument();
    expect(screen.getByText("91")).toBeInTheDocument();
    expect(screen.getByText("第 3 题 · 项目深挖")).toBeInTheDocument();
    expect(screen.getByText("下一步最值得练习")).toBeInTheDocument();
    expect(screen.getByTestId("report-chart-placeholder")).toBeInTheDocument();
  });
});
