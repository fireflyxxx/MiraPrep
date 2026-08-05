import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import RadarChart, { buildRadarData } from "./RadarChart";

const current = {
  professionalKnowledge: 90,
  projectDepth: 80,
  communicationLogic: 70,
  adaptability: 60,
  jobFit: 50,
};

const history = {
  professionalKnowledge: 60,
  projectDepth: 65,
  communicationLogic: 70,
  adaptability: 75,
  jobFit: 80,
};

describe("RadarChart", () => {
  it("keeps current and historical scores aligned across all five dimensions", () => {
    expect(buildRadarData(current, history)).toEqual([
      { label: "专业知识", current: 90, history: 60 },
      { label: "项目深度", current: 80, history: 65 },
      { label: "表达逻辑", current: 70, history: 70 },
      { label: "临场应变", current: 60, history: 75 },
      { label: "岗位匹配", current: 50, history: 80 },
    ]);
  });

  it("uses visually distinct legend treatments for this result and history", () => {
    render(<RadarChart scores={current} historyScores={history} />);

    expect(screen.getByTestId("radar-legend-current")).toHaveAttribute(
      "data-series-style",
      "solid-glow",
    );
    expect(screen.getByTestId("radar-legend-history")).toHaveAttribute(
      "data-series-style",
      "dashed-muted",
    );
  });
});
