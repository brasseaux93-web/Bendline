import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const PUBLIC_ROUTES = [
  "/",
  "/auth",
  "/onboarding",
  "/accuracy",
  "/legal/terms",
  "/legal/privacy",
  "/offline",
];

const AUTH_ROUTES = [
  "/",
  "/practice",
  "/mock",
  "/draw",
  "/draw/admin",
  "/tools",
  "/navigate",
  "/progress",
  "/admin/review",
  "/account",
];

async function setTheme(page: Page, theme: "dark" | "light") {
  await page.evaluate((t) => {
    window.localStorage.setItem("bendline_theme_v1", t);
    document.documentElement.dataset.theme = t;
    document.documentElement.classList.toggle("dark", t === "dark");
  }, theme);
  await page.waitForTimeout(80);
}

async function assertRouteA11yAndTokens(page: Page, route: string, theme: "dark" | "light") {
  await setTheme(page, theme);

  const axeResults = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();

  expect(
    axeResults.violations,
    `Axe WCAG AA violations on ${route} (${theme} theme): ${JSON.stringify(
      axeResults.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        description: v.description,
        nodes: v.nodes.slice(0, 3).map((n) => n.target),
      })),
      null,
      2
    )}`
  ).toEqual([]);

  const designCheck = await page.evaluate(() => {
    const bodyStyle = getComputedStyle(document.body);
    const visiblePrimaryBtns = Array.from(
      document.querySelectorAll(".btn-primary")
    ).filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });

    return {
      tabular: bodyStyle.fontVariantNumeric,
      primaryCount: visiblePrimaryBtns.length,
    };
  });

  expect(designCheck.tabular).toContain("tabular-nums");
  expect(designCheck.primaryCount).toBeLessThanOrEqual(1);
}

test.describe("Prompt 11 Audit: axe-core (dark & light), reduced motion, design tokens", () => {
  test("all public routes pass axe-core WCAG AA in dark and light themes", async ({
    page,
  }) => {
    for (const route of PUBLIC_ROUTES) {
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      await assertRouteA11yAndTokens(page, route, "dark");
      await assertRouteA11yAndTokens(page, route, "light");
    }
  });

  test("all authenticated app routes pass axe-core WCAG AA in dark and light themes", async ({
    page,
  }) => {
    await page.goto("/auth");
    await page.getByRole("button", { name: "Preview HomeBento" }).click();
    await page.waitForURL("**/");

    for (const route of AUTH_ROUTES) {
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      await assertRouteA11yAndTokens(page, route, "dark");
      await assertRouteA11yAndTokens(page, route, "light");
    }
  });

  test("respects prefers-reduced-motion and in-app reduced-motion toggle", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/auth");
    await page.getByRole("button", { name: "Preview HomeBento" }).click();
    await page.waitForURL("**/");

    await expect(page.locator("html")).toHaveAttribute(
      "data-reduce-motion",
      "false"
    );

    await page.getByRole("button", { name: "Toggle reduced motion" }).click();
    await expect(page.locator("html")).toHaveAttribute(
      "data-reduce-motion",
      "true"
    );

    const transitionDuration = await page
      .locator(".btn-primary")
      .first()
      .evaluate((el) => getComputedStyle(el).transitionDuration);
    expect(parseFloat(transitionDuration)).toBeLessThanOrEqual(0.001);
  });
});
