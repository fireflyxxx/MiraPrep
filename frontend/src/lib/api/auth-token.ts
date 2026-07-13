"use client";

import { useCallback, useSyncExternalStore } from "react";

const ACCESS_TOKEN_STORAGE_KEY = "miraprep.access-token";
const REFRESH_TOKEN_STORAGE_KEY = "miraprep.refresh-token";
// ponytail: T-010 目前只接受请求体中的 refresh token。正式上线前，后端必须改为
// httpOnly + Secure + SameSite cookie，随后删除这里的 refresh-token localStorage 存储。

let accessToken: string | null = null;
let refreshToken: string | null = null;
const listeners = new Set<() => void>();

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function notifyListeners(): void {
  listeners.forEach((listener) => listener());
}

function readStoredAccessToken(): string | null {
  try {
    return window.localStorage?.getItem(ACCESS_TOKEN_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

function persistAccessToken(token: string | null): void {
  try {
    if (token) {
      window.localStorage?.setItem(ACCESS_TOKEN_STORAGE_KEY, token);
    } else {
      window.localStorage?.removeItem(ACCESS_TOKEN_STORAGE_KEY);
    }
  } catch {
    // 隐私模式或嵌入式 WebView 禁用存储时，继续使用内存中的短期 token。
  }
}

function readStoredRefreshToken(): string | null {
  try {
    return window.localStorage?.getItem(REFRESH_TOKEN_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

function persistRefreshToken(token: string | null): void {
  try {
    if (token) {
      window.localStorage?.setItem(REFRESH_TOKEN_STORAGE_KEY, token);
    } else {
      window.localStorage?.removeItem(REFRESH_TOKEN_STORAGE_KEY);
    }
  } catch {
    // 隐私模式或嵌入式 WebView 禁用存储时，继续使用内存中的短期 token。
  }
}

/**
 * access token 先缓存在内存中；本地开发阶段同步到 localStorage，页面刷新后仍可继续调试。
 * 生产认证接入后应由 httpOnly refresh cookie 续期，避免把长期凭证暴露给 JavaScript。
 */
export function getAccessToken(): string | null {
  if (accessToken || !isBrowser()) {
    return accessToken;
  }

  accessToken = readStoredAccessToken();
  return accessToken;
}

export function setAccessToken(token: string): void {
  accessToken = token;
  if (isBrowser()) {
    persistAccessToken(token);
  }
  notifyListeners();
}

export function getRefreshToken(): string | null {
  if (refreshToken || !isBrowser()) {
    return refreshToken;
  }

  refreshToken = readStoredRefreshToken();
  return refreshToken;
}

/** 保存认证接口返回的一对凭证，避免刷新页面后丢失续期能力。 */
export function setAuthTokens(tokens: { accessToken: string; refreshToken: string }): void {
  refreshToken = tokens.refreshToken;
  if (isBrowser()) {
    persistRefreshToken(tokens.refreshToken);
  }
  setAccessToken(tokens.accessToken);
}

export function clearAccessToken(): void {
  accessToken = null;
  if (isBrowser()) {
    persistAccessToken(null);
  }
  notifyListeners();
}

export function clearAuthTokens(): void {
  refreshToken = null;
  if (isBrowser()) {
    persistRefreshToken(null);
  }
  clearAccessToken();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** 供客户端组件读取和更新当前 access token。 */
export function useAuthToken() {
  const token = useSyncExternalStore(subscribe, getAccessToken, () => null);

  return {
    token,
    setToken: useCallback((nextToken: string) => setAccessToken(nextToken), []),
    clearToken: useCallback(() => clearAccessToken(), []),
  };
}

/** 退出登录时清理 token，并回到认证页。 */
export function logout(): void {
  clearAuthTokens();
  if (isBrowser()) {
    window.location.replace("/auth");
  }
}
