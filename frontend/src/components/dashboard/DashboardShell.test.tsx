import { render, screen, within } from "@testing-library/react";
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

  it("keeps all three application areas and logout reachable from the mobile navigation", () => {
    render(<QueryClientProvider client={createQueryClient()}><DashboardShell><p>dashboard</p></DashboardShell></QueryClientProvider>);

    const navigation = screen.getByRole("navigation", { name: "移动端主导航" });
    expect(within(navigation).getByRole("link", { name: "工作台" })).toHaveAttribute("href", "/dashboard");
    expect(within(navigation).getByRole("link", { name: "我的面试" })).toHaveAttribute("href", "/interviews");
    expect(within(navigation).getByRole("link", { name: "题库训练" })).toHaveAttribute("href", "/practice");
    expect(within(navigation).getByRole("link", { name: "设置" })).toHaveAttribute("href", "/settings");
    expect(within(navigation).getByRole("button", { name: "退出" })).toBeInTheDocument();
  });

  it("links the desktop account menu to the settings page", async () => {
    const user = userEvent.setup();
    render(<QueryClientProvider client={createQueryClient()}><DashboardShell><p>dashboard</p></DashboardShell></QueryClientProvider>);

    await user.click(screen.getByRole("button", { name: /真实用户/ }));

    expect(screen.getByRole("link", { name: "账户设置" })).toHaveAttribute("href", "/settings");
  });

  // jsdom 不跑 Tailwind，媒体查询断言不了；退而求其次守住两个断点类互补，
  // 任何一边被删掉都会让 <md 或 >=md 少掉全部导航入口。
  it("keeps the desktop sidebar and the mobile bar on complementary breakpoints", () => {
    render(<QueryClientProvider client={createQueryClient()}><DashboardShell><p>dashboard</p></DashboardShell></QueryClientProvider>);

    expect(document.querySelector("aside")).toHaveClass("hidden", "md:flex");
    expect(screen.getByRole("navigation", { name: "移动端主导航" })).toHaveClass("md:hidden");
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
