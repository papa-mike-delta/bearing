import { test, expect } from "./fixtures";

test.use({ storageState: { cookies: [], origins: [] } });

test("landing sections and app CTA resolve", async ({ page }) => {
  await page.goto("/");
  for (const name of ["Features", "Connections", "Philosophy"]) {
    const link = page.getByRole("link", { name, exact: true }).first();
    const target = await link.getAttribute("href");
    await link.click();
    await expect(page.locator(target!)).toBeInViewport();
  }
  await page.getByRole("link", { name: "Open app", exact: true }).last().click();
  await expect(page).toHaveURL(/\/login$/);
});
