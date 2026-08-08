import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AuthPage from "./page";
import { createQueryClient } from "@/lib/api/query-provider";
import { login, loginWithGoogle, register } from "@/lib/api/auth";
import { clearAuthTokens } from "@/lib/api/auth-token";
import { githubClientId, startGitHubLogin } from "@/lib/api/github-oauth";
import { ApiError } from "@/lib/api/types";

const push = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/api/auth", () => ({
  login: vi.fn(),
  loginWithGoogle: vi.fn(),
  register: vi.fn(),
  sendVerificationCode: vi.fn(),
}));
// 真正的跳转逻辑由 github-oauth.test.ts 覆盖，这里只关心按钮有没有把流程发起。
vi.mock("@/lib/api/github-oauth", () => ({
  githubClientId: vi.fn(() => undefined),
  startGitHubLogin: vi.fn(),
}));
// GIS 脚本在 jsdom 里加载不了，直接把 next/script 换成「立刻宣告就绪」。
vi.mock("next/script", async () => {
  const { useEffect } = await import("react");
  const ScriptStub = ({ onReady }: { onReady?: () => void }) => {
    useEffect(() => onReady?.(), [onReady]);
    return null;
  };
  return { default: ScriptStub };
});

describe("AuthPage", () => {
  beforeEach(() => {
    push.mockReset();
    clearAuthTokens();
    vi.mocked(login).mockReset();
    vi.mocked(register).mockReset();
    vi.mocked(loginWithGoogle).mockReset();
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
    await user.type(screen.getByLabelText("密码"), "strongpass123");
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
    await user.type(screen.getByLabelText("密码"), "strongpass123");
    await user.click(screen.getByRole("button", { name: "创建账号" }));

    expect(await screen.findByText("验证码无效或已过期")).toBeInTheDocument();
    expect(screen.getByLabelText("验证码")).toHaveClass("border-red-500");
  });

  it("rejects a registration password that lacks a number before calling the API", async () => {
    const user = userEvent.setup();
    render(<QueryClientProvider client={createQueryClient()}><AuthPage /></QueryClientProvider>);

    await user.click(screen.getByRole("button", { name: "注册" }));
    await user.type(screen.getByLabelText("昵称"), "Mira");
    await user.type(screen.getByLabelText("邮箱"), "mira@example.com");
    await user.type(screen.getByLabelText("验证码"), "123456");
    await user.type(screen.getByLabelText("密码"), "onlylowercase");
    await user.click(screen.getByRole("button", { name: "创建账号" }));

    expect(
      (await screen.findAllByText("密码至少 12 位，且必须同时包含字母和数字")).length,
    ).toBeGreaterThan(0);
    expect(register).not.toHaveBeenCalled();
  });
});

describe("AuthPage Google 登录 (T-120)", () => {
  const initialize = vi.fn();
  const renderButton = vi.fn();

  beforeEach(() => {
    push.mockReset();
    clearAuthTokens();
    vi.mocked(loginWithGoogle).mockReset();
    initialize.mockReset();
    renderButton.mockReset();
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_CLIENT_ID", "test-client.apps.googleusercontent.com");
    window.google = { accounts: { id: { initialize, renderButton } } };
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    delete window.google;
  });

  it("hands the Google ID token to the backend and routes a first-time user to onboarding", async () => {
    vi.mocked(loginWithGoogle).mockResolvedValue({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      user: { id: 9, email: "g@example.com", nickname: "G", avatar: null, isFirstLogin: true },
    });
    render(<QueryClientProvider client={createQueryClient()}><AuthPage /></QueryClientProvider>);

    await waitFor(() => expect(initialize).toHaveBeenCalled());
    expect(initialize.mock.calls[0][0].client_id).toBe("test-client.apps.googleusercontent.com");
    expect(renderButton).toHaveBeenCalledWith(screen.getByTestId("google-signin"), expect.anything());

    initialize.mock.calls[0][0].callback({ credential: "google-id-token" });

    await waitFor(() => expect(loginWithGoogle).toHaveBeenCalledWith("google-id-token"));
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/onboarding", { transitionTypes: ["nav-modal-in"] }),
    );
  });

  it("hides the Google button entirely when no client id is configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_CLIENT_ID", "");
    render(<QueryClientProvider client={createQueryClient()}><AuthPage /></QueryClientProvider>);

    expect(screen.queryByTestId("google-signin")).not.toBeInTheDocument();
    await waitFor(() => expect(initialize).not.toHaveBeenCalled());
  });
});

describe("AuthPage GitHub 登录 (T-120)", () => {
  beforeEach(() => {
    clearAuthTokens();
    vi.mocked(startGitHubLogin).mockReset();
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_CLIENT_ID", "");
  });

  afterEach(() => vi.unstubAllEnvs());

  it("starts the GitHub authorization flow from the button", async () => {
    vi.mocked(githubClientId).mockReturnValue("Iv1.testclientid");
    const user = userEvent.setup();
    render(<QueryClientProvider client={createQueryClient()}><AuthPage /></QueryClientProvider>);

    await user.click(screen.getByRole("button", { name: "使用 GitHub 继续" }));

    expect(startGitHubLogin).toHaveBeenCalled();
  });

  it("drops the 微信 placeholder and hides the divider when nothing is configured", () => {
    vi.mocked(githubClientId).mockReturnValue(undefined);
    render(<QueryClientProvider client={createQueryClient()}><AuthPage /></QueryClientProvider>);

    expect(screen.queryByText("微信登录")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "使用 GitHub 继续" })).not.toBeInTheDocument();
    expect(screen.queryByText("或")).not.toBeInTheDocument();
  });
});
