import { apiClient } from "./client";
import { aiStreamUrl, endpoints } from "./endpoints";

const runtimeTokenKeyPrefix = "miraprep.interview-runtime-token.";
const eventCursorKeyPrefix = "miraprep.interview-event-cursor.";

export type InterviewPhase =
  | "GREETING"
  | "SELF_INTRO"
  | "RESUME_DEEP_DIVE"
  | "DOMAIN_ASSESSMENT"
  | "BEHAVIORAL"
  | "CANDIDATE_QA"
  | "CLOSING";

export interface InterviewMessage {
  role: "interviewer" | "candidate";
  content: string;
  phase: string;
  questionId: string | number | null;
  audioUrl: string | null;
  seq: number;
  createdAt: string;
}

export interface InterviewMessagesResponse {
  items: InterviewMessage[];
}

export interface InterviewAnswerInput {
  answerId: string;
  content: string;
  questionId?: string | number | null;
}

export type InterviewStreamEvent =
  | {
      type: "token";
      payload: {
        text: string;
        questionId?: string | number | null;
        phase?: string;
      };
      seq: number;
    }
  | {
      type: "phase_change";
      payload: { from?: string; to: string };
      seq: number;
    }
  | {
      type: "interview_end";
      payload: { reason?: string };
      seq: number;
    }
  | {
      type: "error";
      payload: { message?: string; detail?: string };
      seq: number;
    };

interface StreamInterviewOptions {
  sessionId: number;
  runtimeToken: string;
  afterSeq: number;
  signal: AbortSignal;
  onEvent: (event: InterviewStreamEvent) => void;
}

export class InterviewRuntimeError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "InterviewRuntimeError";
  }
}

function runtimeTokenKey(sessionId: number): string {
  return `${runtimeTokenKeyPrefix}${sessionId}`;
}

export function storeInterviewRuntimeToken(
  sessionId: number,
  runtimeToken: string,
): void {
  if (typeof window === "undefined" || !runtimeToken) return;
  try {
    window.sessionStorage.setItem(runtimeTokenKey(sessionId), runtimeToken);
  } catch {
    // 浏览器禁用会话存储时由页面显示明确错误，不降级为使用账户 JWT。
  }
}

export function getInterviewRuntimeToken(sessionId: number): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(runtimeTokenKey(sessionId));
  } catch {
    return null;
  }
}

export function clearInterviewRuntimeToken(sessionId: number): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(runtimeTokenKey(sessionId));
  } catch {
    // 清理失败不阻塞离开已结束的会话。
  }
}

function eventCursorKey(sessionId: number): string {
  return `${eventCursorKeyPrefix}${sessionId}`;
}

export function storeInterviewEventCursor(sessionId: number, seq: number): void {
  if (typeof window === "undefined" || !Number.isInteger(seq) || seq < 0) return;
  try {
    window.sessionStorage.setItem(eventCursorKey(sessionId), String(seq));
  } catch {
    // 无法持久化时仍可在当前页面内依靠内存游标重连。
  }
}

export function getInterviewEventCursor(sessionId: number): number {
  if (typeof window === "undefined") return 0;
  try {
    const value = Number(window.sessionStorage.getItem(eventCursorKey(sessionId)));
    return Number.isSafeInteger(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

export function clearInterviewEventCursor(sessionId: number): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(eventCursorKey(sessionId));
  } catch {
    // 清理失败不阻塞离开已结束的会话。
  }
}

export function getInterviewMessages(
  sessionId: number,
  afterSeq = 0,
  signal?: AbortSignal,
): Promise<InterviewMessagesResponse> {
  return apiClient<InterviewMessagesResponse>(
    `${endpoints.interviews}/${sessionId}/messages?afterSeq=${afterSeq}`,
    { signal },
  );
}

async function runtimeRequest<T>(
  path: string,
  runtimeToken: string,
  options: RequestInit,
): Promise<T> {
  const response = await fetch(`${aiStreamUrl}${path}`, {
    ...options,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${runtimeToken}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });

  if (!response.ok) {
    let message = `面试实时服务请求失败（HTTP ${response.status}）`;
    try {
      const body = (await response.json()) as { detail?: unknown };
      if (typeof body.detail === "string" && body.detail) {
        message = body.detail;
      }
    } catch {
      // 非 JSON 错误响应保留可读的 HTTP 状态。
    }
    throw new InterviewRuntimeError(message, response.status);
  }

  return (await response.json()) as T;
}

export function submitInterviewAnswer(
  sessionId: number,
  input: InterviewAnswerInput,
  runtimeToken: string,
  signal?: AbortSignal,
): Promise<{ accepted: boolean }> {
  return runtimeRequest(`/interviews/${sessionId}/answer`, runtimeToken, {
    method: "POST",
    body: JSON.stringify(input),
    signal,
  });
}

export function endInterviewRuntime(
  sessionId: number,
  runtimeToken: string,
  signal?: AbortSignal,
): Promise<{ accepted: boolean }> {
  return runtimeRequest(`/interviews/${sessionId}/end`, runtimeToken, {
    method: "POST",
    signal,
  });
}

function isStreamEvent(value: unknown): value is InterviewStreamEvent {
  if (!value || typeof value !== "object") return false;
  const candidate = value as {
    type?: unknown;
    payload?: unknown;
    seq?: unknown;
  };
  if (
    typeof candidate.payload !== "object" ||
    candidate.payload === null ||
    typeof candidate.seq !== "number" ||
    !Number.isInteger(candidate.seq) ||
    candidate.seq <= 0
  ) {
    return false;
  }

  const payload = candidate.payload as Record<string, unknown>;
  switch (candidate.type) {
    case "token":
      return (
        typeof payload.text === "string" &&
        (payload.phase === undefined || typeof payload.phase === "string") &&
        (payload.questionId === undefined ||
          payload.questionId === null ||
          typeof payload.questionId === "string" ||
          typeof payload.questionId === "number")
      );
    case "phase_change":
      return (
        typeof payload.to === "string" &&
        (payload.from === undefined || typeof payload.from === "string")
      );
    case "interview_end":
      return payload.reason === undefined || typeof payload.reason === "string";
    case "error":
      return (
        (payload.message === undefined || typeof payload.message === "string") &&
        (payload.detail === undefined || typeof payload.detail === "string")
      );
    default:
      return false;
  }
}

function parseSseBlock(block: string): InterviewStreamEvent | null {
  const data = block
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n");
  if (!data) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    throw new InterviewRuntimeError("实时消息不是合法 JSON", 502);
  }
  if (!isStreamEvent(parsed)) {
    throw new InterviewRuntimeError("实时消息格式不符合约定", 502);
  }
  return parsed;
}

export async function streamInterview({
  sessionId,
  runtimeToken,
  afterSeq,
  signal,
  onEvent,
}: StreamInterviewOptions): Promise<void> {
  const response = await fetch(
    `${aiStreamUrl}/interviews/${sessionId}/stream?afterSeq=${afterSeq}`,
    {
      method: "GET",
      headers: {
        Accept: "text/event-stream",
        Authorization: `Bearer ${runtimeToken}`,
      },
      cache: "no-store",
      signal,
    },
  );

  if (!response.ok) {
    throw new InterviewRuntimeError(
      `面试实时连接失败（HTTP ${response.status}）`,
      response.status,
    );
  }
  if (!response.body) {
    throw new InterviewRuntimeError("浏览器未收到实时消息流", 502);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (!signal.aborted) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() ?? "";

    for (const block of blocks) {
      const event = parseSseBlock(block);
      if (event) onEvent(event);
    }

    if (done) {
      const event = parseSseBlock(buffer);
      if (event) onEvent(event);
      return;
    }
  }
}
