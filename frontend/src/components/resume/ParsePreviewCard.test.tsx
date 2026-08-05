import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ResumeDetail } from "@/lib/api/resume";
import ParsePreviewCard from "./ParsePreviewCard";

const resume: ResumeDetail = {
  id: 7,
  fileName: "mira-resume.pdf",
  fileSize: 1024,
  pageCount: 1,
  parseStatus: "success",
  isDefault: true,
  createdAt: "2026-07-31T12:00:00Z",
  downloadUrl: null,
  parsedJson: {
    basics: { name: "Mira" },
    education: [],
    experience: [],
    projects: [],
    skills: ["Java"],
  },
};

describe("ParsePreviewCard", () => {
  it("portals the dialog to body so transformed dashboard cards cannot clip it", () => {
    const host = document.createElement("section");
    document.body.appendChild(host);

    render(<ParsePreviewCard resume={resume} onClose={() => {}} />, {
      container: host,
    });

    expect(screen.getByRole("dialog", { name: "简历解析预览" }).parentElement).toBe(
      document.body,
    );
    host.remove();
  });

  it("closes with Escape or a backdrop click but not a content click", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ParsePreviewCard resume={resume} onClose={onClose} />);

    await user.click(screen.getByText("Mira"));
    expect(onClose).not.toHaveBeenCalled();

    await user.click(screen.getByRole("dialog", { name: "简历解析预览" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
