import { test, expect } from "./fixtures";

test("permanent item delete, journal tombstone, and activity delete", async ({
  page,
}, info) => {
  await page.goto("/app/library");
  await page.getByRole("button", { name: "New Note", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill("Private scrap");
  await page.getByRole("button", { name: "Create Note", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/library\/(?!new)[^/]+$/);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete permanently", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/library$/);
  await expect(page.getByText("Private scrap", { exact: true })).toHaveCount(0);
  await page.screenshot({
    path: info.outputPath("item-deleted.png"),
    fullPage: true,
  });

  await page.goto("/app/journal");
  await page.locator("#capture-text").fill("A line that should not return");
  await page.getByRole("button", { name: "Capture moment", exact: true }).click();
  await expect(page.getByText("A line that should not return")).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete entry", exact: true }).click();
  await expect(page.getByText("A line that should not return")).toHaveCount(0);
  await page.reload();
  await expect(page.getByText("A line that should not return")).toHaveCount(0);

  await page.goto("/app/today");
  await page.getByRole("button", { name: "Save check-in", exact: true }).click();
  await page.goto("/app/journal");
  await expect(page.getByRole("button", { name: "Delete activity", exact: true })).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete activity", exact: true }).click();
  await expect(page.getByRole("button", { name: "Delete activity", exact: true })).toHaveCount(0);
  await page.screenshot({
    path: info.outputPath("journal-deleted.png"),
    fullPage: true,
  });
});
