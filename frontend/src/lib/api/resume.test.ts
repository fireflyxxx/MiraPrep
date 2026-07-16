import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import {
  MAX_RESUME_FILE_SIZE,
  pollResumeUntilSettled,
  resumeKeys,
  selectInitialResumeId,
  updateResumeListCache,
  validateResumeFile,
  type ResumeDetail,
  type ResumeListResponse,
  type ResumeSummary,
} from "./resume";

const pending: ResumeDetail = {
  id: 7,
  fileName: "resume.pdf",
  fileSize: 1024,
  pageCount: null,
  parseStatus: "pending",
  isDefault: true,
  createdAt: "2026-07-15T00:00:00Z",
  parsedJson: null,
  downloadUrl: null,
};

describe("resume API helpers", () => {
  it("rejects unsupported files and files larger than 10 MB before upload", () => {
    expect(validateResumeFile(new File(["x"], "resume.txt", { type: "text/plain" }))).toBe(
      "仅支持 PDF 或 DOCX 文件",
    );
    const tooLarge = new File([new Uint8Array(MAX_RESUME_FILE_SIZE + 1)], "resume.pdf", {
      type: "application/pdf",
    });
    expect(validateResumeFile(tooLarge)).toBe("文件不能超过 10 MB");
  });

  it("polls until parsing succeeds", async () => {
    const states = [pending, { ...pending, parseStatus: "success" as const }];
    const result = await pollResumeUntilSettled(7, {
      intervalMs: 0,
      maxAttempts: 3,
      getResume: async () => states.shift()!,
    });
    expect(result.parseStatus).toBe("success");
  });

  it("stops and returns the failed terminal state", async () => {
    const failed = { ...pending, parseStatus: "failed" as const };
    const result = await pollResumeUntilSettled(7, {
      intervalMs: 0,
      maxAttempts: 3,
      getResume: async () => failed,
    });
    expect(result).toEqual(failed);
  });

  it("returns the last pending state when polling reaches its time limit", async () => {
    await expect(
      pollResumeUntilSettled(7, {
        intervalMs: 0,
        maxAttempts: 2,
        getResume: async () => pending,
      }),
    ).resolves.toEqual(pending);
  });

  it("stops polling once the caller aborts", async () => {
    const controller = new AbortController();
    const getResume = vi.fn(async () => {
      controller.abort();
      return pending;
    });

    await expect(
      pollResumeUntilSettled(7, {
        intervalMs: 0,
        maxAttempts: 5,
        signal: controller.signal,
        getResume,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(getResume).toHaveBeenCalledTimes(1);
  });

  it("updates the one shared list cache after a mutation", () => {
    const queryClient = new QueryClient();
    const first: ResumeSummary = { ...pending };
    const response: ResumeListResponse = { items: [first], total: 1, page: 1, size: 20 };
    queryClient.setQueryData(resumeKeys.list(), response);

    updateResumeListCache(queryClient, { ...first, fileName: "renamed.pdf" });

    expect(queryClient.getQueryData<ResumeListResponse>(resumeKeys.list())?.items[0].fileName).toBe(
      "renamed.pdf",
    );
  });

  it("clears the default flag on the other resumes when one is set as default", () => {
    const queryClient = new QueryClient();
    const items: ResumeSummary[] = [
      { ...pending, id: 1, isDefault: true },
      { ...pending, id: 2, isDefault: false },
    ];
    queryClient.setQueryData(resumeKeys.list(), { items, total: 2, page: 1, size: 20 });

    updateResumeListCache(queryClient, { ...pending, id: 2, isDefault: true });

    const cached = queryClient.getQueryData<ResumeListResponse>(resumeKeys.list());
    expect(cached?.items.find((item) => item.id === 1)?.isDefault).toBe(false);
    expect(cached?.items.find((item) => item.id === 2)?.isDefault).toBe(true);
  });

  it("only preselects successfully parsed resumes", () => {
    const resumes: ResumeSummary[] = [
      { ...pending, id: 1, isDefault: true },
      { ...pending, id: 2, parseStatus: "success", isDefault: false },
    ];
    expect(selectInitialResumeId(resumes, "2")).toBe(2);
    expect(selectInitialResumeId(resumes, "1")).toBe(2);
    expect(selectInitialResumeId(resumes, "999")).toBe(2);
  });
});
