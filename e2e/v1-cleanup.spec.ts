import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";
async function navigate(page: Page, name: string) {
  await expect(
    page.getByRole("link", { name: /Available offline/ }),
  ).toBeVisible();
  const mobile = page.getByRole("button", {
    name: "Open navigation",
    exact: true,
  });
  if (await mobile.isVisible()) {
    await mobile.click();
    await page
      .getByRole("dialog", { name: "Navigation", exact: true })
      .getByRole("link", { name, exact: true })
      .click();
  } else
    await page
      .getByRole("navigation", { name: "Main navigation", exact: true })
      .getByRole("link", { name, exact: true })
      .click();
}
test("real app entry opens V1, seven types and Me are discoverable without legacy Finance", async ({
  page,
}, info) => {
  await page.goto("/app");
  await expect(page).toHaveURL(/\/app\/today$/);
  await expect(
    page.getByRole("heading", { name: "Today", exact: true }),
  ).toBeVisible();
  await expect(page.locator("main")).not.toContainText(
    /Finance|Income|Expenses|Life Domains/,
  );
  await page.screenshot({
    path: info.outputPath("v1-today.png"),
    fullPage: true,
  });
  await navigate(page, "Library");
  for (const type of [
    "Task",
    "Note",
    "Habit",
    "Event",
    "Goal",
    "Person",
    "Bookmark",
  ])
    await expect(
      page.getByRole("button", { name: `New ${type}`, exact: true }),
    ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: /New (Finance|Contact|Routine|Medication|Journal)/,
    }),
  ).toHaveCount(0);
  await page.screenshot({
    path: info.outputPath("v1-library.png"),
    fullPage: true,
  });
  await navigate(page, "Me");
  await expect(
    page.getByText("Me · your personal reference profile", { exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath("v1-me.png"), fullPage: true });
  await navigate(page, "Reviews");
  await expect(
    page.getByRole("heading", { name: "Reviews", exact: true }),
  ).toBeVisible();
  await navigate(page, "Graph");
  await expect(
    page.getByRole("heading", { name: "Digital Brain", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("v1-graph.png"),
    fullPage: true,
  });
  await navigate(page, "Focus");
  await expect(
    page.getByRole("heading", { name: /Focus/ }).first(),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("v1-focus.png"),
    fullPage: true,
  });
});
test("signed-out deep link returns to its exact V1 route after login", async ({
  page,
  context,
}) => {
  await context.clearCookies();
  await page.goto("/app/journal?date=2026-10-24");
  await expect(page).toHaveURL(/\/login\?next=/);
  await page.locator('input[type="email"]').fill("demo@gmail.com");
  await page.locator('input[type="password"]').fill("Password123");
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/app\/journal\?date=2026-10-24$/);
  await expect(page.getByLabel("Journal date", { exact: true })).toHaveValue(
    "2026-10-24",
  );
});
test("daily weekly and monthly reflections are written through the UI and stay separate from check-ins", async ({
  page,
}, info) => {
  await page.goto("/app/today");
  await page
    .getByRole("button", { name: "Save check-in", exact: true })
    .click();
  await navigate(page, "Reviews");
  for (const period of ["daily", "weekly", "monthly"]) {
    await page
      .getByRole("combobox", { name: "Review period", exact: true })
      .selectOption(period);
    await page.getByLabel("Review date", { exact: true }).fill("2026-10-24");
    await page
      .getByLabel("Wins", { exact: true })
      .fill(`A ${period} pause to notice progress.`);
    await page
      .getByLabel("Challenges", { exact: true })
      .fill("Making time to reflect.");
    await page
      .getByLabel("Priorities · one per line", { exact: true })
      .fill("Take a walk\nCall a friend");
    await page
      .getByRole("button", { name: "Save reflection", exact: true })
      .click();
    await expect(page).toHaveURL(/\/app\/reviews\/[a-z0-9]+$/);
    await expect(
      page.getByText(`A ${period} pause to notice progress.`, { exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByText(`A ${period} pause to notice progress.`, { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("link", {
        name: "All Reviews · write a reflection",
        exact: true,
      })
      .click();
  }
  await page
    .getByRole("combobox", { name: "Review period", exact: true })
    .selectOption("daily");
  await page.getByLabel("Review date", { exact: true }).fill("2026-10-24");
  await expect(page.getByLabel("Wins", { exact: true })).toHaveValue(
    "A daily pause to notice progress.",
  );
  await expect(
    page.getByRole("button", { name: "Update reflection", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("link", { name: "Read saved Review", exact: true }),
  ).toBeVisible();
  const reviews = await (await page.request.get("/api/v1/reviews")).json();
  expect(
    reviews.filter((r: { localDate: string }) => r.localDate === "2026-10-24"),
  ).toHaveLength(3);
  const activity = await (await page.request.get("/api/v1/activities")).json();
  expect(
    activity.filter((a: { kind: string }) => a.kind === "check_in"),
  ).toHaveLength(1);
  await page.screenshot({
    path: info.outputPath("v1-reviews.png"),
    fullPage: true,
  });
});
