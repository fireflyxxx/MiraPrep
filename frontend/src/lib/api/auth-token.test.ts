import { beforeEach, describe, expect, it } from "vitest";
import * as authToken from "./auth-token";

describe("authentication token storage", () => {
  beforeEach(() => {
    window.localStorage.clear();
    authToken.clearAccessToken();
  });

  it("persists both tokens returned after authentication", () => {
    authToken.setAuthTokens({ accessToken: "access-token", refreshToken: "refresh-token" });

    expect(authToken.getAccessToken()).toBe("access-token");
    expect(authToken.getRefreshToken()).toBe("refresh-token");
    expect(window.localStorage.getItem("miraprep.access-token")).toBe("access-token");
    expect(window.localStorage.getItem("miraprep.refresh-token")).toBe("refresh-token");
  });
});
