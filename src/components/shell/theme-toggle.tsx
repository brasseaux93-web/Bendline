"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

const STORAGE_THEME_KEY = "bendline_theme_v1";

export type AppTheme = "dark" | "light";

export function applyDocumentTheme(theme: AppTheme): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = theme;
  document.documentElement.classList.toggle("dark", theme === "dark");
}

export function ThemeToggleButton({
  variant = "default",
}: {
  variant?: "default" | "icon";
}) {
  const [theme, setTheme] = useState<AppTheme>("dark");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(STORAGE_THEME_KEY);
    const resolved: AppTheme = saved === "light" ? "light" : "dark";
    setTheme(resolved);
    applyDocumentTheme(resolved);
  }, []);

  function toggleTheme() {
    const next: AppTheme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyDocumentTheme(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_THEME_KEY, next);
    }
  }

  const label =
    theme === "dark" ? "Switch to light theme" : "Switch to dark theme";

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={toggleTheme}
        data-testid="theme-toggle-button"
        aria-label={label}
        title={label}
        aria-pressed={theme === "light"}
        className="inline-flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-ink-secondary transition-colors hover:bg-elevated hover:text-ink-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cyan"
      >
        {theme === "dark" ? (
          <Sun
            className="h-4 w-4 text-accent-amber"
            strokeWidth={1.75}
            aria-hidden="true"
          />
        ) : (
          <Moon
            className="h-4 w-4 text-accent-cyan"
            strokeWidth={1.75}
            aria-hidden="true"
          />
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      data-testid="theme-toggle-button"
      aria-label={label}
      title={label}
      aria-pressed={theme === "light"}
      className="inline-flex min-h-12 min-w-12 items-center justify-center gap-1.5 rounded-xl border border-line-strong bg-elevated/80 px-3 text-caption font-medium text-ink-secondary transition-colors hover:border-accent-cyan/70 hover:text-ink-primary"
    >
      {theme === "dark" ? (
        <Sun
          className="h-4 w-4 text-accent-amber"
          strokeWidth={1.75}
          aria-hidden="true"
        />
      ) : (
        <Moon
          className="h-4 w-4 text-accent-cyan"
          strokeWidth={1.75}
          aria-hidden="true"
        />
      )}
      <span className="hidden md:inline">
        {theme === "dark" ? "Dark" : "Light"}
      </span>
    </button>
  );
}
