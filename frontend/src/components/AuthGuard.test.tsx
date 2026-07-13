import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AuthGuard from "./AuthGuard";
import { clearAuthTokens } from "@/lib/api/auth-token";
import { refreshAccessToken } from "@/lib/api/client";

const replace = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
vi.mock("@/lib/api/client", () => ({ refreshAccessToken: vi.fn() }));

describe("AuthGuard", () => {
  beforeEach(() => {
    clearAuthTokens();
    replace.mockReset();
    vi.mocked(refreshAccessToken).mockReset();
  });

  it("redirects an anonymous visitor to auth when session refresh fails", async () => {
    vi.mocked(refreshAccessToken).mockRejectedValue(new Error("expired"));

    render(
      <AuthGuard>
        <p>private content</p>
      </AuthGuard>,
    );

    expect(screen.queryByText("private content")).not.toBeInTheDocument();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/auth"));
  });
});
