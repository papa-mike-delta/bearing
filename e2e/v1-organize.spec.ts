import { test, expect } from "./fixtures";

test("project status, label rename, and an existing review open in the composer", async ({
  page,
}, info) => {
  await page.goto("/app/projects");
  await page.getByRole("button", { name: "New Project", exact: true }).click();
  await page.getByLabel("Project name", { exact: true }).fill("Garden");
  await page.getByRole("combobox", { name: "Status", exact: true }).selectOption("archived");
  await page.getByRole("button", { name: "Create Project", exact: true }).click();
  await expect(page.getByText("archived", { exact: true }).first()).toBeVisible();
  await page.screenshot({
    path: info.outputPath("project-archived.png"),
    fullPage: true,
  });

  await page.goto("/app/settings");
  await page.getByLabel("Name", { exact: true }).fill("Season");
  await page.getByRole("combobox", { name: "Kind", exact: true }).selectOption("area");
  await page.getByRole("button", { name: "Create label", exact: true }).click();
  await expect(page.getByLabel("Rename area Season", { exact: true })).toBeVisible();
  await page.getByLabel("Rename area Season", { exact: true }).fill("Harvest");
  await page.getByRole("button", { name: "Rename", exact: true }).click();
  await expect(page.getByLabel("Rename area Harvest", { exact: true })).toBeVisible();
  await page.screenshot({
    path: info.outputPath("area-renamed.png"),
    fullPage: true,
  });

  await page.goto("/app/reviews");
  await page.getByLabel("Wins", { exact: true }).fill("Opened the existing reflection");
  await page.getByLabel("Review date", { exact: true }).fill("2026-11-02");
  await page.getByRole("button", { name: "Save reflection", exact: true }).click();
  await page.goto("/app/reviews");
  await page.getByLabel("Review date", { exact: true }).fill("2026-11-02");
  await expect(page.getByLabel("Wins", { exact: true })).toHaveValue(
    "Opened the existing reflection",
  );
  await expect(
    page.getByRole("button", { name: "Update reflection", exact: true }),
  ).toBeVisible();
});
