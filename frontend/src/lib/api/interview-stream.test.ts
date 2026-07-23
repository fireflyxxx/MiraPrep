import { afterEach, describe, expect, it, vi } from "vitest";
import {
  endInterviewRuntime,
  clearInterviewRuntimeToken,
  clearInterviewEventCursor,
  getInterviewEventCursor,
  getInterviewRuntimeToken,
  getInterviewMessages,
  storeInterviewRuntimeToken,
  storeInterviewEventCursor,
  streamInterview,
  submitInterviewAnswer,
} from "./interview-stream";

function businessResponse(data: unknown): Response {
  return new Response(JSON.stringify({ code: 0, message: "ok", data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("interview runtime API", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps the session-scoped runtime token across a page refresh", () => {
    storeInterviewRuntimeToken(42, "session-runtime-token");
    expect(getInterviewRuntimeToken(42)).toBe("session-runtime-token");

    clearInterviewRuntimeToken(42);
    expect(getInterviewRuntimeToken(42)).toBeNull();
  });

  it("keeps the SSE cursor separate from persisted message sequence numbers", () => {
    storeInterviewEventCursor(42, 19);
    expect(getInterviewEventCursor(42)).toBe(19);

    clearInterviewEventCursor(42);
    expect(getInterviewEventCursor(42)).toBe(0);
  });

  it("loads persisted messages from Spring in sequence order", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      businessResponse({
        items: [
          {
            role: "interviewer",
            content: "请先介绍一下自己。",
            phase: "self_intro",
            questionId: 11,
            audioUrl: null,
            seq: 3,
            createdAt: "2026-07-24T01:00:00Z",
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(getInterviewMessages(42)).resolves.toMatchObject({
      items: [{ content: "请先介绍一下自己。", seq: 3 }],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8080/api/v1/interviews/42/messages?afterSeq=0",
      expect.any(Object),
    );
  });

  it("submits an idempotent answer with runtime authorization", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ accepted: true }), { status: 202 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      submitInterviewAnswer(
        42,
        { answerId: "answer-123", content: "我的回答", questionId: 11 },
        "runtime-token",
      ),
    ).resolves.toEqual({ accepted: true });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/interviews/42/answer",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer runtime-token",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({
          answerId: "answer-123",
          content: "我的回答",
          questionId: 11,
        }),
      }),
    );
  });

  it("parses fragmented SSE envelopes and resumes after the supplied sequence", async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            'id: 8\nevent: token\ndata: {"type":"token","payload":{"text":"你',
          ),
        );
        controller.enqueue(
          encoder.encode(
            '好","questionId":12,"phase":"SELF_INTRO"},"seq":8}\n\n',
          ),
        );
        controller.enqueue(
          encoder.encode(
            'id: 9\nevent: phase_change\ndata: {"type":"phase_change","payload":{"from":"SELF_INTRO","to":"RESUME_DEEP_DIVE"},"seq":9}\n\n',
          ),
        );
        controller.close();
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(body, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const events: unknown[] = [];

    await streamInterview({
      sessionId: 42,
      runtimeToken: "runtime-token",
      afterSeq: 7,
      signal: new AbortController().signal,
      onEvent: (event) => events.push(event),
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/interviews/42/stream?afterSeq=7",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer runtime-token",
          Accept: "text/event-stream",
        }),
      }),
    );
    expect(events).toEqual([
      {
        type: "token",
        payload: {
          text: "你好",
          questionId: 12,
          phase: "SELF_INTRO",
        },
        seq: 8,
      },
      {
        type: "phase_change",
        payload: { from: "SELF_INTRO", to: "RESUME_DEEP_DIVE" },
        seq: 9,
      },
    ]);
  });

  it("rejects a token envelope whose text field is missing", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            'data: {"type":"token","payload":{},"seq":8}\n\n',
          ),
        );
        controller.close();
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(body, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        }),
      ),
    );

    await expect(
      streamInterview({
        sessionId: 42,
        runtimeToken: "runtime-token",
        afterSeq: 7,
        signal: new AbortController().signal,
        onEvent: vi.fn(),
      }),
    ).rejects.toThrow("实时消息格式不符合约定");
  });

  it("ends the runtime through the authenticated FastAPI endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ accepted: true }), { status: 202 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(endInterviewRuntime(42, "runtime-token")).resolves.toEqual({
      accepted: true,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/interviews/42/end",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
