import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ResumeCard from "./ResumeCard";
import type { ResumeSummary } from "@/lib/api/resume";

const resume: ResumeSummary = {
  id: 7,
  fileName: "resume.pdf",
  fileSize: 1024,
  pageCount: null,
  parseStatus: "pending",
  isDefault: false,
  createdAt: "2026-07-15T00:00:00Z",
};

function renderCard(overrides: Partial<React.ComponentProps<typeof ResumeCard>> = {}) {
  const props: React.ComponentProps<typeof ResumeCard> = {
    resume,
    mode: "setup",
    onSelect: vi.fn(),
    onView: vi.fn(),
    onRename: vi.fn().mockResolvedValue(undefined),
    onDelete: vi.fn().mockResolvedValue(undefined),
    onSetDefault: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  render(<ResumeCard {...props} />);
  return props;
}

describe("ResumeCard", () => {
  it("does not select a pending resume in setup mode", async () => {
    const props = renderCard();
    await userEvent.click(screen.getByRole("article"));
    expect(props.onSelect).not.toHaveBeenCalled();
    expect(screen.getByText("解析中")).toBeInTheDocument();
  });

  it("closes rename editing when the mutation rejects", async () => {
    const onRename = vi.fn().mockRejectedValue(new Error("rename failed"));
    renderCard({ resume: { ...resume, parseStatus: "success" }, onRename });
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "重命名" }));
    await user.clear(screen.getByLabelText("简历名称"));
    await user.type(screen.getByLabelText("简历名称"), "renamed.pdf");
    await user.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(screen.queryByLabelText("简历名称")).not.toBeInTheDocument());
    expect(onRename).toHaveBeenCalledWith(7, "renamed.pdf");
  });

  it("contains rejected default and delete mutations at the click boundary", async () => {
    const onSetDefault = vi.fn().mockRejectedValue(new Error("default failed"));
    const onDelete = vi.fn().mockRejectedValue(new Error("delete failed"));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderCard({
      resume: { ...resume, parseStatus: "success" },
      onSetDefault,
      onDelete,
    });
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "设为默认" }));
    await user.click(screen.getByRole("button", { name: "删除" }));

    await waitFor(() => {
      expect(onSetDefault).toHaveBeenCalledWith(7);
      expect(onDelete).toHaveBeenCalledWith(7);
    });
  });
});
