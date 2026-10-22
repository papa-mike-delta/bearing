// Regression: several quick adds in a row on /people keep every person.
// Run against a local app using the same throwaway database. Never a live account.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { chromium, type Browser, type Page } from "playwright-core";
import { createDb, sessions, users } from "@repo/db";
import { eq } from "drizzle-orm";
import { listPeople } from "../lib/people.ts";
import { addTask } from "../lib/tasks.ts";
import { createArea } from "../lib/areas.ts";
const base = process.env.PEOPLE_TEST_BASE_URL;
const url = process.env.TEST_POSTGRES_URL;
const enabled = Boolean(base && url);
const db = enabled ? createDb(url!) : null;
let browser: Browser, page: Page;
const owner = randomUUID(), token = randomUUID();
before(async () => {
  if (!enabled) return;
  await db!.insert(users).values({ id: owner, email: `${owner}@test.invalid`, passwordHash: "-" });
  await db!.insert(sessions).values({ sessionToken: token, userId: owner, expires: new Date(Date.now() + 3600_000) });
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/opt/google/chrome/chrome", headless: true, args: ["--no-sandbox"] });
  const context = await browser.newContext();
  await context.addCookies([{ name: "authjs.session-token", value: token, url: base!, httpOnly: true }]);
  page = await context.newPage();
  page.setDefaultTimeout(10_000);
});
after(async () => {
  await browser?.close();
  if (db) {
    await db.delete(users).where(eq(users.id, owner));
    await db.$client.end();
  }
});
async function add(name: string) {
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByLabel("Group").selectOption("Close friends");
  await page.getByRole("button", { name: "Add person" }).click();
}
test("quick adds in a row keep every person, stay on /people, and clear the name", { skip: !enabled, timeout: 60_000 }, async () => {
  await page.goto(`${base}/people`);
  for (const name of ["Amy", "Bo", "Cy"]) {
    await add(name);
    await page.getByRole("link", { name: new RegExp(`^${name}`) }).waitFor();
    assert.equal(await page.getByLabel("Name", { exact: true }).inputValue(), "");
  }
  assert.equal(new URL(page.url()).pathname, "/people");
  assert.deepEqual((await listPeople(owner, db!)).map((p) => p.name).sort(), ["Amy", "Bo", "Cy"]);
  assert.deepEqual(await page.locator("main section li a span:first-child").allTextContents(), ["Amy", "Bo", "Cy"]);
  await page.reload();
  assert.deepEqual(await page.locator("main section li a span:first-child").allTextContents(), ["Amy", "Bo", "Cy"]);
});

test("typing the next person while the last one saves keeps both", { skip: !enabled, timeout: 60_000 }, async () => {
  await page.goto(`${base}/people`);
  await page.getByLabel("Group").selectOption("Family");
  for (const name of ["Dee", "Eve"]) {
    await page.getByLabel("Name", { exact: true }).fill(name);
    await page.keyboard.press("Enter");
  }
  for (const name of ["Dee", "Eve"]) await page.getByRole("link", { name: new RegExp(`^${name}`) }).waitFor();
  assert.deepEqual((await listPeople(owner, db!)).map((p) => p.name).sort(), ["Amy", "Bo", "Cy", "Dee", "Eve"]);
});

test("393px: nav fits without sideways scroll, controls are 40px targets, selects are filled fields, inputs are 16px", { skip: !enabled, timeout: 60_000 }, async () => {
  for (const width of [393, 560, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(`${base}/people`);
    const nav = page.getByRole("navigation", { name: "Main" });
    assert.ok(await nav.evaluate((n) => n.scrollWidth <= n.clientWidth + 1), `nav scrolls at ${width}`);
    const account = await nav.getByRole("link", { name: "Account" }).boundingBox();
    assert.ok(account && account.x >= 0 && account.x + account.width <= width, `Account clipped at ${width}`);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `page scrolls at ${width}`);
  }
  await page.setViewportSize({ width: 393, height: 800 });
  await page.goto(`${base}/people`);
  const form = page.locator("form.people-form");
  const boxes = await Promise.all([page.getByLabel("Name", { exact: true }), page.getByLabel("Group"), page.getByRole("button", { name: "Add person" })].map((l) => l.boundingBox()));
  for (const box of boxes) assert.ok(box!.height >= 40, `target ${box!.height}`);
  assert.equal(new Set(boxes.map((b) => Math.round(b!.x))).size, 1, "add form controls share a left edge");
  for (const field of [page.getByLabel("Name", { exact: true }), page.getByLabel("Group")])
    assert.equal(await field.evaluate((e) => getComputedStyle(e).fontSize), "16px");
  const [inputBg, selectBg] = await Promise.all([page.getByLabel("Name", { exact: true }), page.getByLabel("Group")].map((l) => l.evaluate((e) => getComputedStyle(e).backgroundColor)));
  assert.equal(selectBg, inputBg);
  assert.ok(await form.isVisible());
  await page.getByRole("button", { name: /^Close friends/ }).click();
  await page.getByRole("link", { name: /^Amy/ }).click();
  await page.getByRole("button", { name: "Save person" }).waitFor();
  await page.getByLabel("Reach-out rule").check();
  for (const name of ["Name", "Every", "Last connected", "Agreed day"])
    assert.ok((await page.getByLabel(name, { exact: true }).boundingBox())!.height >= 40, name);
  for (const name of ["Connected today", "Save person", "Delete person"])
    assert.ok((await page.getByRole("button", { name }).boundingBox())!.height >= 40, name);
  assert.ok((await page.locator("label.check-row").boundingBox())!.height >= 40, "rule checkbox row");
  const [every, unit] = await Promise.all(["Every", "Unit"].map((n) => page.locator("label.field", { hasText: n }).first().boundingBox()));
  assert.equal(Math.round(every!.y), Math.round(unit!.y), "Every and Unit label tops");
});

test("393px: the shared rule control on the task page has 40px targets, 16px fields, aligned tops, one phrase", { skip: !enabled, timeout: 60_000 }, async () => {
  await createArea(owner, "Home", db!);
  const task = await addTask(owner, { name: "Pay rent", today: "2026-10-21", rule: { every: 1, unit: "months" } }, db!);
  assert.ok(task);
  await page.setViewportSize({ width: 393, height: 800 });
  await page.goto(`${base}/tasks/item/${task.id}`);
  await page.getByRole("button", { name: "Save rule" }).waitFor();
  await page.getByLabel("On day (optional)").waitFor();
  const fields = ["Every", "Unit", "On day (optional)"].map((n) => page.getByLabel(n, { exact: true }));
  const boxes = await Promise.all(fields.map((f) => f.boundingBox()));
  for (const box of boxes) assert.ok(box!.height >= 40, `field ${box!.height}`);
  for (const f of fields) assert.equal(await f.evaluate((e) => getComputedStyle(e).fontSize), "16px");
  assert.equal(new Set(boxes.map((b) => Math.round(b!.y))).size, 1, `control tops align ${JSON.stringify(boxes)}`);
  const labels = await Promise.all(["Every", "Unit", "On day"].map((n) => page.locator("label.field", { hasText: n }).first().boundingBox()));
  assert.equal(new Set(labels.map((b) => Math.round(b!.y))).size, 1, "label tops align");
  assert.ok((await page.getByRole("button", { name: "Save rule" }).boundingBox())!.height >= 40, "Save rule");
  assert.equal(await page.getByText("every month", { exact: true }).count(), 1, "phrase shown once");
});
