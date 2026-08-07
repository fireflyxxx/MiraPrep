import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LandingAwareProviders from "./LandingAwareProviders";

const route = vi.hoisted(() => ({ pathname: "/" }));

vi.mock("next/navigation", () => ({
  usePathname: () => route.pathname,
}));

vi.mock("./AppRuntime", () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="app-runtime">{children}</div>
  ),
}));

describe("LandingAwareProviders", () => {
  beforeEach(() => {
    route.pathname = "/";
  });

  it("keeps the public landing page outside the application runtime", () => {
    render(<LandingAwareProviders>landing</LandingAwareProviders>);

    expect(screen.getByText("landing")).toBeInTheDocument();
    expect(screen.queryByTestId("app-runtime")).not.toBeInTheDocument();
  });

  it("preserves the application runtime for product routes", async () => {
    route.pathname = "/dashboard";
    render(<LandingAwareProviders>dashboard</LandingAwareProviders>);

    expect(await screen.findByTestId("app-runtime")).toHaveTextContent("dashboard");
  });
});
