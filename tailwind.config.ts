import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Core surfaces
        bg: "rgb(var(--bg) / <alpha-value>)",
        card: "rgb(var(--card) / <alpha-value>)",
        canvas: "rgb(var(--bg-canvas) / <alpha-value>)",
        surface: "rgb(var(--bg-surface) / <alpha-value>)",
        elevated: "rgb(var(--bg-elevated) / <alpha-value>)",
        glass: "rgb(var(--bg-glass) / <alpha-value>)",

        // Text (object form supports both text-ink and legacy text-ink-primary)
        ink: {
          DEFAULT: "rgb(var(--ink) / <alpha-value>)",
          primary: "rgb(var(--ink) / <alpha-value>)",
          secondary: "rgb(var(--muted) / <alpha-value>)",
          muted: "rgb(var(--muted) / <alpha-value>)",
        },
        muted: "rgb(var(--muted) / <alpha-value>)",

        // Borders
        border: {
          DEFAULT: "rgb(var(--border) / <alpha-value>)",
          subtle: "rgb(var(--border-subtle) / <alpha-value>)",
          strong: "rgb(var(--border-strong) / <alpha-value>)",
        },

        // Semantic actions & status
        primary: "rgb(var(--primary) / <alpha-value>)",
        accent: {
          DEFAULT: "rgb(var(--accent) / <alpha-value>)",
          // Legacy aliases (prefer primary / accent / success / error going forward)
          amber: "rgb(var(--primary) / <alpha-value>)",
          cyan: "rgb(var(--accent) / <alpha-value>)",
          emerald: "rgb(var(--success) / <alpha-value>)",
          crimson: "rgb(var(--error) / <alpha-value>)",
        },
        success: "rgb(var(--success) / <alpha-value>)",
        error: "rgb(var(--error) / <alpha-value>)",
      },
      fontFamily: {
        sans: [
          "var(--font-inter)",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "sans-serif",
        ],
        mono: [
          "var(--font-geist-mono)",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Monaco",
          "Consolas",
          "monospace",
        ],
      },
      fontSize: {
        hero: [
          "clamp(2rem, 4.5vw, 3.25rem)",
          { lineHeight: "1.08", letterSpacing: "-0.025em", fontWeight: "700" },
        ],
        h1: [
          "clamp(1.5rem, 2.8vw, 2rem)",
          { lineHeight: "1.18", letterSpacing: "-0.02em", fontWeight: "600" },
        ],
        h2: [
          "1.25rem",
          { lineHeight: "1.28", letterSpacing: "-0.015em", fontWeight: "600" },
        ],
        h3: ["1.0625rem", { lineHeight: "1.35", fontWeight: "600" }],
        body: ["1rem", { lineHeight: "1.5" }],
        caption: ["0.75rem", { lineHeight: "1.35", fontWeight: "500" }],
      },
      borderRadius: {
        card: "16px",
        pill: "9999px",
      },
      boxShadow: {
        card: "0 1px 2px rgb(0 0 0 / 0.24), 0 4px 12px rgb(0 0 0 / 0.18)",
        elevated: "0 4px 16px rgb(0 0 0 / 0.32), 0 1px 3px rgb(0 0 0 / 0.2)",
        focus: "0 0 0 2px rgb(var(--bg)), 0 0 0 4px rgb(var(--accent))",
      },
      transitionDuration: {
        fast: "120ms",
        normal: "220ms",
        slow: "300ms",
      },
      transitionTimingFunction: {
        out: "cubic-bezier(0.16, 1, 0.3, 1)",
      },
      spacing: {
        18: "4.5rem",
      },
    },
  },
  plugins: [],
};

export default config;
