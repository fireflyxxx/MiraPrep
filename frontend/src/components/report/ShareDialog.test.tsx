import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import ShareDialog from "./ShareDialog";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

function envelope(data: unknown, code = 0, status = 200) {
  return new Response(JSON.stringify({ code, message: code ? "forbidden" : "ok", data }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const closed = { enabled: false, shareToken: null, shareUrl: null };
const open = {
  enabled: true,
  shareToken: "tok-123",
  shareUrl: "https://miraprep.test/public/reports/tok-123",
};

function renderDialog() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ShareDialog sessionId="108" />
    </QueryClientProvider>,
  );
}

describe("ShareDialog", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(toast.error).mockReset();
    vi.mocked(toast.success).mockReset();
  });

  it("turns sharing on, reveals the link, and copies it", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
      init?.method === "POST" ? envelope(open) : envelope(closed),
    );
    vi.stubGlobal("fetch", fetchMock);

    renderDialog();
    await user.click(screen.getByRole("button", { name: "分享报告" }));

    const toggle = await screen.findByRole("switch", { name: "分享开关" });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(screen.queryByLabelText("分享链接")).not.toBeInTheDocument();

    await user.click(toggle);

    expect(await screen.findByLabelText("分享链接")).toHaveValue(open.shareUrl);
    expect(screen.getByRole("switch", { name: "分享开关" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(post?.[1]?.body).toBe(JSON.stringify({ enabled: true }));

    await user.click(screen.getByRole("button", { name: "复制链接" }));
    expect(writeText).toHaveBeenCalledWith(open.shareUrl);
    expect(toast.success).toHaveBeenCalledWith("链接已复制");
  });

  it("hides the link again once sharing is turned off", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
        init?.method === "POST" ? envelope(closed) : envelope(open),
      ),
    );

    renderDialog();
    await user.click(screen.getByRole("button", { name: "分享报告" }));
    expect(await screen.findByLabelText("分享链接")).toBeInTheDocument();

    const toggle = screen.getByRole("switch", { name: "分享开关" });
    expect(toggle).toHaveTextContent("关闭分享");
    await user.click(toggle);

    expect(await screen.findByText("分享已关闭")).toBeInTheDocument();
    expect(screen.queryByLabelText("分享链接")).not.toBeInTheDocument();
  });

  it("surfaces a backend rejection instead of pretending sharing was enabled", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
        init?.method === "POST" ? envelope(null, 40300, 403) : envelope(closed),
      ),
    );

    renderDialog();
    await user.click(screen.getByRole("button", { name: "分享报告" }));
    await user.click(await screen.findByRole("switch", { name: "分享开关" }));

    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith("forbidden"));
    expect(screen.queryByLabelText("分享链接")).not.toBeInTheDocument();
  });

  it("tells the user to copy manually when the clipboard API is unavailable", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("navigator", { ...navigator, clipboard: undefined });
    vi.stubGlobal("fetch", vi.fn(async () => envelope(open)));

    renderDialog();
    await user.click(screen.getByRole("button", { name: "分享报告" }));
    await user.click(await screen.findByRole("button", { name: "复制链接" }));

    await vi.waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("当前浏览器不支持一键复制，请手动选中链接"),
    );
  });
});
