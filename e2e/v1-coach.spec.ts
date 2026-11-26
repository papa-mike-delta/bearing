import { PrismaClient } from "@prisma/client";
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
test.skip(
  process.env.BEARING_COACH_MODEL !== "fixture",
  "Use the dedicated local-provider Coach test config",
);
test.beforeEach(async ({ page }) => {
  if (!process.env.TEST_DATABASE_URL)
    throw new Error("Coach tests require a disposable TEST_DATABASE_URL");
  const account = await (await page.request.get("/api/v1/identity")).json();
  const db = new PrismaClient({
    datasourceUrl: process.env.TEST_DATABASE_URL,
  });
  try {
    await db.preference.deleteMany({
      where: { userId: account.userId, key: "coach.rate" },
    });
  } finally {
    await db.$disconnect();
  }
});
async function open(page: Page) {
  await page.goto("/app/coach");
  await expect(
    page.getByRole("heading", { name: "Coach", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("checkbox", { name: /I agree to send this chat/ })
    .check();
}
async function send(page: Page, text: string) {
  await page
    .getByRole("textbox", { name: "Message Coach", exact: true })
    .fill(text);
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Stop response", exact: true }),
  ).toHaveCount(0);
}
async function count(page: Page) {
  return (await (await page.request.get("/api/v1/items")).json()).length;
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () =>
        Math.max(
          document.body.scrollWidth,
          document.documentElement.scrollWidth,
        ) <= innerWidth,
    ),
  ).toBeTruthy();
}
test("Coach retrieves owned evidence and persistent chat resumes after reload", async ({
  page,
}) => {
  const item = (
    await (
      await page.request.post("/api/v1/items", {
        data: {
          type: "note",
          title: `Alex recommendation ${test.info().project.name}`,
          content: "Alex recommended The Odyssey.",
        },
      })
    ).json()
  ).value;
  await open(page);
  await send(page, `Find my Alex recommendation ${test.info().project.name}`);
  await expect(
    page.getByRole("region", { name: "Coach conversation" }),
  ).toContainText("The Odyssey");
  await expect(
    page.getByRole("link", {
      name: `Alex recommendation ${test.info().project.name}`,
      exact: true,
    }),
  ).toHaveAttribute("href", `/app/library/${item.id}`);
  await expect(page).toHaveURL(/conversation=/);
  await page.reload();
  await expect(
    page.getByRole("region", { name: "Coach conversation" }),
  ).toContainText("The Odyssey");
  await noOverflow(page);
  await page.screenshot({
    path: test.info().outputPath("coach-grounded.png"),
    fullPage: true,
  });
});
test("Coach previews, rejects, edits and approves a related batch once", async ({
  page,
}) => {
  await open(page);
  const before = await count(page);
  await send(page, "Organize my weekend");
  await expect(
    page.getByRole("button", { name: "Approve and apply batch", exact: true }),
  ).toBeVisible();
  expect(await count(page)).toBe(before);
  await page
    .getByRole("button", { name: "Reject proposal", exact: true })
    .click();
  await expect(
    page.getByText("Proposed changes · rejected", { exact: true }),
  ).toBeVisible();
  expect(await count(page)).toBe(before);
  await send(page, "Organize another weekend");
  await page
    .getByLabel("Proposed title", { exact: true })
    .first()
    .fill("Edited weekend Task");
  await expect(
    page.getByRole("button", { name: "Approve and apply batch", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Review edited changes", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Approve and apply batch", exact: true })
    .click();
  await expect(
    page.getByText(
      "Batch applied atomically. All views use these same records.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(await count(page)).toBe(before + 2);
  await page.reload();
  await expect(
    page.getByText(
      "Batch applied atomically. All views use these same records.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(await count(page)).toBe(before + 2);
  await noOverflow(page);
});
test("ambiguous references stay unresolved and memory is explicit, editable and deletable", async ({
  page,
}) => {
  const alex = `Alex ${test.info().project.name}`;
  for (let i = 0; i < 2; i++)
    await page.request.post("/api/v1/items", {
      data: { type: "person", title: alex },
    });
  await open(page);
  await send(page, `Ambiguous ${alex}`);
  await expect(
    page.getByRole("button", { name: `Choose ${alex} · item`, exact: true }),
  ).toHaveCount(2);
  await page.reload();
  await expect(
    page.getByRole("button", { name: `Choose ${alex} · item`, exact: true }),
  ).toHaveCount(2);
  await page
    .getByLabel("New preference", { exact: true })
    .fill("Use a concise tone");
  await page
    .getByRole("button", { name: "Remember preference", exact: true })
    .click();
  await expect(page.getByLabel("Preference", { exact: true })).toHaveValue(
    "Use a concise tone",
  );
  await page.getByLabel("Preference", { exact: true }).fill("Use a warm tone");
  await page
    .getByRole("button", { name: "Save preference", exact: true })
    .click();
  await expect(page.getByLabel("Preference", { exact: true })).toHaveValue(
    "Use a warm tone",
  );
  await page
    .getByRole("button", { name: "Forget preference", exact: true })
    .click();
  await expect(page.getByLabel("Preference", { exact: true })).toHaveCount(0);
  await noOverflow(page);
});
test("temporary chat is not saved and a provider failure retains a retryable message", async ({
  page,
}) => {
  await open(page);
  const user = (await (await page.request.get("/api/v1/identity")).json())
    .userId;
  const before = await (
    await page.request.get("/api/v1/coach/conversations", {
      headers: { "X-Bearing-Account": user },
    })
  ).json();
  await page
    .getByRole("checkbox", { name: "Temporary conversation", exact: true })
    .check();
  await send(page, "Temporary hello");
  const after = await (
    await page.request.get("/api/v1/coach/conversations", {
      headers: { "X-Bearing-Account": user },
    })
  ).json();
  expect(after.length).toBe(before.length);
  await page.reload();
  await expect(
    page.getByRole("region", { name: "Coach conversation" }),
  ).not.toContainText("Temporary hello");
  await page
    .getByRole("checkbox", { name: /I agree to send this chat/ })
    .check();
  await send(page, "Provider fails " + test.info().project.name);
  await expect(
    page.getByRole("textbox", { name: "Message Coach", exact: true }),
  ).toHaveValue(/Provider fails/);
  await expect(page.getByText(/FIXTURE_SECRET_ERROR/)).toHaveCount(0);
  await page
    .getByRole("button", { name: "Retry message", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Coach conversation" }),
  ).toContainText("Recovered the same request");
  await expect(
    page
      .getByRole("region", { name: "Coach conversation" })
      .getByText("Provider fails " + test.info().project.name, { exact: true }),
  ).toHaveCount(1);
  await noOverflow(page);
});

test("Coach classifies raw capture into one canonical Task after approval", async ({
  page,
}) => {
  const account = await (await page.request.get("/api/v1/identity")).json(),
    text = `captured thought ${test.info().project.name}`,
    now = new Date().toISOString();
  const moment = (
    await (
      await page.request.post("/api/v1/capture", {
        headers: { "X-Bearing-Account": account.userId },
        data: {
          clientId: crypto.randomUUID(),
          text,
          capturedAt: now,
          occurredAt: now,
          timezone: "UTC",
        },
      })
    ).json()
  ).value;
  await open(page);
  await send(page, `Classify ${text}`);
  await expect(
    page.getByRole("button", { name: "Approve and apply batch", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Approve and apply batch", exact: true })
    .click();
  await expect(
    page.getByText(
      "Batch applied atomically. All views use these same records.",
      { exact: true },
    ),
  ).toBeVisible();
  const saved = await (
    await page.request.get(`/api/v1/journal/${moment.id}`)
  ).json();
  expect(saved.text).toBe(text);
  expect(saved.needsOrganization).toBe(false);
  expect(saved.items).toHaveLength(1);
  const item = await (
    await page.request.get(`/api/v1/items/${saved.items[0].itemId}`)
  ).json();
  expect(item.type).toBe("task");
  await noOverflow(page);
});
