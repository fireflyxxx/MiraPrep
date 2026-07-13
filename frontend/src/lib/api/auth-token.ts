"use client";

import { useCallback, useSyncExternalStore } from "react";

const ACCESS_TOKEN_STORAGE_KEY = "miraprep.access-token";

let accessToken: string | null = null;
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

export function clearAccessToken(): void {
  accessToken = null;
  if (isBrowser()) {
    persistAccessToken(null);
  }
  notifyListeners();
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
  clearAccessToken();
  if (isBrowser()) {
    window.location.replace("/auth");
  }
}
