import { expect, test } from "@playwright/test";
import { SEED_DRILL_QUESTIONS } from "../src/lib/domain/seed-catalog";

test.describe("Progress Bento & Public /accuracy Ledger", () => {
  test("public /accuracy page renders verified counts, licensed %, median review age, error rate, and jurisdiction dates without auth", async ({
    page,
  }) => {
    await page.goto("/accuracy");

    await expect(
      page.getByRole("heading", {
        name: /Public Content Review & Jurisdiction Verification/i,
      })
    ).toBeVisible();

    await expect(page.getByTestId("accuracy-published-count")).toContainText("30");
    await expect(page.getByTestId("accuracy-licensed-pct")).toContainText("100%");
    await expect(page.getByTestId("accuracy-median-age")).toContainText(/\d+d/);
    await expect(page.getByTestId("accuracy-error-rate")).toContainText("0");

    await expect(page.getByTestId("accuracy-jur-TX")).toBeVisible();
    await expect(page.getByTestId("accuracy-jur-CA")).toBeVisible();
    await expect(page.getByTestId("accuracy-jur-CO")).toBeVisible();
  });

  test("question review stamp + report error + Progress Bento + Fix This CTA targeted drill flow", async ({
    page,
  }) => {
    await page.goto("/practice");
    const previewBtn = page.getByRole("button", { name: "Preview HomeBento" });
    await previewBtn.waitFor({ state: "visible", timeout: 5000 });
    await previewBtn.click();
    await page.waitForURL("**/");
    await page.goto("/practice");

    // 1. Verify "Reviewed [month year] — [edition]" and Report error controls
    await expect(page.getByText("Reviewed November 2026 — IPC 2021")).toBeVisible();

    await page
      .getByRole("button", { name: /Report error on question/i })
      .click();
    await page
      .getByLabel("Issue details")
      .fill("Double-check trap seal code reference.");
    await page.getByRole("button", { name: "Submit Report" }).click();
    await expect(
      page.getByText(/Error report submitted for licensed reviewer inspection\./i)
    ).toBeVisible();

    // 2. Deliberately choose an incorrect option using deterministic seed lookup
    const stemParagraph = page.locator("article p.text-h3");
    await expect(stemParagraph).toBeVisible();
    const stemText = ((await stemParagraph.textContent()) ?? "").trim();

    const matchedQ = SEED_DRILL_QUESTIONS.find((q) => q.stem === stemText);
    expect(matchedQ).toBeDefined();

    const wrongIndex = (matchedQ!.correct_index + 1) % matchedQ!.options.length;
    await page.getByRole("radio").nth(wrongIndex).click();
    await page.getByRole("button", { name: "Check Answer" }).click();

    await expect(page.getByText("Incorrect").first()).toBeVisible();

    // Tag mistake explicitly as 'arithmetic' for Progress Mistake Profile
    await page.getByRole("button", { name: "arithmetic", exact: true }).click();

    // 3. Navigate to /progress and verify all 6 Bento sections
    await page.goto("/progress");
    await expect(
      page.getByRole("heading", { name: "Exam Readiness" })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Mock Exam Trend" })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /Mistake Profile by/i })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Topic Mastery vs Blueprint" })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Drawing-Lab Scores" })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Median Lookup Time per Chapter" })
    ).toBeVisible();

    // Trigger server readiness recomputation check
    await page.getByRole("button", { name: "Recompute Readiness" }).click();
    await expect(page.getByText(/Verified via server_function/i)).toBeVisible();

    // Verify mistake card shows 1 miss on arithmetic & click "Fix this" CTA
    const arithCard = page.getByTestId("mistake-card-arithmetic");
    await expect(arithCard).toContainText("1 miss");

    await page.getByTestId("fix-error-arithmetic").click();
    await page.waitForURL("**/practice?errorType=arithmetic");
    await expect(page.getByText(/Targeted Fix Drill:/i)).toBeVisible();
    await expect(page.getByText("Reviewed November 2026 — IPC 2021")).toBeVisible();
  });
});
