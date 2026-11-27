import { test, expect } from "./fixtures";

test("settings saves a name, changes the password, and lists receipts", async ({
  page,
  context,
}, info) => {
  await page.goto("/app/settings");
  await page.getByLabel("Display name", { exact: true }).fill("Pat Example");
  await page.getByRole("button", { name: "Save name", exact: true }).click();
  await expect(page.getByText("Name saved.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Set up two-factor", exact: true }).click();
  await expect(page.getByText("Manual key", { exact: false })).toBeVisible();
  await page.screenshot({
    path: info.outputPath("account-name-2fa.png"),
    fullPage: true,
  });

  await page
    .getByLabel("Current password for password change", { exact: true })
    .fill("Password123");
  await page.getByLabel("New password", { exact: true }).fill("NewPassword123");
  await page.getByRole("button", { name: "Save password", exact: true }).click();
  await expect(page.getByText("Password saved.", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "v1.account.password" })).toBeVisible();
  await page.screenshot({
    path: info.outputPath("ledger-list.png"),
    fullPage: true,
  });

  await context.clearCookies();
  await page.goto("/login");
  await page.locator('input[type="email"]').fill("demo@gmail.com");
  await page.locator('input[type="password"]').fill("NewPassword123");
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/app\//);
});
