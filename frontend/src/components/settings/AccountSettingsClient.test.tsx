import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AccountSettingsClient from "./AccountSettingsClient";
import { createQueryClient } from "@/lib/api/query-provider";
import { deleteMyAccount } from "@/lib/api/auth";
import { clearAuthTokens, getAccessToken, setAuthTokens } from "@/lib/api/auth-token";

const replace = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
vi.mock("@/lib/api/auth", () => ({ deleteMyAccount: vi.fn() }));

describe("AccountSettingsClient", () => {
  beforeEach(() => {
    replace.mockReset();
    vi.mocked(deleteMyAccount).mockReset();
    clearAuthTokens();
  });

  it("requires all irreversible confirmations before deleting and clears local auth", async () => {
    vi.mocked(deleteMyAccount).mockResolvedValue();
    setAuthTokens({ accessToken: "access", refreshToken: "refresh" });
    const queryClient = createQueryClient();
    queryClient.setQueryData(["user", "me"], { id: 1 });
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={queryClient}>
        <AccountSettingsClient />
      </QueryClientProvider>,
    );

    const submit = screen.getByRole("button", { name: "永久删除账号" });
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText("当前密码"), "safe-password-123");
    await user.type(screen.getByLabelText("输入 DELETE 确认"), "DELETE");
    await user.click(screen.getByRole("checkbox"));
    await user.click(submit);

    await waitFor(() =>
      expect(deleteMyAccount).toHaveBeenCalledWith({
        password: "safe-password-123",
        confirmation: "DELETE",
      }),
    );
    expect(getAccessToken()).toBeNull();
    expect(queryClient.getQueryData(["user", "me"])).toBeUndefined();
    expect(replace).toHaveBeenCalledWith("/auth");
  });
});
