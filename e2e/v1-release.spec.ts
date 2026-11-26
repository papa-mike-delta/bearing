import { test, expect } from "./fixtures";

test("release demo setup reports readiness, refuses false success and preserves real records", async ({
  page,
}) => {
  await page.goto("/app/settings");
  const identity = await (await page.request.get("/api/v1/identity")).json();
  const real = await (
    await page.request.post("/api/v1/items", {
      data: { type: "note", title: "Release personal note" },
    })
  ).json();
  await page
    .getByRole("button", { name: "Add demo data", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Demo examples are ready" }),
  ).toBeVisible();
  const count = (await (await page.request.get("/api/v1/items")).json()).length;
  await page
    .getByRole("button", { name: "Add demo data", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "already ready" }),
  ).toBeVisible();
  expect((await (await page.request.get("/api/v1/items")).json()).length).toBe(
    count,
  );
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Remove demo data", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Demo examples removed" }),
  ).toBeVisible();
  expect((await page.request.get(`/api/v1/items/${real.value.id}`)).ok()).toBe(
    true,
  );
  await page.route("**/api/v1/demo", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Setup unavailable. Retry later." }),
    }),
  );
  await page
    .getByRole("button", { name: "Add demo data", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Setup unavailable" }),
  ).toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: "ready" }),
  ).toHaveCount(0);
  expect(
    (
      await page.request.post("/api/seed", {
        headers: { "X-Bearing-Account": identity.userId },
      })
    ).status(),
  ).toBe(404);
});

test("Settings exports, clears and restores a complete V1 account through reviewed controls", async ({
  page,
}) => {
  await page.goto("/app/settings");
  await page
    .getByRole("button", { name: "Add demo data", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Demo examples are ready" }),
  ).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export V1 backup", exact: true })
    .click();
  const download = await downloadPromise;
  const file = await download.path();
  const before = await (await page.request.get("/api/v1/backup")).json();
  await page.getByLabel("Confirmation", { exact: true }).fill("RESET V1 DATA");
  await page
    .getByRole("button", { name: "Clear V1 data", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "V1 data cleared" }),
  ).toBeVisible();
  expect((await (await page.request.get("/api/v1/items")).json()).length).toBe(
    1,
  );
  await page.getByLabel("Backup file", { exact: true }).setInputFiles(file!);
  await page
    .getByLabel("Confirmation", { exact: true })
    .fill("RESTORE V1 DATA");
  await page
    .getByRole("button", { name: "Restore V1 backup", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Backup restored" }),
  ).toBeVisible();
  const after = await (await page.request.get("/api/v1/backup")).json();
  for (const table of Object.keys(before.tables).filter(
    (key) => key !== "ledger",
  ))
    expect(after.tables[table].length, table).toBe(before.tables[table].length);
});

test("public V1 copy, help, responsive navigation and actual screenshot are truthful", async ({
  browser,
}, info) => {
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [] },
    viewport: info.project.name.startsWith("phone")
      ? { width: 390, height: 844 }
      : { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Capture your life",
  );
  await expect(page.locator("body")).not.toContainText(
    /finance tracker|17 item types|No signup|entirely in your browser/i,
  );
  expect(
    await page.locator("body").evaluate((el) => el.scrollWidth <= innerWidth),
  ).toBe(true);
  await expect(
    page.getByRole("img", { name: /actual V1 Daily Journal/ }),
  ).toBeVisible();
  for (const name of ["Features", "Connections", "Philosophy"]) {
    const link = page.getByRole("link", { name, exact: true });
    await link.click();
    await expect(
      page.locator((await link.getAttribute("href"))!),
    ).toBeInViewport();
  }
  await page.screenshot({
    path: info.outputPath("v1-landing.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page
    .getByRole("link", { name: "Open app", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/login$/);
  expect(await page.locator(".animate-pulse").first().evaluate(el => parseFloat(getComputedStyle(el).animationDuration))).toBeLessThan(0.01);
  await expect(
    page.getByText("No shared demo credentials", { exact: false }),
  ).toBeVisible();
  await page.goto("/help");
  await expect(
    page.getByRole("heading", { name: "Help and privacy" }),
  ).toBeVisible();
  await context.close();
});

test("recurring Tasks retain completed instances and generate one successor across timezone boundaries", async ({
  page,
}) => {
  await page.goto("/app/today");
  for (const mode of ["calendar", "completion"]) {
    const created = await (
      await page.request.post("/api/v1/items", {
        data: {
          type: "task",
          title: `Release ${mode} recurrence`,
          status: "todo",
          scheduledAt: "2026-03-07T14:00:00Z",
          timezone: "America/New_York",
        },
      })
    ).json();
    expect(created.ok).toBe(true);
    const first = created.value;
    await page.goto(`/app/library/${first.id}`);
    await page.getByRole("combobox", { name: "Repeat from", exact: true }).selectOption(mode);
    await page
      .getByRole("button", { name: "Enable recurrence", exact: true })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "Repeats every 1 day" }),
    ).toBeVisible();
    const current = await (
      await page.request.get(`/api/v1/items/${first.id}`)
    ).json();
    const {
      type,
      template,
      title,
      content,
      status,
      priority,
      metadata,
      projectId,
      delegateId,
      dueAt,
      scheduledAt,
      startAt,
      endAt,
      followUpAt,
      localDate,
      timezone,
    } = current;
    const data = {
      type,
      template,
      title,
      content,
      status,
      priority,
      metadata,
      projectId,
      delegateId,
      dueAt,
      scheduledAt,
      startAt,
      endAt,
      followUpAt,
      localDate,
      timezone,
      tagIds: [],
    };
    const completion = {
      revision: current.revision,
      data: { ...data, status: "done" },
    };
    expect(
      (
        await page.request.put(`/api/v1/items/${first.id}`, {
          data: completion,
        })
      ).ok(),
    ).toBe(true);
    expect(
      (
        await page.request.put(`/api/v1/items/${first.id}`, {
          data: completion,
        })
      ).status(),
    ).toBe(409);
    const series = await (await page.request.get("/api/v1/recurrences")).json();
    const rule = series.find((r: { occurrences: { itemId: string }[] }) =>
      r.occurrences.some((o) => o.itemId === first.id),
    );
    expect(rule.occurrences).toHaveLength(2);
    const saved = await (
      await page.request.get(`/api/v1/items/${first.id}`)
    ).json();
    expect(saved.status).toBe("done");
    expect(saved.scheduledAt).toBe("2026-03-07T14:00:00.000Z");
    if (mode === "calendar")
      expect(
        rule.occurrences.some(
          (o: { scheduledAt: string }) =>
            o.scheduledAt === "2026-03-08T13:00:00.000Z",
        ),
      ).toBe(true);
  }
});
