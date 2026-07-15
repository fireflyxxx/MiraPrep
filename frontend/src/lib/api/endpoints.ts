const DEFAULT_API_BASE_URL = "http://localhost:8080/api/v1";
const DEFAULT_AI_STREAM_URL = "http://localhost:8000";

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

/** Spring Boot 业务接口地址；可由 `.env.local` 覆盖。 */
export const apiBaseUrl = trimTrailingSlash(
  process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL,
);

/** FastAPI 的 SSE/WebSocket 地址；仅供实时面试和语音功能使用。 */
export const aiStreamUrl = trimTrailingSlash(
  process.env.NEXT_PUBLIC_AI_STREAM_URL ?? DEFAULT_AI_STREAM_URL,
);

export const endpoints = {
  health: "/health",
  login: "/auth/login",
  register: "/auth/register",
  refresh: "/auth/refresh",
  sendCode: "/auth/send-code",
  me: "/users/me",
  myProfile: "/users/me/profile",
  resumes: "/resumes",
} as const;

export function toApiUrl(path: string): string {
  if (/^https?:\/\//.test(path)) {
    return path;
  }

  return `${apiBaseUrl}/${path.replace(/^\/+/, "")}`;
}
