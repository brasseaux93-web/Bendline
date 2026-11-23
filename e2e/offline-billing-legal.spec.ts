import { expect, test } from "@playwright/test";

test.describe("Offline PWA Practice, Outbox Replay, Billing & Legal", () => {
  test("airplane-mode practice -> offline cold reload -> offline drawing draft -> online outbox replay", async ({
    page,
    context,
  }) => {
    await page.goto("/auth");
    const previewBtn = page.getByRole("button", { name: "Preview HomeBento" });
    await previewBtn.waitFor({ state: "visible", timeout: 5000 });
    await previewBtn.click();
    await page.waitForURL("**/");

    // Ensure Serwist SW is active and controlling this client BEFORE priming offline routes
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    if (!(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)))) {
      await page.reload({ waitUntil: "networkidle" });
    }
    await expect
      .poll(() =>
        page.evaluate(() => Boolean(navigator.serviceWorker.controller))
      )
      .toBe(true);

    // Visit /draw and /practice while controlled by SW so pages + RSC payloads are cached
    await page.goto("/draw");
    await expect(page.getByTestId("iso-canvas-svg")).toBeVisible();
    await page.goto("/practice");
    await expect(
      page.getByRole("heading", { name: /Daily 12/i })
    ).toBeVisible();
    await page.waitForLoadState("networkidle");

    await expect(page.getByTestId("sync-status-badge")).toContainText("Synced");

    // Go completely offline (airplane mode)
    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));
    await expect(page.getByTestId("sync-status-badge")).toContainText("Offline");

    // Answer a practice question offline
    await page.getByRole("radio").first().click();
    await page.getByRole("button", { name: "Check Answer" }).click();
    await expect(page.getByText(/Reviewed /i)).toBeVisible();
    await expect(page.getByTestId("sync-status-badge")).toContainText(
      /Offline · 1 pending/i
    );

    // Cold reload /practice while STILL offline (verifies Serwist app shell + cachedSession + questionPack)
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { name: /Daily 12/i })
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("sync-status-badge")).toContainText(
      /Offline · 1 pending/i
    );

    // Navigate offline to /draw and create a pipe run offline (queues drawing_draft outbox)
    await page.getByRole("link", { name: "Draw", exact: true }).click();
    await expect(page.getByTestId("iso-canvas-svg")).toBeVisible();
    await page.getByRole("button", { name: "List View" }).click();
    await page.getByRole("button", { name: /Add 2-unit x DWV Run/i }).click();
    await expect(page.getByTestId("sync-status-badge")).toContainText(
      /Offline · 2 pending/i
    );

    // Reconnect and wait for automatic transactional outbox replay
    const attemptReplayPromise = page.waitForResponse(
      (res) =>
        res.url().includes("/api/practice/attempt") &&
        res.request().method() === "POST"
    );
    const draftReplayPromise = page.waitForResponse(
      (res) =>
        res.url().includes("/api/draw/drafts") &&
        res.request().method() === "POST"
    );

    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));

    const [attemptRes, draftRes] = await Promise.all([
      attemptReplayPromise,
      draftReplayPromise,
    ]);
    expect(attemptRes.status()).toBe(200);
    expect(draftRes.status()).toBe(200);

    await expect(page.getByTestId("sync-status-badge")).toContainText("Synced", {
      timeout: 10_000,
    });
  });

  test("legal pages show non-affiliation notice and /account handles Stripe plans, export, and confirmed delete", async ({
    page,
  }) => {
    const disclaimer =
      "Not affiliated with any code body, exam vendor, or state board.";

    await page.goto("/legal/terms");
    await expect(page.getByText(disclaimer).first()).toBeVisible();

    await page.goto("/legal/privacy");
    await expect(page.getByText(disclaimer).first()).toBeVisible();

    await page.goto("/auth");
    await page.getByRole("button", { name: "Preview HomeBento" }).click();
    await page.waitForURL("**/");

    await page.goto("/account");
    await expect(page.getByTestId("plan-card-free")).toBeVisible();
    await expect(page.getByTestId("plan-card-pro_exam_pass")).toBeVisible();
    await expect(page.getByTestId("plan-card-pro_monthly")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Manage Billing \(Customer Portal\)/i })
    ).toBeVisible();

    // Verify JSON export action completes and displays confirmation
    await page.getByRole("button", { name: /Export My Data \(JSON\)/i }).click();
    await expect(
      page.getByText(/Downloaded JSON export/i)
    ).toBeVisible();

    // Open confirmed deletion dialog and delete account cleanly
    await page.getByRole("button", { name: "Delete Account" }).click();
    await page.getByLabel("Confirmation phrase").fill("DELETE");
    await page.getByRole("button", { name: "Permanently Delete" }).click();

    await expect(
      page.getByRole("heading", { name: "Sign in to Bendline" })
    ).toBeVisible({ timeout: 10_000 });
  });
});
