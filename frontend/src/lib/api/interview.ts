import { apiClient } from "./client";
import { endpoints } from "./endpoints";
import { pollUntilSettled, type PollOptions } from "./poll";

const POLL_INTERVAL_MS = 1_500;
const MAX_POLL_ATTEMPTS = 80;

export type InterviewDifficulty = "easy" | "medium" | "hard";
export type InterviewerStyle = "friendly" | "balanced" | "strict";
export type InterviewDuration = 15 | 30 | 45;
export type OutlineStatus = "pending" | "ready" | "failed";

export interface CreateInterviewInput {
  resumeId: number;
  jobDirection: string;
  jobTitle?: string;
  jdText?: string;
  difficulty: InterviewDifficulty;
  types: string[];
  durationMin: InterviewDuration;
  customRequirements?: string;
  interviewerStyle: InterviewerStyle;
  voiceEnabled: boolean;
}

export interface CreateInterviewResponse {
  sessionId: number;
  outlineStatus: OutlineStatus;
  /** T-040 的会话专用令牌；后端运行时交接完成前可能暂缺。 */
  runtimeToken?: string;
}

export interface InterviewStatusResponse {
  sessionId: number;
  status: string;
  outlineStatus: OutlineStatus;
  questionCount: number;
}

export async function createInterview(
  input: CreateInterviewInput,
): Promise<CreateInterviewResponse> {
  return apiClient<CreateInterviewResponse>(endpoints.interviews, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getInterviewStatus(
  sessionId: number,
  signal?: AbortSignal,
): Promise<InterviewStatusResponse> {
  return apiClient<InterviewStatusResponse>(
    `${endpoints.interviews}/${sessionId}/status`,
    { signal },
  );
}

export async function pollInterviewUntilSettled(
  sessionId: number,
  options: PollOptions & {
    getStatus?: (
      sessionId: number,
      signal?: AbortSignal,
    ) => Promise<InterviewStatusResponse>;
  } = {},
): Promise<InterviewStatusResponse> {
  const fetchStatus = options.getStatus ?? getInterviewStatus;
  return pollUntilSettled(
    (signal) => fetchStatus(sessionId, signal),
    (status) => status.outlineStatus === "pending",
    {
      intervalMs: options.intervalMs ?? POLL_INTERVAL_MS,
      maxAttempts: options.maxAttempts ?? MAX_POLL_ATTEMPTS,
      signal: options.signal,
    },
  );
}
