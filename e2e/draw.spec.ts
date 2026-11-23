import { expect, test, type Page } from "@playwright/test";

async function enterPreviewAndOpenDraw(page: Page) {
  await page.goto("/draw");
  const previewBtn = page.getByRole("button", { name: "Preview HomeBento" });
  if (await previewBtn.isVisible().catch(() => false)) {
    await previewBtn.click();
    await page.waitForURL("**/");
    await page.goto("/draw");
  }
  await expect(page.getByTestId("iso-canvas-svg")).toBeVisible();
}

test.describe("Isometric pipe-drawing lab (/draw)", () => {
  test("draw -> grade workflow using accessible list builder and check button", async ({
    page,
  }) => {
    await enterPreviewAndOpenDraw(page);

    // Switch to accessible form-based list view and add a pipe run
    await page.getByRole("button", { name: "List View" }).click();
    await expect(
      page.getByRole("heading", { name: "Accessible Graph List & Run Builder" })
    ).toBeVisible();

    await page.getByRole("button", { name: /Add 2-unit x DWV Run/i }).click();
    await expect(page.getByText(/Pipe Runs \(1\)/)).toBeVisible();

    // Return to canvas and trigger deterministic rule evaluation
    await page.getByRole("button", { name: "Canvas View" }).click();
    await page.getByRole("button", { name: "Check Drawing" }).click();

    await expect(page.getByText("Deterministic Rule Evaluation")).toBeVisible();
    await expect(page.getByRole("heading", { name: /Score:/i })).toBeVisible();
    await expect(
      page.getByText("Verify against your adopted code. Not legal advice.")
    ).toBeVisible();
  });

  test("keyboard mode moves grid cursor, extends run with Shift+Arrow, and places with Enter", async ({
    page,
  }) => {
    await enterPreviewAndOpenDraw(page);

    const canvas = page.getByTestId("iso-canvas-svg");
    await canvas.focus();

    // Initial cursor on first fixture of sample exercise [-3, 0, 0]
    await expect(page.getByText(/Grid \[-3, 0, 0\]/)).toBeVisible();

    // ArrowRight moves cursor along +X
    await canvas.press("ArrowRight");
    await expect(page.getByText(/Grid \[-2, 0, 0\]/)).toBeVisible();

    // Shift+ArrowRight extends a 2-unit pipe run along +X
    await canvas.press("Shift+ArrowRight");
    await expect(page.getByText(/Grid \[0, 0, 0\]/)).toBeVisible();

    // Select a cleanout fitting and place at cursor via Enter
    await page.getByRole("button", { name: "Cleanout" }).click();
    await canvas.focus();
    await canvas.press("Enter");

    await page.getByRole("button", { name: "List View" }).click();
    await expect(page.getByText(/Pipe Runs \(1\)/)).toBeVisible();
    await expect(page.getByText(/fitting \(cleanout\)/)).toBeVisible();
  });

  test("offline save persists draft mutations to Dexie and restores on reload", async ({
    page,
  }) => {
    await enterPreviewAndOpenDraw(page);

    const canvas = page.getByTestId("iso-canvas-svg");
    await canvas.focus();

    // Simulate going offline before drawing
    await page.context().setOffline(true);

    // Extend pipe run while offline
    await canvas.press("Shift+ArrowRight");
    // Wait for 120ms Dexie debounce + IndexedDB commit
    await page.waitForTimeout(350);

    await page.getByRole("button", { name: "List View" }).click();
    await expect(page.getByText(/Pipe Runs \(1\)/)).toBeVisible();

    // Restore connection to fetch Next.js route shell, then verify Dexie draft restores automatically
    await page.context().setOffline(false);
    await page.reload();

    await expect(
      page.getByText(/Restored saved draft from offline storage \(1 pipe runs\)\./)
    ).toBeVisible();
  });
});
