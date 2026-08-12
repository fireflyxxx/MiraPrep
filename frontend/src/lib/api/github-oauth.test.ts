import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { consumeGitHubState, githubClientId, startGitHubLogin } from "./github-oauth";

const realLocation = window.location;
let location: { origin: string; href: string };

beforeEach(() => {
  location = { origin: "http://localhost:3000", href: "" };
  Object.defineProperty(window, "location", { value: location, writable: true, configurable: true });
  window.sessionStorage.clear();
  vi.stubEnv("NEXT_PUBLIC_GITHUB_CLIENT_ID", "Iv1.testclientid");
});

afterEach(() => {
  Object.defineProperty(window, "location", { value: realLocation, writable: true, configurable: true });
  vi.unstubAllEnvs();
});

describe("startGitHubLogin", () => {
  it("sends the browser to GitHub with the scope and redirect this app expects", () => {
    startGitHubLogin();

    const url = new URL(location.href);
    expect(url.origin + url.pathname).toBe("https://github.com/login/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("Iv1.testclientid");
    expect(url.searchParams.get("scope")).toBe("user:email");
    expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:3000/auth/callback/github");
  });

  it("stores the state it puts in the URL so the callback can prove it started the flow", () => {
    startGitHubLogin();

    const state = new URL(location.href).searchParams.get("state");
    expect(state).toBeTruthy();
    expect(window.sessionStorage.getItem("miraprep.github.oauth.state")).toBe(state);
  });

  it("uses a fresh state every time instead of a reusable constant", () => {
    startGitHubLogin();
    const first = new URL(location.href).searchParams.get("state");
    startGitHubLogin();
    const second = new URL(location.href).searchParams.get("state");

    expect(second).not.toBe(first);
  });

  it("does nothing when no client id is configured", () => {
    vi.stubEnv("NEXT_PUBLIC_GITHUB_CLIENT_ID", "");

    expect(githubClientId()).toBeUndefined();
    startGitHubLogin();

    expect(location.href).toBe("");
    expect(window.sessionStorage.getItem("miraprep.github.oauth.state")).toBeNull();
  });
});

describe("consumeGitHubState", () => {
  it("hands back the stored state exactly once so a state cannot be replayed", () => {
    startGitHubLogin();
    const state = new URL(location.href).searchParams.get("state");

    expect(consumeGitHubState()).toBe(state);
    expect(consumeGitHubState()).toBeNull();
  });
});
