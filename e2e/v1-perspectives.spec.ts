import { expect, test } from "./fixtures";
import type { Page } from "@playwright/test";

const date = "2026-11-06";
const unique = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;
async function create(page: Page, path: string, data: object) {
  const response = await page.request.post(`/api/v1/${path}`, { data });
  expect(response.ok(), await response.text()).toBeTruthy();
  return (await response.json()).value;
}
async function links(page: Page) {
  return (await page.request.get("/api/v1/links")).json();
}
async function receipt(page: Page) {
  const link = page
    .getByRole("status")
    .filter({ hasText: "Saved connection." })
    .getByRole("link", { name: "Open audit receipt" });
  await expect(link).toBeVisible();
  const response = await page.request.get((await link.getAttribute("href"))!);
  expect(response.ok()).toBeTruthy();
  expect((await response.json()).status).toBe("success");
}

test("all eight perspectives expose missing connections and one saved Link fills every perspective", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const id = unique();
  const project = await create(page, "projects", { name: `Workspace ${id}` });
  const task = await create(page, "items", {
    type: "task",
    title: `Visible work ${id}`,
    status: "in_progress",
    projectId: project.id,
    localDate: date,
  });
  const note = await create(page, "items", {
    type: "note",
    title: `Reference ${id}`,
  });
  const person = await create(page, "items", {
    type: "person",
    title: `Person ${id}`,
  });
  const paths = [
    `today?date=${date}`,
    `journal?date=${date}`,
    "library",
    `calendar?date=${date}`,
    "graph",
    `search?q=${encodeURIComponent(task.title)}&kind=item`,
    `projects/${project.id}`,
  ];
  const before = await links(page);
  for (const path of paths) {
    await page.goto(`/app/${path}`);
    const prompt = page.getByRole("button", {
      name: `Connect ${task.title}`,
      exact: true,
    });
    await expect(prompt).toBeVisible();
    await expect(prompt).toHaveAttribute("data-slot", "relationship-prompt");
  }
  await page.goto(`/app/library/${person.id}`);
  await expect(
    page.getByRole("button", { name: `Connect ${person.title}`, exact: true }),
  ).toBeVisible();
  await page.goto("/app/search?q=no-matching-record-" + id);
  await expect(
    page.getByText(/No matching records in this account/),
  ).toBeVisible();
  await expect(page.locator('[data-slot="relationship-prompt"]')).toHaveCount(
    0,
  );
  expect(await links(page)).toEqual(before);

  await page.goto("/app/graph");
  await page
    .getByRole("button", { name: `Connect ${task.title}`, exact: true })
    .click();
  let dialog = page.getByRole("dialog");
  await dialog
    .getByRole("combobox", { name: "Connect to", exact: true })
    .selectOption(note.id);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(await links(page)).toEqual(before);
  await page
    .getByRole("button", { name: `Connect ${task.title}`, exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByRole("combobox", { name: "Connect to", exact: true })
    .selectOption(note.id);
  await dialog
    .getByRole("button", { name: "Save connection", exact: true })
    .click();
  await receipt(page);
  expect(
    (await links(page)).filter(
      (link: any) =>
        link.fromId === task.id &&
        link.toId === note.id &&
        link.type === "related_to",
    ),
  ).toHaveLength(1);
  for (const path of paths) {
    await page.goto(`/app/${path}`);
    await expect(
      page.getByRole("link", { name: /Available offline/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: `Connect ${task.title}`, exact: true }),
    ).toHaveCount(0);
  }
  expect(
    (await (await page.request.get("/api/v1/items")).json()).filter(
      (item: any) => item.id === task.id,
    ),
  ).toHaveLength(1);
});

test("a faded Journal prompt creates one connected Note and preserves the original moment", async ({
  page,
}) => {
  const id = unique(),
    text = `A thought without a home ${id}`;
  const moment = await create(page, "journal", {
    clientId: crypto.randomUUID(),
    text,
    occurredAt: `${date}T15:00:00Z`,
    timezone: "America/New_York",
  });
  await page.goto(`/app/journal?date=${date}`);
  await page
    .getByRole("button", {
      name: `Connect Journal entry: ${text}`,
      exact: true,
    })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("combobox", { name: "Connect entry", exact: true })
    .selectOption("create");
  await dialog
    .getByRole("textbox", { name: "Note title", exact: true })
    .fill(`Filed thought ${id}`);
  await dialog
    .getByRole("button", { name: "Create connected Note", exact: true })
    .click();
  await receipt(page);
  await page.reload();
  await expect(
    page.getByRole("button", {
      name: `Connect Journal entry: ${text}`,
      exact: true,
    }),
  ).toHaveCount(0);
  const stored = await (
    await page.request.get(`/api/v1/journal/${moment.id}`)
  ).json();
  expect(stored.text).toBe(text);
  expect(stored.items).toHaveLength(1);
  expect(stored.items[0].relation).toBe("reference");
  const notes = (await (await page.request.get("/api/v1/items")).json()).filter(
    (item: any) => item.title === `Filed thought ${id}`,
  );
  expect(notes).toHaveLength(1);
  expect(notes[0].id).toBe(stored.items[0].itemId);
});

test("a Journal prompt attaches an existing Person without fabricating an interaction", async ({
  page,
}) => {
  const id = unique(),
    text = `An explicit memory ${id}`;
  const person = await create(page, "items", {
    type: "person",
    title: `Reader ${id}`,
  });
  const moment = await create(page, "journal", {
    clientId: crypto.randomUUID(),
    text,
    occurredAt: `${date}T15:00:00Z`,
    timezone: "America/New_York",
  });
  await page.goto(`/app/journal?date=${date}`);
  await page
    .getByRole("button", {
      name: `Connect Journal entry: ${text}`,
      exact: true,
    })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("combobox", { name: "Connect to", exact: true })
    .selectOption(person.id);
  await dialog
    .getByRole("button", { name: "Save connection", exact: true })
    .click();
  await receipt(page);
  const stored = await (
    await page.request.get(`/api/v1/journal/${moment.id}`)
  ).json();
  expect(stored.items).toEqual([
    expect.objectContaining({ itemId: person.id, relation: "mention" }),
  ]);
  await page.goto(`/app/library/${person.id}`);
  await expect(
    page.getByRole("link", { name: new RegExp(text) }),
  ).toBeVisible();
  expect(
    (await (await page.request.get("/api/v1/activities")).json()).filter(
      (activity: any) => activity.itemId === person.id,
    ),
  ).toHaveLength(0);
});

test("a Project prompt places the existing Task without creating a second Task or a fake Link", async ({
  page,
}) => {
  const id = unique();
  const project = await create(page, "projects", { name: `Project ${id}` });
  const task = await create(page, "items", {
    type: "task",
    title: `Unassigned ${id}`,
  });
  const before = await links(page);
  await page.goto(`/app/projects/${project.id}`);
  await page
    .getByRole("button", {
      name: `Place a Task in ${project.name}`,
      exact: true,
    })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("combobox", { name: "Unassigned Task", exact: true })
    .selectOption(task.id);
  await dialog
    .getByRole("button", { name: "Save connection", exact: true })
    .click();
  await receipt(page);
  await page.reload();
  await expect(
    page.getByRole("link", { name: task.title, exact: true }),
  ).toBeVisible();
  const stored = await (
    await page.request.get(`/api/v1/items/${task.id}`)
  ).json();
  expect(stored.projectId).toBe(project.id);
  expect(stored.revision).toBe(task.revision + 1);
  expect(await links(page)).toEqual(before);
});

test("a connection prompt refuses a stale source and retains the editable proposal", async ({
  page,
}) => {
  const id = unique();
  const source = await create(page, "items", {
    type: "note",
    title: `Source ${id}`,
  });
  const target = await create(page, "items", {
    type: "note",
    title: `Target ${id}`,
  });
  await page.goto("/app/graph");
  await page
    .getByRole("button", { name: `Connect ${source.title}`, exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("combobox", { name: "Connect to", exact: true })
    .selectOption(target.id);
  const response = await page.request.put(`/api/v1/items/${source.id}`, {
    data: {
      revision: source.revision,
      data: {
        type: "note",
        title: source.title,
        content: "Medication changed elsewhere",
        timezone: "UTC",
        metadata: { version: 1 },
      },
    },
  });
  expect(response.ok()).toBeTruthy();
  await dialog
    .getByRole("button", { name: "Save connection", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText(/changed/i);
  await expect(
    dialog.getByRole("combobox", { name: "Connect to", exact: true }),
  ).toHaveValue(target.id);
  expect(
    (await links(page)).filter(
      (link: any) => link.fromId === source.id && link.toId === target.id,
    ),
  ).toHaveLength(0);
});
test("connection forms save under Base UI and React Aria", async ({ page }) => {
  test.setTimeout(90_000);
  for (const base of ["base", "aria"]) {
    const id = unique();
    const source = await create(page, "items", {
      type: "note",
      title: `Base ${base} source ${id}`,
    });
    const target = await create(page, "items", {
      type: "note",
      title: `Base ${base} target ${id}`,
    });
    const response = await page.request.post("/api/preferences/theme", {
      data: {
        input: `:root { --bearing-base: ${base}; } .dark { --bearing-base: ${base}; }`,
      },
    });
    expect(response.ok()).toBeTruthy();
    await page.goto("/app/graph");
    await expect(
      page.getByRole("button", { name: "Quick Capture", exact: true }),
    ).toHaveAttribute("data-theme-base", base);
    await page
      .getByRole("button", { name: `Connect ${source.title}`, exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByRole("combobox", { name: "Connect to", exact: true })
      .selectOption(target.id);
    const save = dialog.getByRole("button", {
      name: "Save connection",
      exact: true,
    });
    await expect(save).toHaveAttribute("data-theme-base", base);
    await save.click();
    await receipt(page);
    expect(
      (await links(page)).filter(
        (link: any) => link.fromId === source.id && link.toId === target.id,
      ),
    ).toHaveLength(1);
  }
});
