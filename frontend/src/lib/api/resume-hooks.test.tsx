import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import {
  resumeKeys,
  useDeleteResume,
  useUpdateResume,
  useUploadResume,
  type ResumeListResponse,
} from "./resume";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

function withClient(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

function okResponse(data: unknown): Response {
  return new Response(JSON.stringify({ code: 0, message: "ok", data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function failedResponse(message: string): Response {
  return new Response(JSON.stringify({ code: 50000, message, data: null }), {
    status: 500,
    headers: { "Content-Type": "application/json" },
  });
}

describe("resume mutation feedback", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(toast.error).mockReset();
  });

  it("shows a toast when updating a resume fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(failedResponse("rename failed")));
    const { result } = renderHook(() => useUpdateResume(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync({ id: 7, fileName: "new.pdf" })).rejects.toThrow();
    });

    expect(toast.error).toHaveBeenCalledWith("rename failed");
  });

  it("shows a toast when deleting a resume fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(failedResponse("delete failed")));
    const { result } = renderHook(() => useDeleteResume(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync(7)).rejects.toThrow();
    });

    expect(toast.error).toHaveBeenCalledWith("delete failed");
  });

  it("optimistically inserts the upload and resolves with the settled detail", async () => {
    const summary = {
      id: 7,
      fileName: "resume.pdf",
      fileSize: 1024,
      pageCount: null,
      parseStatus: "pending",
      isDefault: false,
      createdAt: "2026-07-15T00:00:00Z",
    };
    const settled = { ...summary, parseStatus: "success", parsedJson: null, downloadUrl: null };
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) => {
        if (init?.method === "POST") return Promise.resolve(okResponse(summary)); // upload
        if (url.includes("page=")) return Promise.resolve(okResponse({ items: [summary], total: 1, page: 1, size: 20 }));
        return Promise.resolve(okResponse(settled)); // getResume during poll
      }),
    );
    const client = new QueryClient();
    const { result } = renderHook(() => useUploadResume(), { wrapper: withClient(client) });

    await act(async () => {
      const detail = await result.current.mutateAsync({
        file: new File(["%PDF"], "resume.pdf", { type: "application/pdf" }),
      });
      expect(detail.parseStatus).toBe("success");
    });

    const list = client.getQueryData<ResumeListResponse>(resumeKeys.list());
    expect(list?.items[0].id).toBe(7);
    expect(list?.items[0].parseStatus).toBe("success");
    expect(list?.total).toBe(1);
  });
});
