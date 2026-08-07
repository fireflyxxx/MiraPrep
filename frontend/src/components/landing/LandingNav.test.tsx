import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import LandingNav from "./LandingNav";

let token: string | null = null;

vi.mock("@/lib/api/auth-token", () => ({
  useAuthToken: () => ({ token }),
}));

describe("LandingNav", () => {
  afterEach(() => {
    cleanup();
    token = null;
  });

  it("sends a signed-out visitor to authentication", () => {
    render(<LandingNav />);

    expect(screen.getByRole("link", { name: "登录" })).toHaveAttribute(
      "href",
      "/auth",
    );
  });

  it("sends a signed-in visitor directly to the dashboard", () => {
    token = "access-token";
    render(<LandingNav />);

    expect(screen.getByRole("link", { name: "进入工作台" })).toHaveAttribute(
      "href",
      "/dashboard",
    );
  });
});
