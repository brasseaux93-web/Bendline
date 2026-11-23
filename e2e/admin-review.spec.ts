import { expect, test } from "@playwright/test";

test.describe("Admin Review Studio (/admin/review)", () => {
  test("enforces hard gates on calc item, approves to published, invalidates approval on new version, reviews drawing exercise, manages reviewer role, and exports CSV", async ({
    page,
  }) => {
    await page.goto("/admin/review");
    const previewBtn = page.getByRole("button", { name: "Preview HomeBento" });
    if (await previewBtn.isVisible().catch(() => false)) {
      await previewBtn.click();
      await page.waitForURL("**/");
      await page.goto("/admin/review");
    }

    await expect(
      page.getByRole("heading", { name: "Technical Review Studio" })
    ).toBeVisible();

    // 1. Select the calc draft question
    const calcQueueBtn = page.getByTestId(
      "queue-item-88000000-0000-4800-8800-000000000001"
    );
    await calcQueueBtn.click();
    await expect(page.getByTestId("active-item-status")).toContainText("draft");

    // Try approving without checking calc_independently_verified -> hard-gate error alert from API
    await page.getByRole("button", { name: "Submit Review Verdict" }).click();
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: /calc_independently_verified/i })
    ).toBeVisible();

    // Check calc_independently_verified and submit Approve -> moves to published
    await page.locator("#calc-independently-verified").check();
    await page.getByLabel("Reviewer Comments (required for Revise)").fill("Calc verified cleanly.");
    await page.getByRole("button", { name: "Submit Review Verdict" }).click();
    await expect(
      page.getByText(/Saved "approve" -> status "published"/i)
    ).toBeVisible();

    // 2. Switch filter to Published, bump new version -> resets status to draft (v2)
    await page.getByLabel("Queue Status").selectOption("published");
    await page
      .getByTestId("queue-item-88000000-0000-4800-8800-000000000001")
      .click();
    await page
      .getByRole("button", { name: /Publish New Version \(Invalidates Approval\)/i })
      .click();
    await page
      .getByRole("button", { name: /Save Version v2 & Invalidate Approval/i })
      .click();
    await expect(
      page.getByText(/Created v2 — prior approval invalidated \(status reset to "draft"\)/i)
    ).toBeVisible();

    // 3. Filter to Drawing Exercises and submit Revise verdict
    await page.getByLabel("Item Kind").selectOption("drawing_exercise");
    await page
      .getByTestId("queue-item-eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1")
      .click();
    await page.getByRole("radio", { name: "Revise → Return" }).click();
    await page
      .getByLabel("Reviewer Comments (required for Revise)")
      .fill("Clarify wet-vent pipe diameter constraint.");
    await page.getByRole("button", { name: "Submit Review Verdict" }).click();
    await expect(
      page.getByText(/Saved "revise" -> status "revise"/i)
    ).toBeVisible();

    // 4. Manage Reviewer Roles tab
    await page.getByRole("tab", { name: /Reviewer Roles/i }).click();
    const candidateRow = page.getByTestId(
      "role-row-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9"
    );
    await candidateRow.getByLabel("Role").selectOption("reviewer");
    await candidateRow.getByLabel("Trade License No.").fill("CO-MP-77412");
    await candidateRow.getByRole("button", { name: "Save Role" }).click();
    await expect(
      page.getByText(/Updated Devon Brooks \(Candidate\) -> role "reviewer"/i)
    ).toBeVisible();

    // 5. Verify CSV export endpoint streams valid CSV with our recorded verdicts
    const csvResp = await page.request.get("/api/admin/review/export");
    expect(csvResp.status()).toBe(200);
    expect(csvResp.headers()["content-type"]).toContain("text/csv");
    const csvText = await csvResp.text();
    expect(csvText).toContain("Calc verified cleanly.");
    expect(csvText).toContain("Clarify wet-vent pipe diameter constraint.");
  });
});
