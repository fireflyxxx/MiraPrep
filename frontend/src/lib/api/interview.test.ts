import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createInterview,
  getInterviewStatus,
  pollInterviewUntilSettled,
  type CreateInterviewInput,
  type InterviewStatusResponse,
} from "./interview";

function okResponse(data: unknown): Response {
  return new Response(JSON.stringify({ code: 0, message: "ok", data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

const pending: InterviewStatusResponse = {
  sessionId: 42,
  status: "created",
  outlineStatus: "pending",
  questionCount: 0,
};

describe("interview API", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates an interview with the frozen T-030 request contract", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      okResponse({ sessionId: 42, outlineStatus: "pending" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const input: CreateInterviewInput = {
      resumeId: 7,
      jobDirection: "frontend",
      jobTitle: "前端工程师",
      jdText: "负责 React 性能优化",
      difficulty: "medium",
      types: ["technical", "hr"],
      durationMin: 30 as const,
      customRequirements: "重点考察系统设计",
      interviewerStyle: "balanced",
      voiceEnabled: true,
    };

    await expect(createInterview(input)).resolves.toEqual({
      sessionId: 42,
      outlineStatus: "pending",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8080/api/v1/interviews",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(input),
      }),
    );
  });

  it("reads the current outline status for the created session", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse(pending));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getInterviewStatus(42)).resolves.toEqual(pending);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8080/api/v1/interviews/42/status",
      expect.any(Object),
    );
  });

  it("polls until the outline is ready", async () => {
    const states: InterviewStatusResponse[] = [
      pending,
      { ...pending, outlineStatus: "ready", questionCount: 8 },
    ];

    await expect(
      pollInterviewUntilSettled(42, {
        intervalMs: 0,
        maxAttempts: 3,
        getStatus: async () => states.shift()!,
      }),
    ).resolves.toMatchObject({ outlineStatus: "ready", questionCount: 8 });
  });

  it("stops immediately when outline generation fails", async () => {
    const failed = { ...pending, outlineStatus: "failed" as const };

    await expect(
      pollInterviewUntilSettled(42, {
        intervalMs: 0,
        getStatus: async () => failed,
      }),
    ).resolves.toEqual(failed);
  });

  it("aborts an in-flight poll without making another status request", async () => {
    const controller = new AbortController();
    const getStatus = vi.fn(async () => {
      controller.abort();
      return pending;
    });

    await expect(
      pollInterviewUntilSettled(42, {
        intervalMs: 0,
        signal: controller.signal,
        getStatus,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(getStatus).toHaveBeenCalledTimes(1);
  });
});
