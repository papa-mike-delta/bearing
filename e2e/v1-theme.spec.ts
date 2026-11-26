import { expect, test } from "./fixtures";

for (const base of ["radix", "base", "aria"]) {
  test(`${base} dialogs close with their visible Close button and Escape`, async ({ page }) => {
    await page.goto("/app/settings");
    const input = `:root { --bearing-base: ${base}; } .dark { --bearing-base: ${base}; }`;
    await page.getByRole("textbox", { name: "Import theme", exact: true }).fill(input);
    await page.getByRole("button", { name: "Import theme", exact: true }).click();
    await expect(page.getByRole("button", { name: "Quick Capture", exact: true }))
      .toHaveAttribute("data-theme-base", base);
    await page.getByRole("button", { name: "Quick Capture", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(dialog).toBeHidden();
    await page.getByRole("button", { name: "Quick Capture", exact: true }).click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });
}
