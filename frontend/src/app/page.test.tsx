import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import LandingPage from "./page";

vi.mock("@/components/landing/LandingNav", () => ({
  default: () => <nav aria-label="主导航" />,
}));

vi.mock("@/components/landing/StatBar", () => ({
  default: () => <section aria-label="MiraPrep 使用数据" />,
}));

vi.mock("@/components/landing/ReportShowcase", () => ({
  default: () => <div data-testid="report-showcase" />,
}));

vi.mock("@/components/landing/FaqAccordion", () => ({
  default: () => <div data-testid="faq-accordion" />,
}));

vi.mock("@/components/landing/RevealOnScroll", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe("LandingPage", () => {
  it("presents the complete conversion story in the agreed order", () => {
    render(<LandingPage />);

    const landmarks = [
      screen.getByRole("heading", { level: 1 }),
      screen.getByRole("region", { name: "MiraPrep 使用数据" }),
      screen.getByRole("heading", { name: "一场完整训练，五种核心能力" }),
      screen.getByRole("heading", { name: "面试结束，真正的提升才开始" }),
      screen.getByRole("heading", { name: "四步，开始你的面试训练" }),
      screen.getByRole("heading", { name: "开始前，你可能还想知道" }),
      screen.getByRole("heading", { name: /下一场面试/ }),
      screen.getByRole("contentinfo"),
    ];

    landmarks.slice(1).forEach((element, index) => {
      expect(
        landmarks[index].compareDocumentPosition(element) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });
  });

  it("keeps the public anchors and report demonstration available", () => {
    render(<LandingPage />);

    expect(document.querySelector("#features")).toBeInTheDocument();
    expect(document.querySelector("#how")).toBeInTheDocument();
    expect(document.querySelector("#faq")).toBeInTheDocument();
    expect(screen.getByTestId("report-showcase")).toBeInTheDocument();
    expect(screen.getByTestId("faq-accordion")).toBeInTheDocument();
  });

  it("does not continuously move the above-the-fold LCP candidate", () => {
    render(<LandingPage />);

    expect(document.querySelector(".animate-mira-float")).not.toBeInTheDocument();
    expect(document.querySelector(".animate-mira-soft-pop")).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1 }).querySelector(".font-display"),
    ).not.toBeInTheDocument();
  });
});
