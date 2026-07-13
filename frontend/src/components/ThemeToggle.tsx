"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useState } from "react";

const themeOptions = [
  { value: "system", label: "跟随系统", Icon: Monitor },
  { value: "light", label: "浅色", Icon: Sun },
  { value: "dark", label: "深色", Icon: Moon },
] as const;

export function ThemeToggle() {
  const { setTheme } = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="切换主题"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="mira-button flex h-9 w-9 items-center justify-center rounded-[10px] border border-border bg-surface text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <Sun className="h-4 w-4 dark:hidden" aria-hidden="true" />
        <Moon className="hidden h-4 w-4 dark:block" aria-hidden="true" />
      </button>

      {open && (
        <div className="animate-mira-soft-pop absolute top-[calc(100%+8px)] right-0 z-50 w-36 rounded-xl border border-border bg-surface p-1.5 shadow-[0_16px_36px_-18px_rgba(10,10,10,.45)]">
          {themeOptions.map(({ value, label, Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setTheme(value);
                setOpen(false);
              }}
              className="mira-button flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
