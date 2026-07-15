import { z } from "zod";
import {
  clearAuthTokens,
  getAccessToken,
  getRefreshToken,
  setAuthTokens,
} from "./auth-token";
import { endpoints, toApiUrl } from "./endpoints";
import { ApiError, type ApiResponse } from "./types";

type ApiRequestOptions = RequestInit & { skipAuthRefresh?: boolean };
type ApiErrorHandler = (error: ApiError) => void;

const apiEnvelopeSchema = z.object({
  code: z.number(),
  message: z.string().default("请求失败"),
  data: z.unknown(),
});

let refreshPromise: Promise<void> | null = null;
let apiErrorHandler: ApiErrorHandler | null = null;

/** T-006 接入正式 toast 前，由页面或应用外壳注册统一错误提示。 */
export function setApiErrorHandler(handler: ApiErrorHandler | null): void {
  apiErrorHandler = handler;
}

function reportApiError(error: ApiError): void {
  apiErrorHandler?.(error);
}

function buildHeaders(options: RequestInit, includeAccessToken: boolean): HeadersInit {
  const headers: Record<string, string> = {};
  new Headers(options.headers).forEach((value, key) => {
    headers[key] = value;
  });

  if (options.body && !(options.body instanceof FormData)) {
    const contentType = Object.keys(headers).find(
      (key) => key.toLowerCase() === "content-type",
    );
    if (!contentType) {
      headers["Content-Type"] = "application/json";
    }
  }

  if (includeAccessToken) {
    const existingAuthorization = Object.keys(headers).find(
      (key) => key.toLowerCase() === "authorization",
    );
    if (existingAuthorization) {
      delete headers[existingAuthorization];
    }

    const token = getAccessToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  return headers;
}

async function parseEnvelope(response: Response): Promise<ApiResponse<unknown>> {
  const parsed = apiEnvelopeSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new ApiError(response.status || 500, "服务返回了无法识别的数据", response.status);
  }

  return parsed.data;
}

function toApiError(envelope: ApiResponse<unknown>, status: number): ApiError {
  return new ApiError(envelope.code, envelope.message, status);
}

export async function refreshAccessToken(): Promise<void> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const refreshToken = getRefreshToken();
      if (!refreshToken) {
        throw new ApiError(40102, "登录已过期", 401);
      }

      const body = JSON.stringify({ refreshToken });
      const response = await fetch(toApiUrl(endpoints.refresh), {
        method: "POST",
        credentials: "include",
        headers: buildHeaders({ body }, false),
        body,
      });
      const envelope = await parseEnvelope(response);

      if (!response.ok || envelope.code !== 0) {
        throw toApiError(envelope, response.status);
      }

      const data = envelope.data as { accessToken?: unknown; refreshToken?: unknown };
      if (
        typeof data?.accessToken !== "string" ||
        !data.accessToken ||
        typeof data?.refreshToken !== "string" ||
        !data.refreshToken
      ) {
        throw new ApiError(40101, "刷新登录状态失败", response.status);
      }
      setAuthTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken });
    })().finally(() => {
      refreshPromise = null;
    });
  }

  return refreshPromise;
}

function redirectToAuth(): void {
  if (typeof window !== "undefined") {
    window.location.replace("/auth");
  }
}

async function request<T>(
  path: string,
  options: ApiRequestOptions,
  hasRetriedAfterRefresh: boolean,
): Promise<T> {
  const { skipAuthRefresh = false, ...requestOptions } = options;
  const response = await fetch(toApiUrl(path), {
    ...requestOptions,
    credentials: requestOptions.credentials ?? "include",
    headers: buildHeaders(requestOptions, true),
  });
  if (response.status === 204) {
    return undefined as T;
  }
  const envelope = await parseEnvelope(response);

  if (
    response.status === 401 &&
    !skipAuthRefresh &&
    !hasRetriedAfterRefresh &&
    path !== endpoints.refresh
  ) {
    try {
      await refreshAccessToken();
      return request<T>(path, options, true);
    } catch (error) {
      clearAuthTokens();
      redirectToAuth();
      throw error;
    }
  }

  if (!response.ok || envelope.code !== 0) {
    throw toApiError(envelope, response.status);
  }

  return envelope.data as T;
}

/**
 * 业务接口的唯一请求入口：自动补齐地址、登录凭证、统一响应解包和 401 刷新。
 */
export async function apiClient<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  try {
    return await request<T>(path, options, false);
  } catch (error) {
    if (error instanceof ApiError) {
      reportApiError(error);
    }
    throw error;
  }
}
