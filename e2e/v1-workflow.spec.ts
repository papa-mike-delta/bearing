import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
async function open(page: Page, path = "today") {
  await page.goto(`/app/${path}`);
  await expect(
    page.getByRole("link", { name: /Available offline/ }),
  ).toBeVisible();
}
async function navigate(page: Page, name: string) {
  // Route transitions briefly replace the shell with loading UI. Wait before
  // choosing mobile versus desktop navigation rather than treating that gap as desktop.
  await expect(
    page
      .getByRole("button", { name: "Open navigation", exact: true })
      .or(
        page.getByRole("navigation", { name: "Main navigation", exact: true }),
      ),
  ).toBeVisible();
  if (
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .isVisible()
  ) {
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .click();
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
async function count(page: Page, text: string) {
  return (await (await page.request.get("/api/v1/journal")).json()).filter(
    (m: { text: string }) => m.text === text,
  ).length;
}

test("capture, organize, edit checklist and complete one Task across Journal and search", async ({
  page,
}, testInfo) => {
  const title = `Canonical Task ${Date.now()}`,
    raw = `  Remember ${title}\n`;
  await open(page, "journal");
  await page.keyboard.press("Control+k");
  await expect(
    page.getByRole("textbox", { name: "Capture", exact: true }),
  ).toBeFocused();
  await page.getByRole("textbox", { name: "Capture", exact: true }).fill(raw);
  await page
    .getByRole("textbox", { name: "Capture", exact: true })
    .press("Control+Enter");
  await expect.poll(() => count(page, raw)).toBe(1);
  await navigate(page, "Inbox");
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page
    .getByRole("button", { name: "Create Task from entry", exact: true })
    .click();
  await navigate(page, "Journal");
  const card = page.getByRole("article", { name: title, exact: true });
  await expect(card).toContainText("To do");
  await card.getByRole("link", { name: title, exact: true }).click();
  await page
    .getByLabel("Content", { exact: true })
    .fill("- [ ] Call Alex\n- [ ] Take a walk");
  await page.getByRole("checkbox", { name: "Call Alex", exact: true }).check();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Save changes", exact: true }),
  ).toBeEnabled();
  await expect
    .poll(async () => {
      const items = await (await page.request.get("/api/v1/items")).json();
      return items.find((i: { title: string }) => i.title === title)?.content;
    })
    .toContain("[x] Call Alex");
  await page
    .getByRole("button", { name: "Promote to Task", exact: true })
    .last()
    .click();
  await expect
    .poll(
      async () =>
        (await (await page.request.get("/api/v1/items")).json()).filter(
          (i: { title: string }) => i.title === "Take a walk",
        ).length,
    )
    .toBe(1);
  await navigate(page, "Journal");
  await page
    .getByRole("article", { name: title, exact: true })
    .getByRole("button", { name: `Complete ${title}`, exact: true })
    .click();
  await expect(
    page.getByRole("article", { name: title, exact: true }).first(),
  ).toContainText("Done");
  await page.goto(`/app/search?q=${encodeURIComponent(title)}`);
  await expect(
    page.getByRole("link", { name: new RegExp(title) }).first(),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("canonical-search.png"),
    animations: "disabled",
  });
  const tasks = (await (await page.request.get("/api/v1/items")).json()).filter(
    (i: { title: string }) => i.title === title,
  );
  expect(tasks).toHaveLength(1);
  expect(tasks[0].status).toBe("done");
});

test("Project Areas stay inherited and startup preference selects a real URL", async ({
  page,
}, testInfo) => {
  await open(page, "settings");
  await expect(
    page.getByRole("textbox", { name: "Timezone", exact: true }),
  ).toHaveValue("America/New_York");
  const area = `Home ${Date.now()}`,
    project = `Workspace ${Date.now()}`;
  await page.getByRole("textbox", { name: "Name", exact: true }).fill(area);
  await page.getByRole("button", { name: "Create label", exact: true }).click();
  await navigate(page, "Projects");
  await page.getByRole("button", { name: "New Project", exact: true }).click();
  await page.getByLabel("Project name", { exact: true }).fill(project);
  await page.getByRole("checkbox", { name: area, exact: true }).check();
  await page
    .getByRole("button", { name: "Create Project", exact: true })
    .click();
  await navigate(page, "Library");
  await page.getByRole("button", { name: "New Task", exact: true }).click();
  const title = `Inherited Task ${Date.now()}`;
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page
    .getByRole("combobox", { name: "Primary Project", exact: true })
    .selectOption({ label: project });
  await expect(
    page.getByText(`Inherited from ${project}:`, { exact: false }),
  ).toContainText(area);
  await page.getByRole("button", { name: "Create Task", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/library\/[a-z0-9]+$/);
  const item = (await (await page.request.get("/api/v1/items")).json()).find(
    (i: { title: string }) => i.title === title,
  );
  await page.getByLabel("Title", { exact: true }).fill(title + " unsaved");
  await navigate(page, "Journal");
  await navigate(page, "Library");
  await page
    .getByRole("article", { name: title, exact: true })
    .getByRole("link", { name: title, exact: true })
    .click();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
    title + " unsaved",
  );
  await page
    .getByRole("button", { name: "Discard changes", exact: true })
    .click();
  expect(item.directAreas).toHaveLength(0);
  expect(item.inheritedAreas.map((a: { name: string }) => a.name)).toEqual([
    area,
  ]);
  await page.goto(`/app/library?area=${item.inheritedAreas[0].id}`);
  await expect(
    page.getByRole("article", { name: title, exact: true }),
  ).toBeVisible();
  await navigate(page, "Settings");
  await page
    .getByRole("combobox", { name: "Startup view", exact: true })
    .selectOption("journal");
  await page
    .getByRole("button", { name: "Save preferences", exact: true })
    .click();
  await expect(page.getByText("Saved.", { exact: true })).toBeVisible();
  await page.goto("/app");
  await expect(page).toHaveURL(/\/app\/journal$/);
  await page.screenshot({
    path: testInfo.outputPath("journal-desktop-mobile.png"),
    animations: "disabled",
  });
  expect(
    await page
      .locator("body")
      .evaluate((body) => body.scrollWidth <= window.innerWidth),
  ).toBe(true);
});

test("offline launch and reload preserve text, backdate, reconnect and sync exactly once", async ({
  page,
}, testInfo) => {
  const text = `Offline line ${Date.now()}`;
  await open(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise((resolve) =>
        navigator.serviceWorker.addEventListener("controllerchange", resolve, {
          once: true,
        }),
      );
  });
  await page.context().setOffline(true);
  await page.goto("/app/journal?date=2026-10-24");
  await expect(
    page.getByRole("heading", { name: "A line about your day", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Capture", { exact: true }).fill(text);
  await page
    .getByLabel("Occurred at", { exact: true })
    .fill("2026-10-24T23:30");
  await page
    .getByRole("button", { name: "Save on this device", exact: true })
    .click();
  await expect(page.getByText(text, { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText(text, { exact: true })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("offline-pending.png"),
    animations: "disabled",
  });
  await page.context().setOffline(false);
  await expect.poll(() => count(page, text)).toBe(1);
  await expect(page.locator("article").filter({ hasText: text })).toContainText(
    "Synced",
  );
  await page.goto("/app/journal?date=2026-10-24");
  await expect(page.getByText(text, { exact: true })).toBeVisible();
  await page.reload();
  await expect.poll(() => count(page, text)).toBe(1);
  const moment = (
    await (await page.request.get("/api/v1/journal")).json()
  ).find((m: { text: string }) => m.text === text);
  expect(moment.localDate).toBe("2026-10-24");
  expect(moment.occurredAt).toBe("2026-10-25T03:30:00.000Z");
  expect(moment.capturedAt).not.toBe(moment.occurredAt);
  const keys = await page.evaluate(async () =>
    (
      await Promise.all(
        (await caches.keys())
          .filter((k) => k.startsWith("bearing-offline-"))
          .map(async (k) =>
            (await (await caches.open(k)).keys()).map(
              (r) => new URL(r.url).pathname,
            ),
          ),
      )
    ).flat(),
  );
  expect(
    keys.some((path) => path.startsWith("/api/") || path.startsWith("/app")),
  ).toBe(false);
});

test("pending and failed captures stay with their account through sign-out and account switch", async ({
  page,
}) => {
  const db = new PrismaClient(),
    text = `Private pending ${Date.now()}`,
    email = `switch-${Date.now()}@example.test`;
  try {
    const original = await db.account.findUniqueOrThrow({
      where: { email: "demo@gmail.com" },
    });
    const other = await db.account.create({
      data: { email, passwordHash: await bcrypt.hash("Password123", 4) },
    });
    await open(page);
    await page.evaluate(
      async ({ userId, text }) => {
        const store = await import(String("/bearing-outbox.js"));
        const now = new Date().toISOString();
        await store.enqueue(userId, {
          clientId: "switch-capture",
          text,
          capturedAt: now,
          occurredAt: now,
          timezone: "America/New_York",
        });
      },
      { userId: original.id, text },
    );
    // A real session switch is protected even if a tab misses the sign-out broadcast.
    expect(
      (
        await page.request.post("/api/auth/login", {
          data: { email, password: "Password123" },
        })
      ).ok(),
    ).toBe(true);
    const result = await page.evaluate(
      async (userId) =>
        (await import(String("/bearing-outbox.js"))).syncOutbox(userId),
      original.id,
    );
    expect(result.locked).toBe(true);
    expect(await db.journalMoment.count({ where: { userId: other.id } })).toBe(
      0,
    );
    await page.goto("/app/journal");
    await expect(
      page.getByRole("heading", { name: "Daily Journal", exact: true }),
    ).toBeVisible();
    await expect(page.getByText(text, { exact: true })).toHaveCount(0);
    expect(
      (
        await page.request.post("/api/auth/login", {
          data: { email: "demo@gmail.com", password: "Password123" },
        })
      ).ok(),
    ).toBe(true);
    await open(page, "journal");
    await expect.poll(() => count(page, text)).toBe(1);
    await page.evaluate(
      async ({ userId, text }) => {
        const store = await import(String("/bearing-outbox.js"));
        const now = new Date().toISOString();
        await store.enqueue(userId, {
          clientId: "failed-capture",
          text: text + " failure",
          capturedAt: now,
          occurredAt: now,
          timezone: "UTC",
        });
        await store.syncOutbox(userId, {
          fetcher: async (_url: string, init: RequestInit = {}) =>
            !init.method
              ? Response.json({
                  userId,
                  email: "demo@gmail.com",
                  expiresAt: Date.now() + 60000,
                })
              : Response.json({ error: "Try later" }, { status: 429 }),
        });
      },
      { userId: original.id, text },
    );
    await expect(
      page.getByText("Needs attention", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Retry sync", exact: true }).click();
    await expect.poll(() => count(page, text + " failure")).toBe(1);
    await page.evaluate(
      async ({ userId, text }) => {
        const store = await import(String("/bearing-outbox.js"));
        const now = new Date().toISOString();
        await store.enqueue(userId, {
          clientId: "logout-pending",
          text: text + " logout",
          capturedAt: now,
          occurredAt: now,
          timezone: "UTC",
        });
      },
      { userId: original.id, text },
    );
    await expect(
      page.getByText(text + " logout", { exact: true }),
    ).toBeVisible();
    const signOut = page.getByRole("button", { name: "Sign out", exact: true });
    if (!(await signOut.isVisible())) {
      await page
        .getByRole("button", { name: "Open navigation", exact: true })
        .click();
    }
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(
      page.getByRole("dialog", {
        name: "Sign out of this account?",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("dialog", {
        name: "Sign out of this account?",
        exact: true,
      }),
    ).toContainText("1 unsynced capture");
    await page
      .getByRole("button", {
        name: "Keep device captures and sign out",
        exact: true,
      })
      .click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/offline.html");
    await expect(
      page.getByRole("heading", { name: "Connect to sign in", exact: true }),
    ).toBeVisible();
    await expect(page.getByText(text + " logout", { exact: true })).toHaveCount(
      0,
    );
  } finally {
    await db.$disconnect();
  }
});

test("long-form writing uses the existing rich editor and date browsing creates no empty records", async ({
  page,
}, testInfo) => {
  await open(page, "journal");
  const text = `A longer reflection ${Date.now()}`;
  await page
    .getByRole("button", { name: "Long-form writing", exact: true })
    .click();
  const editor = page.locator('[contenteditable="true"]').first();
  await editor.fill(text);
  await page
    .getByRole("button", { name: "Capture moment", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await (await page.request.get("/api/v1/journal")).json()).filter(
          (m: { text: string }) => m.text.includes(text),
        ).length,
    )
    .toBe(1);
  const before = (await (await page.request.get("/api/v1/journal")).json())
    .length;
  await page.getByLabel("Journal date", { exact: true }).fill("2020-01-01");
  await expect(page).toHaveURL(/date=2020-01-01/);
  await expect(
    page.getByText("No moments yet. Capture a line when you’re ready.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(
    (await (await page.request.get("/api/v1/journal")).json()).length,
  ).toBe(before);
  await page.screenshot({
    path: testInfo.outputPath("rich-journal.png"),
    animations: "disabled",
  });
  expect(
    await page.locator("body").evaluate((el) => el.scrollWidth <= innerWidth),
  ).toBe(true);
});
