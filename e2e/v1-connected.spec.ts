import { test, expect } from "./fixtures";
const suffix = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;
async function open(page: any, path: string) {
  await page.goto(`/app/${path}`);
  await expect(
    page.getByRole("link", { name: /Available offline/ }),
  ).toBeVisible();
}
async function create(page: any, value: any) {
  const r = await page.request.post("/api/v1/items", { data: value });
  expect(r.ok()).toBeTruthy();
  return (await r.json()).value;
}
async function activities(page: any) {
  return (await page.request.get("/api/v1/activities")).json();
}
async function noOverflow(page: any) {
  expect(
    await page.evaluate(
      () =>
        Math.max(
          document.body.scrollWidth,
          document.documentElement.scrollWidth,
        ) <= window.innerWidth,
    ),
  ).toBeTruthy();
}
test("People distinguish mentions, linked media and actual interaction; Me keeps private reference links", async ({
  page,
}) => {
  const id = suffix(),
    name = `Alex ${id}`;
  await open(page, "library");
  await noOverflow(page);
  await page.getByRole("button", { name: "New Person", exact: true }).click();
  await expect(page).toHaveURL(/library\/new\?type=person/);
  await page.getByLabel("Title", { exact: true }).fill(name);
  await page.getByLabel("Email", { exact: true }).fill("alex@example.test");
  await page
    .getByRole("button", { name: "Create Person", exact: true })
    .click();
  await expect(page).toHaveURL(/\/app\/library\/(?!new)/);
  const personId = page.url().split("/").pop()!;
  await open(page, `library/new?type=bookmark&draft=${suffix()}`);
  await page.getByLabel("Title", { exact: true }).fill(`Audio essay ${id}`);
  await page
    .getByRole("combobox", { name: "Template", exact: true })
    .selectOption("media");
  await page.getByLabel("Media format", { exact: true }).fill("Audio essay");
  await page.getByLabel("Creator", { exact: true }).fill("Alex");
  await page
    .getByRole("button", { name: "Create Bookmark", exact: true })
    .click();
  await expect(page).toHaveURL(/\/app\/library\/(?!new)/);
  const book = { id: page.url().split("/").pop()!, title: `Audio essay ${id}` };
  await open(page, `library/${personId}`);
  await page.reload();
  await page
    .getByRole("combobox", { name: "Connect to", exact: true })
    .selectOption(book.id);
  await page
    .getByRole("button", { name: "Add connection", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: book.title, exact: true }),
  ).toHaveCount(2);
  await open(page, "journal");
  await page
    .getByRole("textbox", { name: "Capture", exact: true })
    .fill(`Thought about ${name}`);
  await page.getByRole("checkbox", { name, exact: true }).check();
  await page
    .getByRole("button", { name: "Capture moment", exact: true })
    .click();
  await expect(
    page.locator('article[id^="moment-"]').filter({ hasText: `Thought about ${name}` }),
  ).toBeVisible();
  await open(page, `library/${personId}`);
  await expect(
    page.getByRole("link", { name: new RegExp(`Thought about ${name}`) }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "No confirmed interactions. A mention does not record contact.",
    ),
  ).toBeVisible();
  const entry = await page.request.post("/api/v1/journal", {
    data: {
      clientId: `mention-${id}`,
      text: `Remember ${name}`,
      occurredAt: new Date().toISOString(),
      timezone: "America/New_York",
    },
  });
  expect(entry.ok()).toBeTruthy();
  const moment = (await entry.json()).value;
  await page.reload();
  await page
    .getByRole("combobox", { name: "Link an existing Journal moment" })
    .selectOption(moment.id);
  await page.getByRole("button", { name: "Link mention", exact: true }).click();
  await expect(
    page.getByRole("link", { name: new RegExp(`Remember ${name}`) }),
  ).toBeVisible();
  const linkedMoment = await (
    await page.request.get(`/api/v1/journal/${moment.id}`)
  ).json();
  expect(linkedMoment.revision).toBe(moment.revision + 1);
  expect(linkedMoment.items).toEqual([
    expect.objectContaining({ itemId: personId, relation: "mention" }),
  ]);

  await page
    .getByLabel("Interaction note", { exact: true })
    .fill("Spoke today");
  await page
    .getByRole("button", { name: "Confirm interaction now", exact: true })
    .click();
  await expect(
    page.locator("section").filter({
      has: page.getByRole("heading", { name: "Confirmed interactions", exact: true }),
    }).locator("p").filter({ hasText: "Spoke today" }),
  ).toBeVisible();
  expect(
    (await activities(page)).filter(
      (a: any) => a.itemId === personId && a.kind === "interaction",
    ),
  ).toHaveLength(1);
  const me = await (await page.request.get("/api/v1/me")).json();
  const note = await create(page, {
    type: "note",
    title: `Private health reference ${id}`,
    content: "Reference information",
  });
  await page.request.post("/api/v1/links", {
    data: { fromId: note.id, toId: me.id, type: "related_to" },
  });
  await open(page, `library/${me.id}`);
  await expect(
    page.getByRole("link", { name: note.title, exact: true }),
  ).toHaveCount(2);
  await expect(
    page.getByText("Me · your personal reference profile", { exact: true }),
  ).toBeVisible();
  await noOverflow(page);
  await page.screenshot({
    path: test.info().outputPath("person-profile.png"),
    fullPage: true,
  });
});
test("Routine occurrence steps persist independently, complete once, and reset next period", async ({
  page,
}) => {
  const id = suffix();
  await open(page, `library/new?type=habit&draft=${id}`);
  await page.getByLabel("Title", { exact: true }).fill(`Routine ${id}`);
  await page
    .getByRole("combobox", { name: "Template", exact: true })
    .selectOption("routine");
  await page
    .getByLabel("Content", { exact: true })
    .fill("- [x] Drink water\n- [ ] Stretch");
  await page.getByRole("button", { name: "Create Habit", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/library\/(?!new)/);
  const habitId = page.url().split("/").pop()!;
  const steps = page.getByRole("checkbox", {
    name: "Drink water",
    exact: true,
  });
  await expect(steps).toHaveCount(2);
  await expect(steps.last()).not.toBeChecked();
  await steps.last().check();
  await page
    .getByRole("button", { name: "Save occurrence steps", exact: true })
    .click();
  expect(
    (await activities(page)).filter((a: any) => a.itemId === habitId),
  ).toHaveLength(0);
  await page
    .getByRole("button", { name: "Complete Habit", exact: true })
    .click();
  await expect(
    page.getByText("Completed · saved in Activity", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("Completed · saved in Activity", { exact: true }),
  ).toBeVisible();
  expect(
    (await activities(page)).filter(
      (a: any) => a.itemId === habitId && a.kind === "habit_completion",
    ),
  ).toHaveLength(1);
  await page.getByLabel("Occurrence date", { exact: true }).fill("2030-01-02");
  await expect(
    page.getByRole("checkbox", { name: "Drink water", exact: true }).last(),
  ).not.toBeChecked();
  await expect(
    page.getByRole("button", { name: "Complete Habit", exact: true }),
  ).toBeVisible();
  await noOverflow(page);
});
test("explicit GPS capture saves a navigable Place without venue lookup", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 40.7128, longitude: -74.006 });
  await open(page, "journal");
  const name = `River place ${suffix()}`;
  await page.getByRole("textbox", { name: "Capture", exact: true }).fill(name);
  await page
    .getByRole("button", { name: "Use my location for a Place", exact: true })
    .click();
  await expect(page.getByText(/Coordinates ready: 40.7128/)).toBeVisible();
  await page
    .getByRole("button", { name: "Capture moment", exact: true })
    .click();
  await expect
    .poll(async () => {
      const r = await page.request.get("/api/v1/items?type=bookmark");
      return (await r.json()).find((i: any) => i.title === name)?.id;
    })
    .toBeTruthy();
  const items = await (
      await page.request.get("/api/v1/items?type=bookmark")
    ).json(),
    place = items.find((i: any) => i.title === name);
  await open(page, `library/${place.id}`);
  await expect(
    page.getByRole("link", { name: "Navigate in maps", exact: true }),
  ).toHaveAttribute(
    "href",
    "https://www.google.com/maps/dir/?api=1&destination=40.7128%2C-74.006",
  );
  expect(
    (await activities(page)).filter((a: any) => a.itemId === place.id),
  ).toHaveLength(0);
  await noOverflow(page);
});
test("existing Focus Timer saves one session; repeated mood check-ins stay separate", async ({
  page,
}) => {
  await page.clock.install();
  let lost = false;
  await page.route("**/api/v1/activities", async (route) => {
    if (
      route.request().method() === "POST" &&
      route.request().postDataJSON().kind === "focus" &&
      !lost
    ) {
      lost = true;
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await open(page, "focus");
  const priorFocus = (await activities(page)).filter(
    (a: any) => a.kind === "focus",
  ).length;
  await page.getByRole("button", { name: "Custom", exact: true }).click();
  await page.getByLabel("Custom focus minutes", { exact: true }).fill("1");
  await noOverflow(page);
  await page.screenshot({
    path: test.info().outputPath("focus-timer.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await page.clock.fastForward(61000);
  await expect
    .poll(
      async () =>
        (await activities(page)).filter((a: any) => a.kind === "focus").length,
    )
    .toBe(priorFocus + 1);
  const before = (await activities(page)).filter(
    (a: any) => a.kind === "focus",
  ).length;
  await expect(
    page.getByRole("button", { name: "Retry saving Focus", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Retry saving Focus", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Retry saving Focus", exact: true }),
  ).toHaveCount(0);
  await page.clock.fastForward(5000);
  expect(
    (await activities(page)).filter((a: any) => a.kind === "focus"),
  ).toHaveLength(before);
  await open(page, "today");
  const prior = (await activities(page)).filter(
    (a: any) => a.kind === "check_in",
  ).length;
  await page
    .getByRole("button", { name: "Save check-in", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await activities(page)).filter((a: any) => a.kind === "check_in")
          .length,
    )
    .toBe(prior + 1);
  await page
    .getByRole("button", { name: "Save check-in", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await activities(page)).filter((a: any) => a.kind === "check_in")
          .length,
    )
    .toBe(prior + 2);
  await noOverflow(page);
});
test("Graph uses real connections; Calendar displays one canonical Task with deadline and scheduled time", async ({
  page,
}) => {
  const id = suffix(),
    goal = await create(page, {
      type: "goal",
      title: `Outcome ${id}`,
      metadata: { version: 1, outcome: "Desired result" },
    }),
    task = await create(page, {
      type: "task",
      title: `Work ${id}`,
      status: "in_progress",
      localDate: "2026-11-03",
      scheduledAt: "2026-11-03T14:00:00Z",
    });
  await page.request.post("/api/v1/links", {
    data: { fromId: task.id, toId: goal.id, type: "advances" },
  });
  await open(page, "graph");
  await expect(
    page.getByRole("heading", { name: "Digital Brain", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Goal", exact: true }).click();
  await expect(
    page.getByRole("button", { name: `Open ${task.title}`, exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: `Open ${goal.title}`, exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "clear", exact: true }).click();
  await noOverflow(page);
  await page
    .getByRole("button", { name: `Open ${goal.title}`, exact: true })
    .press("Enter");
  await expect(page).toHaveURL(new RegExp(`/app/library/${goal.id}$`));
  await noOverflow(page);
  await open(page, `library/new?type=event&draft=${suffix()}`);
  await page.getByLabel("Title", { exact: true }).fill(`Meeting ${id}`);
  await page.getByLabel(/^Starts ·/).fill("2026-11-03T10:00");
  await page.getByLabel(/^Ends ·/).fill("2026-11-03T11:00");
  await page.getByLabel("Location", { exact: true }).fill("By the river");
  await page.getByRole("button", { name: "Create Event", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/library\/(?!new)/);
  await open(page, "calendar?date=2026-11-03");
  const card = page.getByRole("article", { name: task.title, exact: true });
  await expect(card).toHaveCount(1);
  await expect(
    page.getByRole("article", { name: `Meeting ${id}`, exact: true }),
  ).toHaveCount(1);
  await expect(card).toContainText("Scheduled");
  await expect(card).toContainText("Due 2026-11-03");
  await card.getByRole("link", { name: task.title, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/app/library/${task.id}$`));
});
