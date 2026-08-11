import { afterEach, describe, expect, it, vi } from "vitest";
import { createPractice, getPracticeResult } from "./practice";

function okResponse(data: unknown): Response {
  return new Response(JSON.stringify({ code: 0, message: "ok", data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("practice API", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates a one-question practice under the source interview", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      okResponse({ practiceSessionId: 56, runtimeToken: "practice-runtime-token" }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(createPractice("12", 34)).resolves.toEqual({
      practiceSessionId: 56,
      runtimeToken: "practice-runtime-token",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8080/api/v1/interviews/12/questions/34/retry",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("reads the isolated source-versus-current result", async () => {
    const result = {
      status: "ready",
      question: "如何定位一次线上性能问题？",
      source: {
        answer: "旧回答",
        score: 68,
        referenceAnswer: "参考",
        suggestions: ["补充数据"],
      },
      current: {
        answer: "新回答",
        score: 82,
        referenceAnswer: "参考",
        suggestions: ["保持结构"],
      },
      scoreDelta: 14,
    } as const;
    const fetchMock = vi.fn().mockResolvedValue(okResponse(result));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getPracticeResult("56")).resolves.toEqual(result);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8080/api/v1/interviews/56/practice-result",
      expect.any(Object),
    );
  });
});
