import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DashboardShell from "./DashboardShell";
import { createQueryClient } from "@/lib/api/query-provider";
import { clearAuthTokens, getAccessToken, setAuthTokens } from "@/lib/api/auth-token";

const replace = vi.fn();

vi.mock("@/components/AuthGuard", () => ({ default: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard", useRouter: () => ({ replace }) }));
vi.mock("@/lib/api/auth", () => ({
  useMeQuery: () => ({ data: { nickname: "真实用户", email: "real@example.com" } }),
  useMyProfileQuery: () => ({ data: { jobDirection: "前端工程师" } }),
}));

describe("DashboardShell", () => {
  beforeEach(() => {
    clearAuthTokens();
    replace.mockReset();
  });

  it("does not present the mock monthly quota as real account data", async () => {
    const user = userEvent.setup();
    render(<QueryClientProvider client={createQueryClient()}><DashboardShell><p>dashboard</p></DashboardShell></QueryClientProvider>);
    await user.click(screen.getByRole("button", { name: /真实用户/ }));

    expect(screen.queryByText("3 / 5 场")).not.toBeInTheDocument();
  });

  it("clears credentials and the user cache before redirecting on logout", async () => {
    const user = userEvent.setup();
    const queryClient = createQueryClient();
    setAuthTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
    queryClient.setQueryData(["user", "me"], { email: "real@example.com" });
    render(<QueryClientProvider client={queryClient}><DashboardShell><p>dashboard</p></DashboardShell></QueryClientProvider>);

    await user.click(screen.getByRole("button", { name: /真实用户/ }));
    await user.click(screen.getByRole("button", { name: "退出登录" }));

    expect(getAccessToken()).toBeNull();
    expect(queryClient.getQueryData(["user", "me"])).toBeUndefined();
    expect(replace).toHaveBeenCalledWith("/auth");
  });
});
