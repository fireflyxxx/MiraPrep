import { afterEach, describe, expect, it, vi } from "vitest";
import { getMe, login, register, sendVerificationCode } from "./auth";
import { clearAuthTokens } from "./auth-token";
import { ApiError } from "./types";

const apiUrl = "http://localhost:8080/api/v1";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("auth API", () => {
  afterEach(() => {
    clearAuthTokens();
    vi.unstubAllGlobals();
  });

  it("registers by posting the credentials and verification code", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ code: 0, message: "ok", data: { accessToken: "a", refreshToken: "r", user: {} } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const input = { email: "mira@example.com", password: "strongpass", nickname: "Mira", code: "123456" };
    await register(input);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${apiUrl}/auth/register`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual(input);
  });

  it("requests a verification code for the register scene", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ code: 0, message: "ok", data: {} }));
    vi.stubGlobal("fetch", fetchMock);

    await sendVerificationCode("mira@example.com");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${apiUrl}/auth/send-code`);
    expect(JSON.parse(init.body)).toEqual({ email: "mira@example.com", scene: "register" });
  });

  it("does not attempt a token refresh when login credentials are rejected", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ code: 40101, message: "invalid credentials", data: null }, 401),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(login({ email: "mira@example.com", password: "wrongpass" })).rejects.toBeInstanceOf(ApiError);
    // skipAuthRefresh keeps a bad-password 401 from triggering the refresh/redirect loop.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls.every(([url]) => url !== `${apiUrl}/auth/refresh`)).toBe(true);
  });

  it("unwraps the envelope for the current user", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        code: 0,
        message: "ok",
        data: { id: 1, email: "mira@example.com", nickname: "Mira", avatar: null, isFirstLogin: false },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(getMe()).resolves.toMatchObject({ id: 1, email: "mira@example.com" });
    expect(fetchMock.mock.calls[0][0]).toBe(`${apiUrl}/users/me`);
  });
});
