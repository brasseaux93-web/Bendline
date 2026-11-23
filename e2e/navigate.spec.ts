import { expect, test, type Page } from "@playwright/test";
import { SEED_OUTLINE_NODES } from "../src/lib/nav/seed-outline";

async function enterPreviewSession(page: Page) {
  await page.goto("/navigate");
  const previewBtn = page.getByRole("button", { name: "Preview HomeBento" });
  if (await previewBtn.isVisible().catch(() => false)) {
    await previewBtn.click();
    await page.waitForURL("**/");
    await page.goto("/navigate");
  }
}

function findNodeByCueText(cueText: string) {
  return SEED_OUTLINE_NODES.find(
    (n) =>
      n.code_family === "IPC" &&
      n.edition === "2021" &&
      n.node_kind !== "chapter" &&
      n.lookup_cues.some((cue) => cueText.includes(cue))
  );
}

test.describe("Open-Book Navigation Trainer (/navigate)", () => {
  test("gates out closed-book jurisdictions (TX), enables for open-book (CO), runs drills, verifies tabbing notice, and surfaces chapter medians on /progress", async ({
    page,
  }) => {
    await enterPreviewSession(page);

    // 1. Default jurisdiction is TX (open_book=false): navigation trainer must be disabled
    await expect(
      page.getByRole("heading", {
        name: /Navigation Trainer Disabled for Closed-Book Exam/i,
      })
    ).toBeVisible();

    // Check closed-book indicator on /progress
    await page.goto("/progress");
    await expect(page.getByText(/Closed-Book Jurisdiction \(TX\)/i)).toBeVisible();

    // 2. Switch to Colorado (open_book=true) from /navigate
    await page.goto("/navigate");
    await page
      .getByRole("button", {
        name: /Switch to Colorado Journeyman Plumber \(Open Book\)/i,
      })
      .click();

    await expect(
      page.getByRole("heading", { name: /Code Navigation & Tabbing Lab/i })
    ).toBeVisible();
    await expect(page.getByTestId("nav-foreground-timer")).toBeVisible();

    // 3. Complete a "Where Is It?" drill (pick wrong node once, then target node -> Resolved in 2 tries)
    const promptHeadingText =
      (await page.locator("#nav-prompt-heading").textContent()) ?? "";
    const targetWhere = findNodeByCueText(promptHeadingText);
    expect(targetWhere).toBeDefined();

    const wrongCandidate = SEED_OUTLINE_NODES.find(
      (n) =>
        n.code_family === "IPC" &&
        n.edition === "2021" &&
        n.node_kind !== "chapter" &&
        n.id !== targetWhere!.id
    )!;

    await page
      .getByRole("button", {
        name: new RegExp(wrongCandidate.code_ref.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      })
      .click();
    await expect(page.getByText(/does not contain this requirement/i)).toBeVisible();

    await page
      .getByRole("button", {
        name: new RegExp(targetWhere!.code_ref.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      })
      .click();
    await expect(page.getByText(/Resolved in 2 tries/i)).toBeVisible();

    // 4. Switch to "Timed Find" and solve first-try cleanly within target time
    await page.getByRole("tab", { name: "Timed Find" }).click();
    await expect(page.getByText(/Target ≤/)).toBeVisible();
    const timedHeading =
      (await page.locator("#nav-prompt-heading").textContent()) ?? "";
    const targetTimed = findNodeByCueText(timedHeading);
    expect(targetTimed).toBeDefined();

    await page
      .getByRole("button", {
        name: new RegExp(targetTimed!.code_ref.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      })
      .click();
    await expect(page.getByText("First-Try Accurate")).toBeVisible();
    await expect(page.getByText("Under Target Time")).toBeVisible();

    // 5. Switch to "Index-Term Choice" and solve first-try using RadioCard
    await page.getByRole("tab", { name: "Index-Term Choice" }).click();
    const promptHeadingLocator = page.locator("#nav-prompt-heading");
    await expect(promptHeadingLocator).toContainText(
      "Which index heading leads to"
    );
    const indexHeading = (await promptHeadingLocator.textContent()) ?? "";
    const matchedIndexNode = SEED_OUTLINE_NODES.find(
      (n) =>
        n.code_family === "IPC" &&
        n.edition === "2021" &&
        n.node_kind !== "chapter" &&
        indexHeading.includes(n.code_ref)
    );
    expect(matchedIndexNode).toBeDefined();

    await page
      .getByRole("radio", { name: new RegExp(matchedIndexNode!.index_terms[0]) })
      .click();
    await expect(page.getByText("First-Try Accurate")).toBeVisible();

    // 6. Inspect Tabbing Guide & mandatory state-bulletin verification notice
    await page.getByRole("tab", { name: "Tabbing Guide" }).click();
    await expect(
      page.getByRole("heading", {
        name: "Verify Permitted Tabs in Your State Bulletin",
      })
    ).toBeVisible();
    await expect(
      page.getByText("Verify against your adopted code. Not legal advice.")
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Open CO Exam Bulletin/i })
    ).toBeVisible();

    // 7. Surface median lookup time per chapter on /progress
    await page.goto("/progress");
    await expect(
      page.getByRole("heading", { name: "Median Lookup Time per Chapter" })
    ).toBeVisible();

    const targetChapterCard = page.getByTestId(
      `chapter-lookup-card-${targetTimed!.parent_id}`
    );
    await expect(targetChapterCard).toBeVisible();
    await expect(targetChapterCard).not.toContainText("Median: —");
    await expect(targetChapterCard).toContainText(/\d+(\.\d+)?(ms|s)/);
  });
});
