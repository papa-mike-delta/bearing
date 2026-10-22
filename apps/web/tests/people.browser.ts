// Run against a local app using the same throwaway database. Never a live account.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from "playwright-core";
import { createDb, sessions, users } from "@repo/db";
import { inArray } from "drizzle-orm";
import { peopleGroups } from "@repo/domain";
import {
  createPerson,
  getPerson,
  listPeople,
  savePerson,
} from "../lib/people.ts";
const base = process.env.PEOPLE_TEST_BASE_URL;
const url = process.env.TEST_POSTGRES_URL;
const enabled = Boolean(base && url);
const db = enabled ? createDb(url!) : null;
let browser: Browser, context: BrowserContext, page: Page;
const owner = randomUUID(),
  other = randomUUID(),
  token = randomUUID();
const today = "2026-10-21";
let adaId = "";
async function until(check: () => Promise<boolean>, message: string) {
  for (let i = 0; i < 100; i++) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.fail(message);
}
before(async () => {
  if (!enabled) return;
  await db!
    .insert(users)
    .values(
      [owner, other].map((id) => ({
        id,
        email: `${id}@test.invalid`,
        passwordHash: "-",
      })),
    );
  await db!
    .insert(sessions)
    .values({
      sessionToken: token,
      userId: owner,
      expires: new Date(Date.now() + 3600_000),
    });
  for (const group of peopleGroups) {
    const p = await createPerson(
      owner,
      { name: group === "Family" ? "Ada" : `${group} person`, group },
      db!,
    );
    if (group === "Family") {
      adaId = p.id;
      await savePerson(
        owner,
        p.id,
        {
          ...p,
          rule: { every: 1, unit: "months" },
          lastConnected: "2026-01-31",
        },
        today,
        db!,
      );
    }
    if (group === "Close friends")
      await savePerson(
        owner,
        p.id,
        { ...p, rule: { every: 1, unit: "days" }, lastConnected: "2026-10-20" },
        today,
        db!,
      );
  }
  for (const [name, day] of [
    ["Zed", "2026-10-01"],
    ["Later", "2026-11-10"],
    ["Soon", "2026-10-25"],
    ["No day", null],
  ] as const) {
    const p = await createPerson(owner, { name, group: "Family" }, db!);
    await savePerson(
      owner,
      p.id,
      {
        ...p,
        rule: { every: 1, unit: "months" },
        agreedDay: day && day >= today ? day : null,
        lastConnected: day && day < today ? "2026-09-01" : null,
      },
      today,
      db!,
    );
  }
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH ?? "/opt/google/chrome/chrome",
    headless: true,
    args: ["--no-sandbox"],
  });
  context = await browser.newContext({ timezoneId: "UTC" });
  await context.addInitScript(() => {
    const Original = Date;
    // Keep calendar parsing intact, fixing only browser Today for these examples.
    class FixedDate extends Original {
      constructor(...args: ConstructorParameters<typeof Date>) {
        if (args.length) super(...args);
        else super("2026-10-21T12:00:00Z");
      }
      static now() {
        return new Original("2026-10-21T12:00:00Z").valueOf();
      }
    }
    Object.defineProperty(window, "Date", { value: FixedDate });
  });
  await context.addCookies([
    { name: "authjs.session-token", value: token, url: base!, httpOnly: true },
  ]);
  page = await context.newPage();
  page.setDefaultTimeout(10_000);
});
after(async () => {
  await browser?.close();
  if (db) {
    await db.delete(users).where(inArray(users.id, [owner, other]));
    await db.$client.end();
  }
});
test(
  "People browser acceptance: auth, group accordions, order, counts, explicit edits, guard, R, and delete confirmation",
  { skip: !enabled, timeout: 180_000 },
  async () => {
    const anonymous = await browser.newPage();
    await anonymous.goto(`${base}/people`);
    await anonymous.waitForURL("**/sign-in");
    await anonymous.goto(`${base}/people/${adaId}`);
    await anonymous.waitForURL("**/sign-in");
    await anonymous.close();
    await page.goto(`${base}/people`);
    await page
      .getByRole("button", { name: "Family (5)", exact: true })
      .waitFor();
    assert.deepEqual(
      await page.locator("main section h2 button").allTextContents(),
      peopleGroups.map((g) => `${g} (${g === "Family" ? 5 : 1})`),
    );
    assert.equal(
      await page
        .getByRole("button", { name: "Family (5)", exact: true })
        .getAttribute("aria-expanded"),
      "true",
    );
    assert.equal(
      await page
        .getByRole("button", { name: "Close friends (1)", exact: true })
        .getAttribute("aria-expanded"),
      "true",
    );
    assert.equal(
      await page
        .getByRole("button", { name: "Extended family (1)", exact: true })
        .getAttribute("aria-expanded"),
      "false",
    );
    assert.deepEqual(
      await page.locator("#group-0 li a span:first-child").allTextContents(),
      ["Ada", "Zed", "Soon", "Later", "No day"],
    );
    await until(
      async () =>
        (
          await page
            .getByRole("link", { name: /^People/ })
            .first()
            .textContent()
        )?.includes("3 people due") ?? false,
      "due count",
    );
    await page
      .getByRole("button", { name: "Extended family (1)", exact: true })
      .click();
    assert.equal(
      await page
        .getByRole("button", { name: "Family (5)", exact: true })
        .getAttribute("aria-expanded"),
      "true",
    );
    await page.reload();
    await page
      .getByRole("button", { name: "Extended family (1)", exact: true })
      .waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "Extended family (1)", exact: true })
        .getAttribute("aria-expanded"),
      "false",
    );
    assert.equal(
      await page.getByLabel("Group", { exact: true }).inputValue(),
      "",
    );
    await page.getByLabel("Name", { exact: true }).fill("  New person  ");
    await page.getByLabel("Group", { exact: true }).selectOption("Family");
    await page.getByRole("button", { name: "Add person", exact: true }).click();
    await page.waitForURL(/\/people\/[\w-]+$/);
    const id = page.url().split("/").at(-1)!;
    await page
      .getByRole("button", { name: "Save person", exact: true })
      .waitFor();
    assert.equal(
      await page.getByLabel("Name", { exact: true }).inputValue(),
      "New person",
    );
    assert.equal((await getPerson(owner, id, db!))?.rule, null);
    await page.getByLabel("Reach-out rule").check();
    assert.equal(
      await page.getByLabel("Every", { exact: true }).inputValue(),
      "1",
    );
    assert.equal(
      await page.getByLabel("Unit", { exact: true }).inputValue(),
      "months",
    );
    await page.getByText("every month", { exact: true }).waitFor();
    await page.getByLabel("Last connected", { exact: true }).fill("2026-01-31");
    await until(
      async () => (await page.locator("output").textContent()) === "2026-02-28",
      "derived next day",
    );
    await page.getByLabel("On day (optional)").selectOption("last");
    await page
      .getByText("every month on the last day", { exact: true })
      .waitFor();
    await page.getByLabel("Every", { exact: true }).fill("2");
    await page.getByLabel("Unit", { exact: true }).selectOption("weeks");
    await page.getByLabel("On day (optional)").selectOption("friday");
    await page.getByText("every 2 weeks on Friday", { exact: true }).waitFor();
    await page.getByLabel("Agreed day", { exact: true }).fill("2026-11-03");
    await until(
      async () => (await page.locator("output").textContent()) === "2026-11-03",
      "agreement overrides",
    );
    assert.equal((await getPerson(owner, id, db!))?.lastConnected, null);
    page.once("dialog", (dialog) => {
      assert.match(dialog.message(), /unsaved/i);
      void dialog.dismiss();
    });
    await page.locator('main > a[href="/people"]').click();
    assert.equal(page.url().split("/").at(-1), id);
    await page
      .getByRole("button", { name: "Save person", exact: true })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: /^Saved$/ })
      .waitFor();
    assert.equal((await getPerson(owner, id, db!))?.agreedDay, "2026-11-03");
    await page
      .getByRole("button", { name: "Connected today", exact: true })
      .click();
    assert.equal(
      await page.getByLabel("Last connected", { exact: true }).inputValue(),
      today,
    );
    assert.equal(
      (await getPerson(owner, id, db!))?.lastConnected,
      "2026-01-31",
    );
    await page.getByLabel("Last connected", { exact: true }).fill("2026-10-09");
    await page
      .getByRole("heading", { name: "New person", exact: true })
      .click();
    await page.keyboard.press("r");
    assert.equal(
      await page.getByLabel("Last connected", { exact: true }).inputValue(),
      today,
    );
    assert.equal(
      (await getPerson(owner, id, db!))?.lastConnected,
      "2026-01-31",
    );
    await page.getByLabel("Name", { exact: true }).fill("Changed");
    await page
      .getByLabel("Group", { exact: true })
      .selectOption("Acquaintances");
    await page
      .getByRole("button", { name: "Save person", exact: true })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: /^Saved$/ })
      .waitFor();
    assert.equal((await getPerson(owner, id, db!))?.name, "Changed");
    assert.equal((await getPerson(owner, id, db!))?.group, "Acquaintances");
    assert.equal((await getPerson(owner, id, db!))?.lastConnected, today);
    page.once("dialog", (dialog) => {
      assert.equal(dialog.message(), "Delete this person?");
      void dialog.dismiss();
    });
    await page
      .getByRole("button", { name: "Delete person", exact: true })
      .click();
    assert.ok(await getPerson(owner, id, db!));
    page.once("dialog", (dialog) => {
      assert.equal(dialog.message(), "Delete this person?");
      void dialog.accept();
    });
    await page
      .getByRole("button", { name: "Delete person", exact: true })
      .click();
    await page.waitForURL(`${base}/people`);
    assert.equal(await getPerson(owner, id, db!), null);
    // Foreign rows render not-found; an empty account hides every group and shows 0.
    const foreign = await createPerson(
      other,
      { name: "Private", group: "Family" },
      db!,
    );
    await page.goto(`${base}/people/${foreign.id}`);
    await page.getByRole("heading", { name: "404", exact: true }).waitFor();
    const emptyToken = randomUUID();
    await db!
      .insert(sessions)
      .values({
        sessionToken: emptyToken,
        userId: other,
        expires: new Date(Date.now() + 3600_000),
      });
    await context.addCookies([
      {
        name: "authjs.session-token",
        value: emptyToken,
        url: base!,
        httpOnly: true,
      },
    ]);
    await page.goto(`${base}/people`);
    await until(
      async () =>
        (
          await page
            .getByRole("link", { name: /^People/ })
            .first()
            .textContent()
        )?.includes("0 people due") ?? false,
      "zero due count",
    );
    assert.equal(await page.locator("main section").count(), 1);
    assert.equal((await listPeople(other, db!)).length, 1);
  },
);
