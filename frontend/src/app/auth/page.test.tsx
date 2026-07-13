import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AuthPage from "./page";
import { createQueryClient } from "@/lib/api/query-provider";
import { login, register } from "@/lib/api/auth";
import { clearAuthTokens } from "@/lib/api/auth-token";
import { ApiError } from "@/lib/api/types";

const push = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/api/auth", () => ({
  login: vi.fn(),
  register: vi.fn(),
  sendVerificationCode: vi.fn(),
}));

describe("AuthPage", () => {
  beforeEach(() => {
    push.mockReset();
    clearAuthTokens();
    vi.mocked(login).mockReset();
    vi.mocked(register).mockReset();
  });

  it("shows an inline Chinese error instead of submitting an invalid login form", async () => {
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={createQueryClient()}>
        <AuthPage />
      </QueryClientProvider>,
    );

    await user.click(screen.getAllByRole("button", { name: "登录" })[1]);

    expect(screen.getByText("请输入正确的邮箱地址")).toBeInTheDocument();
  });

  it("stores a successful login and sends returning users to the dashboard", async () => {
    vi.mocked(login).mockResolvedValue({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      user: { id: 1, email: "mira@example.com", nickname: "Mira", avatar: null, isFirstLogin: false },
    });
    const user = userEvent.setup();
    render(<QueryClientProvider client={createQueryClient()}><AuthPage /></QueryClientProvider>);

    await user.type(screen.getByLabelText("邮箱"), "mira@example.com");
    await user.type(screen.getByLabelText("密码"), "strongpass");
    await user.click(screen.getAllByRole("button", { name: "登录" })[1]);

    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard", { transitionTypes: ["nav-forward"] }));
  });

  it("sends a first-time registrant into onboarding", async () => {
    vi.mocked(register).mockResolvedValue({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      user: { id: 2, email: "new@example.com", nickname: "New", avatar: null, isFirstLogin: true },
    });
    const user = userEvent.setup();
    render(<QueryClientProvider client={createQueryClient()}><AuthPage /></QueryClientProvider>);

    await user.click(screen.getByRole("button", { name: "注册" }));
    await user.type(screen.getByLabelText("昵称"), "New");
    await user.type(screen.getByLabelText("邮箱"), "new@example.com");
    await user.type(screen.getByLabelText("验证码"), "123456");
    await user.type(screen.getByLabelText("密码"), "strongpass");
    await user.click(screen.getByRole("button", { name: "创建账号" }));

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/onboarding", { transitionTypes: ["nav-modal-in"] }),
    );
  });

  it("shows a verification-code error in the registration form for backend code 40000", async () => {
    vi.mocked(register).mockRejectedValue(new ApiError(40000, "invalid parameter", 400));
    const user = userEvent.setup();
    render(<QueryClientProvider client={createQueryClient()}><AuthPage /></QueryClientProvider>);

    await user.click(screen.getByRole("button", { name: "注册" }));
    await user.type(screen.getByLabelText("昵称"), "Mira");
    await user.type(screen.getByLabelText("邮箱"), "mira@example.com");
    await user.type(screen.getByLabelText("验证码"), "123456");
    await user.type(screen.getByLabelText("密码"), "strongpass");
    await user.click(screen.getByRole("button", { name: "创建账号" }));

    expect(await screen.findByText("验证码无效或已过期")).toBeInTheDocument();
    expect(screen.getByLabelText("验证码")).toHaveClass("border-red-500");
  });
});
