import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ThemeProvider } from "./theme-provider";

describe("ThemeToggle", () => {
  it("provides an accessible control for changing the color theme", async () => {
    const modulePath = "./ThemeToggle";
    const themeToggleModule = await import(/* @vite-ignore */ modulePath).catch(
      () => undefined,
    );

    expect(themeToggleModule).toBeDefined();

    if (!themeToggleModule) {
      return;
    }

    const { ThemeToggle } = themeToggleModule;
    render(<ThemeToggle />);

    expect(
      screen.getByRole("button", { name: "切换主题" }),
    ).toBeInTheDocument();
  });

  it("applies the chosen theme to the document", async () => {
    const modulePath = "./ThemeToggle";
    const themeToggleModule = await import(/* @vite-ignore */ modulePath).catch(
      () => undefined,
    );

    expect(themeToggleModule).toBeDefined();

    if (!themeToggleModule) {
      return;
    }

    const user = userEvent.setup();
    const { ThemeToggle } = themeToggleModule;
    render(
      <ThemeProvider attribute="data-theme" defaultTheme="light">
        <ThemeToggle />
      </ThemeProvider>,
    );

    await user.click(screen.getByRole("button", { name: "切换主题" }));
    await user.click(screen.getByRole("button", { name: "深色" }));

    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
  });
});
