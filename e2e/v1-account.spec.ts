import { test, expect } from "./fixtures";

test("settings deletes the account after password and typed confirmation", async ({
  page,
}, info) => {
  await page.goto("/app/settings");
  await expect(
    page.getByRole("heading", { name: "Delete account", exact: true }),
  ).toBeVisible();
  const remove = page.getByRole("button", { name: "Delete account", exact: true });
  await expect(remove).toBeDisabled();
  await page.getByLabel("Current password", { exact: true }).fill("wrong-password");
  await page
    .getByLabel("Type DELETE MY ACCOUNT", { exact: true })
    .fill("DELETE MY ACCOUNT");
  await expect(remove).toBeEnabled();
  await page.screenshot({
    path: info.outputPath("account-delete-confirm.png"),
    fullPage: true,
  });
  await remove.click();
  await expect(page.getByText("Password does not match", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/app\/settings$/);
  await page.screenshot({
    path: info.outputPath("account-delete-rejected.png"),
    fullPage: true,
  });

  await page.getByLabel("Current password", { exact: true }).fill("Password123");
  await remove.click();
  await expect(page).toHaveURL(/\/login$/);
  await page.locator('input[type="email"]').fill("demo@gmail.com");
  await page.locator('input[type="password"]').fill("Password123");
  await page.locator('form button[type="submit"]').click();
  await expect(page.getByText(/Invalid email or password/i)).toBeVisible();
  await page.screenshot({
    path: info.outputPath("account-deleted-login.png"),
    fullPage: true,
  });
});
