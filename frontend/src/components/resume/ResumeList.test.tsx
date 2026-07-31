import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ResumeList from "./ResumeList";

const state = vi.hoisted(() => ({ detail: "loading" as "loading" | "error" }));

vi.mock("@/lib/api/resume", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/resume")>();
  return {
    ...actual,
    useResumeLibrary: () => ({
      data: {
        items: [
          {
            id: 9,
            fileName: "resume.pdf",
            fileSize: 1024,
            pageCount: 1,
            parseStatus: "success",
            isDefault: true,
            createdAt: "2026-07-31T12:00:00Z",
          },
        ],
        total: 1,
        page: 1,
        size: 20,
      },
      isPending: false,
      isError: false,
    }),
    useResumeDetail: (id: number | null) => ({
      data: undefined,
      isPending: id !== null && state.detail === "loading",
      isError: id !== null && state.detail === "error",
      refetch: vi.fn(),
    }),
    useUpdateResume: () => ({ mutateAsync: vi.fn() }),
    useDeleteResume: () => ({ mutateAsync: vi.fn() }),
  };
});

vi.mock("./ResumeCard", () => ({
  default: ({ onView }: { onView: (id: number) => void }) => (
    <button type="button" onClick={() => onView(9)}>
      查看简历
    </button>
  ),
}));

describe("ResumeList overlays", () => {
  beforeEach(() => {
    state.detail = "loading";
  });

  it("portals the loading overlay outside the transformed resume section", async () => {
    render(<ResumeList mode="dashboard" emptyMessage="empty" />);
    await userEvent.click(screen.getByRole("button", { name: "查看简历" }));

    expect(screen.getByLabelText("简历详情加载中").parentElement).toBe(document.body);
  });

  it("portals the error dialog and still allows it to close", async () => {
    state.detail = "error";
    render(<ResumeList mode="dashboard" emptyMessage="empty" />);
    await userEvent.click(screen.getByRole("button", { name: "查看简历" }));

    const dialog = screen.getByRole("dialog", { name: "简历详情加载失败" });
    expect(dialog.parentElement).toBe(document.body);
    await userEvent.click(screen.getByRole("button", { name: "关闭" }));
    expect(dialog).not.toBeInTheDocument();
  });
});
