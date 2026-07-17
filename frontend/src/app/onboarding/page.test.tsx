import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import OnboardingPage from "./page";
import { apiClient } from "@/lib/api/client";

const push = vi.fn();
const replace = vi.fn();
const { getMeMock, toastError } = vi.hoisted(() => ({
  getMeMock: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
}));
vi.mock("@/components/AuthGuard", () => ({
  default: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/lib/api/client", () => ({
  apiClient: vi.fn(),
}));
vi.mock("sonner", () => ({
  toast: { error: toastError },
}));
vi.mock("@/lib/api/auth", () => ({
  getMe: getMeMock,
}));

describe("OnboardingPage", () => {
  beforeEach(() => {
    push.mockReset();
    replace.mockReset();
    getMeMock.mockReset();
    getMeMock.mockResolvedValue({ isFirstLogin: true });
    toastError.mockReset();
    vi.mocked(apiClient).mockReset();
    vi.mocked(apiClient).mockResolvedValue({});
  });

  it("persists an empty profile before skipping onboarding", async () => {
    const user = userEvent.setup();
    render(<OnboardingPage />);

    await user.click(screen.getByRole("button", { name: "跳过" }));

    await waitFor(() =>
      expect(apiClient).toHaveBeenCalledWith(
        "/users/me/profile",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({
            jobDirection: null,
            techStacks: [],
            experienceLevel: null,
            status: null,
            targetCompany: null,
            preferences: {},
          }),
        }),
      ),
    );
    expect(push).toHaveBeenCalledWith("/dashboard", {
      transitionTypes: ["nav-modal-out"],
    });
  });

  it("maps the selected onboarding values to the backend profile contract", async () => {
    const user = userEvent.setup();
    render(<OnboardingPage />);

    await user.click(screen.getByRole("button", { name: "下一步 →" }));
    await user.type(screen.getByPlaceholderText("如：一线大厂 / 外企 / 创业公司"), "外企");
    await user.click(screen.getByRole("button", { name: "进入工作台 →" }));

    await waitFor(() =>
      expect(apiClient).toHaveBeenCalledWith(
        "/users/me/profile",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({
            jobDirection: "frontend",
            techStacks: ["React", "TypeScript", "Next.js"],
            experienceLevel: "JUNIOR",
            status: "ACTIVE",
            targetCompany: "外企",
            preferences: {},
          }),
        }),
      ),
    );
    expect(push).toHaveBeenCalledWith("/dashboard", {
      transitionTypes: ["nav-modal-out"],
    });
  });

  it("disables both actions while saving and prevents duplicate submissions", async () => {
    let resolveSave: (value: unknown) => void = () => undefined;
    vi.mocked(apiClient).mockReturnValue(
      new Promise((resolve) => {
        resolveSave = resolve;
      }),
    );
    const user = userEvent.setup();
    render(<OnboardingPage />);

    await user.click(screen.getByRole("button", { name: "跳过" }));

    expect(screen.getAllByRole("button", { name: "保存中…" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "保存中…" })[0]).toBeDisabled();
    expect(screen.getAllByRole("button", { name: "保存中…" })[1]).toBeDisabled();
    expect(apiClient).toHaveBeenCalledTimes(1);

    await user.click(screen.getAllByRole("button", { name: "保存中…" })[0]);
    expect(apiClient).toHaveBeenCalledTimes(1);

    resolveSave({});
    await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
  });

  it("shows a toast after failure and allows a successful retry", async () => {
    vi.mocked(apiClient)
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce({});
    const user = userEvent.setup();
    render(<OnboardingPage />);

    await user.click(screen.getByRole("button", { name: "跳过" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("保存失败，请重试");
    expect(toastError).toHaveBeenCalledWith("保存失败，请重试");
    expect(push).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "跳过" }));

    await waitFor(() => expect(apiClient).toHaveBeenCalledTimes(2));
    expect(push).toHaveBeenCalledWith("/dashboard", {
      transitionTypes: ["nav-modal-out"],
    });
  });

  it("redirects users who already completed onboarding without overwriting their profile", async () => {
    getMeMock.mockResolvedValue({ isFirstLogin: false });
    const user = userEvent.setup();
    render(<OnboardingPage />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/dashboard"));
    await user.click(screen.getByRole("button", { name: "跳过" }));

    expect(apiClient).not.toHaveBeenCalled();
  });
});
