import { createRef } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import ResumeUpload from "./ResumeUpload";

describe("ResumeUpload", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("exposes an explicit file-dialog trigger instead of requiring a global DOM query", () => {
    const ref = createRef<{ openFileDialog: () => void }>();
    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
        <ResumeUpload ref={ref as never} />
      </QueryClientProvider>,
    );
    const input = container.querySelector("input[type=file]") as HTMLInputElement;
    const click = vi.spyOn(input, "click");

    ref.current?.openFileDialog();

    expect(click).toHaveBeenCalledOnce();
  });

  it("renders an upload error without leaking a rejected mutation promise", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ code: 50000, message: "upload failed", data: null }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    )));
    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
        <ResumeUpload />
      </QueryClientProvider>,
    );
    const input = container.querySelector("input[type=file]") as HTMLInputElement;

    await userEvent.upload(input, new File(["%PDF"], "resume.pdf", { type: "application/pdf" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("upload failed");
  });
});
