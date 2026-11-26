import { test as setup, expect } from "@playwright/test";
setup("sign into the V1 workflow", async ({ page }) => {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill("demo@gmail.com");
  await page.locator('input[type="password"]').fill("Password123");
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/app\/today$/);
  await expect(
    page.getByRole("heading", { name: "Today", exact: true }),
  ).toBeVisible();
  await page.context().storageState({ path: "e2e/.auth/workflow.json" });
});
