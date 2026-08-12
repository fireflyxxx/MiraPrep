import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import GitHubCallbackPage from "./page";
import { loginWithGithub } from "@/lib/api/auth";
import { clearAuthTokens, getAccessToken } from "@/lib/api/auth-token";

const replace = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
vi.mock("@/lib/api/auth", () => ({ loginWithGithub: vi.fn() }));

function visit(search: string) {
  window.history.replaceState({}, "", `/auth/callback/github${search}`);
  render(<GitHubCallbackPage />);
}

describe("GitHubCallbackPage", () => {
  beforeEach(() => {
    replace.mockReset();
    clearAuthTokens();
    window.sessionStorage.clear();
    vi.mocked(loginWithGithub).mockReset();
  });

  it("exchanges the code and sends a returning user to the dashboard", async () => {
    vi.mocked(loginWithGithub).mockResolvedValue({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      user: { id: 3, email: "gh@example.com", nickname: "GH", avatar: null, isFirstLogin: false },
    });
    window.sessionStorage.setItem("miraprep.github.oauth.state", "state-abc");

    visit("?code=gh-code&state=state-abc");

    await waitFor(() => expect(loginWithGithub).toHaveBeenCalledWith("gh-code"));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/dashboard"));
    expect(getAccessToken()).toBe("access-token");
  });

  it("sends a first-time GitHub user into onboarding", async () => {
    vi.mocked(loginWithGithub).mockResolvedValue({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      user: { id: 4, email: "new@example.com", nickname: "New", avatar: null, isFirstLogin: true },
    });
    window.sessionStorage.setItem("miraprep.github.oauth.state", "state-abc");

    visit("?code=gh-code&state=state-abc");

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/onboarding"));
  });

  it("refuses a callback whose state does not match the one this browser stored", async () => {
    window.sessionStorage.setItem("miraprep.github.oauth.state", "state-abc");

    visit("?code=attacker-code&state=state-from-attacker");

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/auth"));
    expect(loginWithGithub).not.toHaveBeenCalled();
  });

  it("refuses a callback when this browser never started a GitHub login", async () => {
    visit("?code=attacker-code&state=state-from-attacker");

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/auth"));
    expect(loginWithGithub).not.toHaveBeenCalled();
  });

  it("returns to the login page when the exchange fails", async () => {
    vi.mocked(loginWithGithub).mockRejectedValue(new Error("boom"));
    window.sessionStorage.setItem("miraprep.github.oauth.state", "state-abc");

    visit("?code=gh-code&state=state-abc");

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/auth"));
    expect(getAccessToken()).toBeNull();
    expect(screen.getByText("正在完成 GitHub 登录…")).toBeInTheDocument();
  });
});
