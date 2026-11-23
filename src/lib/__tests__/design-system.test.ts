import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  MOTION_DURATION,
  MOTION_SPRING,
  MOTION_VARIANTS,
} from "../motion";

const REQUIRED_TOKENS = [
  "--bg",
  "--card",
  "--ink",
  "--muted",
  "--border",
  "--primary",
  "--accent",
  "--success",
  "--error",
] as const;

describe("Bendline design system and motion tokens", () => {
  it("keeps all interactive motion durations at or below 300ms", () => {
    for (const value of Object.values(MOTION_DURATION)) {
      expect(value).toBeGreaterThan(0);
      expect(value).toBeLessThanOrEqual(0.3);
    }
  });

  it("keeps all spring presets bounded and critically/over-damped enough without overshoot bounce", () => {
    for (const spring of Object.values(MOTION_SPRING)) {
      expect(spring.type).toBe("spring");
      expect(spring.stiffness).toBeGreaterThanOrEqual(200);
      expect(spring.stiffness).toBeLessThanOrEqual(500);
      expect(spring.damping).toBeGreaterThanOrEqual(25);
    }
  });

  it("restricts motion variants to transform and opacity properties only", () => {
    const allowedKeys = new Set(["opacity", "x", "y", "scale", "transition"]);
    const variantGroups = [
      MOTION_VARIANTS.staggerContainer,
      MOTION_VARIANTS.bentoCard,
      MOTION_VARIANTS.stepSlide,
      MOTION_VARIANTS.overlayFade,
    ];

    for (const group of variantGroups) {
      for (const state of Object.values(group)) {
        if (typeof state === "object" && state !== null) {
          for (const key of Object.keys(state)) {
            expect(allowedKeys.has(key)).toBe(true);
          }
        }
      }
    }
  });

  it("defines space-separated RGB tokens in globals.css for both dark default and light themes", () => {
    const css = fs.readFileSync(
      path.resolve(process.cwd(), "src/app/globals.css"),
      "utf8"
    );

    const lightSplit = css.split('html[data-theme="light"]');
    expect(lightSplit.length).toBeGreaterThanOrEqual(2);

    const darkBlock = lightSplit[0];
    const lightBlock = lightSplit[1];

    for (const token of REQUIRED_TOKENS) {
      const darkMatch = darkBlock.match(
        new RegExp(`${token}:\\s*(\\d+\\s+\\d+\\s+\\d+)\\s*;`)
      );
      const lightMatch = lightBlock.match(
        new RegExp(`${token}:\\s*(\\d+\\s+\\d+\\s+\\d+)\\s*;`)
      );
      expect(darkMatch, `Missing dark space-separated RGB token ${token}`).not.toBeNull();
      expect(lightMatch, `Missing light space-separated RGB token ${token}`).not.toBeNull();
    }
  });

  it("wires dark default html attributes, tabular numerals, and MotionConfig at root", () => {
    const layoutSrc = fs.readFileSync(
      path.resolve(process.cwd(), "src/app/layout.tsx"),
      "utf8"
    );
    expect(layoutSrc).toContain('data-theme="dark"');
    expect(layoutSrc).toContain("dark");
    expect(layoutSrc).toContain("tabular-nums");
    expect(layoutSrc).toContain("MotionConfig");
    expect(layoutSrc).toContain('reducedMotion="user"');
  });
});
