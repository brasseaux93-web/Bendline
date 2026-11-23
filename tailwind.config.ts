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
        bg: "rgb(var(--bg) / <alpha-value>)",
        card: "rgb(var(--card) / <alpha-value>)",
        border: "rgb(var(--border) / <alpha-value>)",
        primary: "rgb(var(--primary) / <alpha-value>)",
        success: "rgb(var(--success) / <alpha-value>)",
        error: "rgb(var(--error) / <alpha-value>)",
        muted: "rgb(var(--muted) / <alpha-value>)",
        ink: {
          DEFAULT: "rgb(var(--ink) / <alpha-value>)",
          primary: "rgb(var(--ink) / <alpha-value>)",
          secondary: "rgb(var(--muted) / <alpha-value>)",
          muted: "rgb(var(--muted) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "rgb(var(--accent) / <alpha-value>)",
          amber: "rgb(var(--primary) / <alpha-value>)",
          cyan: "rgb(var(--accent) / <alpha-value>)",
          emerald: "rgb(var(--success) / <alpha-value>)",
          crimson: "rgb(var(--error) / <alpha-value>)",
        },
        canvas: "rgb(var(--bg-canvas) / <alpha-value>)",
        surface: "rgb(var(--bg-surface) / <alpha-value>)",
        elevated: "rgb(var(--bg-elevated) / <alpha-value>)",
        glass: "rgb(var(--bg-glass) / <alpha-value>)",
        line: {
          subtle: "rgb(var(--border-subtle) / <alpha-value>)",
          strong: "rgb(var(--border-strong) / <alpha-value>)",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
        display: ["var(--font-display)", "Georgia", "serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      fontSize: {
        hero: ["clamp(2.125rem, 4.8vw, 3.5rem)", { lineHeight: "1.05", letterSpacing: "-0.032em", fontWeight: "650" }],
        h1: ["clamp(1.5rem, 2.8vw, 2.125rem)", { lineHeight: "1.15", letterSpacing: "-0.024em", fontWeight: "600" }],
        h2: ["1.25rem", { lineHeight: "1.28", letterSpacing: "-0.015em", fontWeight: "600" }],
        h3: ["1.0625rem", { lineHeight: "1.35", letterSpacing: "-0.01em", fontWeight: "600" }],
        body: ["1rem", { lineHeight: "1.55" }],
        caption: ["0.8125rem", { lineHeight: "1.4", letterSpacing: "0.005em", fontWeight: "500" }],
      },
      borderRadius: { card: "16px", pill: "9999px" },
      boxShadow: {
        1: "var(--shadow-1)",
        2: "var(--shadow-2)",
        3: "var(--shadow-3)",
        glow: "var(--shadow-glow)",
      },
      transitionTimingFunction: { "out-expo": "cubic-bezier(0.16, 1, 0.3, 1)" },
    },
  },
  plugins: [],
};

export default config;
