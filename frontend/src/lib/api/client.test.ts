import { afterEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "./client";
import { clearAuthTokens, setAccessToken, setAuthTokens } from "./auth-token";
import { ApiError } from "./types";

const apiUrl = "http://localhost:8080/api/v1";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("apiClient", () => {
  afterEach(() => {
    clearAuthTokens();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("adds the bearer token and unwraps a successful API response", async () => {
    setAccessToken("access-token");
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ code: 0, message: "ok", data: { status: "UP" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiClient<{ status: string }>("/health")).resolves.toEqual({
      status: "UP",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      `${apiUrl}/health`,
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer access-token",
        }),
      }),
    );
  });

  it("turns a non-zero API envelope into an ApiError", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ code: 40001, message: "invalid request", data: null }, 400),
        ),
    );

    await expect(apiClient("/health")).rejects.toEqual(
      new ApiError(40001, "invalid request", 400),
    );
  });

  it("uses one refresh request for concurrent 401 responses and retries both requests", async () => {
    setAuthTokens({ accessToken: "expired-token", refreshToken: "refresh-token" });
    let refreshCalls = 0;
    const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
      if (input === `${apiUrl}/auth/refresh`) {
        refreshCalls += 1;
        expect(init?.body).toBe(JSON.stringify({ refreshToken: "refresh-token" }));
        expect(new Headers(init?.headers).get("Content-Type")).toBe("application/json");
        return jsonResponse({
          code: 0,
          message: "ok",
          data: { accessToken: "fresh-token", refreshToken: "next-refresh-token" },
        });
      }

      const authorization = (init?.headers as Record<string, string>).Authorization;
      if (authorization === "Bearer expired-token") {
        return jsonResponse({ code: 40101, message: "expired", data: null }, 401);
      }

      return jsonResponse({ code: 0, message: "ok", data: { authorization } });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      Promise.all([apiClient("/profile"), apiClient("/interviews")]),
    ).resolves.toEqual([
      { authorization: "Bearer fresh-token" },
      { authorization: "Bearer fresh-token" },
    ]);
    expect(refreshCalls).toBe(1);
  });

  it("clears the access token and sends the browser to auth when refresh fails", async () => {
    setAccessToken("expired-token");
    const replace = vi.fn();
    vi.stubGlobal("window", { location: { replace } });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string) => {
        if (input === `${apiUrl}/auth/refresh`) {
          return jsonResponse({ code: 40101, message: "expired", data: null }, 401);
        }
        return jsonResponse({ code: 40101, message: "expired", data: null }, 401);
      }),
    );

    await expect(apiClient("/profile")).rejects.toBeInstanceOf(ApiError);
    expect(replace).toHaveBeenCalledWith("/auth");
  });
});
