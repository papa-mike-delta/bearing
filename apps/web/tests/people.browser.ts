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
import { related } from "../lib/links.ts";
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
  await db!.insert(users).values(
    [owner, other].map((id) => ({
      id,
      email: `${id}@test.invalid`,
      passwordHash: "-",
    })),
  );
  await db!.insert(sessions).values({
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
    // Quick add stays on /people; the new person opens from the board.
    await page.getByRole("link", { name: /^New person/ }).click();
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
    const relatedSection = page.getByRole("region", {
      name: "Related",
      exact: true,
    });
    await relatedSection
      .getByRole("button", { name: "Add link", exact: true })
      .click();
    await relatedSection.getByRole("combobox").fill("New person");
    await relatedSection.getByText("No matches", { exact: true }).waitFor();
    await relatedSection.getByRole("combobox").fill("Ada");
    await relatedSection
      .getByRole("button", { name: "Person: Ada", exact: true })
      .waitFor();
    assert.equal(
      await relatedSection.getByText("No matches", { exact: true }).count(),
      0,
    );
    await relatedSection
      .getByRole("button", { name: "Cancel", exact: true })
      .click();
    assert.deepEqual(await related(owner, { kind: "person", id }, db!), {
      outgoing: [],
      incoming: [],
    });
    await relatedSection
      .getByRole("button", { name: "Add link", exact: true })
      .click();
    await relatedSection.getByRole("combobox").fill("Ada");
    await relatedSection
      .getByRole("button", { name: "Person: Ada", exact: true })
      .click();
    await relatedSection
      .getByRole("link", { name: "Ada", exact: true })
      .waitFor();
    await relatedSection
      .getByRole("button", { name: "Add link", exact: true })
      .click();
    await relatedSection.getByRole("combobox").fill("Ada");
    await relatedSection
      .getByRole("button", { name: "Person: Ada · Linked", exact: true })
      .click();
    await relatedSection
      .getByRole("status")
      .filter({ hasText: "That link already exists." })
      .waitFor();
    assert.equal(
      (await related(owner, { kind: "person", id }, db!)).outgoing.length,
      1,
    );
    // At 393 Add link and Remove link share one outlined style, both >= 40px.
    const wide = page.viewportSize();
    await page.setViewportSize({ width: 393, height: 852 });
    for (const name of ["Add link", "Remove link"]) {
      const button = relatedSection.getByRole("button", { name, exact: true });
      const box = await button.boundingBox();
      assert.ok(box && box.height >= 40, `${name} is ${box?.height}px tall`);
      const border = await button.evaluate(
        (el) => getComputedStyle(el).borderTopWidth,
      );
      assert.notEqual(border, "0px", `${name} has a visible border`);
    }
    if (wide) await page.setViewportSize(wide);
    await relatedSection
      .getByRole("link", { name: "Ada", exact: true })
      .click();
    await page.waitForURL(`**/people/${adaId}`);
    await relatedSection
      .getByRole("link", { name: "New person", exact: true })
      .waitFor();
    assert.equal(
      await relatedSection
        .getByRole("button", { name: "Remove link", exact: true })
        .count(),
      0,
    );
    await relatedSection
      .getByRole("link", { name: "New person", exact: true })
      .click();
    await page.waitForURL(`**/people/${id}`);
    page.once("dialog", (dialog) => {
      assert.equal(dialog.message(), "Remove this link?");
      void dialog.accept();
    });
    await relatedSection
      .getByRole("button", { name: "Remove link", exact: true })
      .click();
    await relatedSection
      .getByText("No outgoing links.", { exact: true })
      .waitFor();
    assert.ok(await getPerson(owner, adaId, db!));
    assert.ok(await getPerson(owner, id, db!));
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
      async () =>
        (await page.locator("output").getAttribute("data-day")) ===
        "2026-02-28",
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
      async () =>
        (await page.locator("output").getAttribute("data-day")) ===
        "2026-11-03",
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
    await db!.insert(sessions).values({
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

test("person to person: link Ada to Bo from Ada's page, then Bo shows the backlink", async (t) => {
  if (!enabled) return t.skip("PEOPLE_TEST_BASE_URL and TEST_POSTGRES_URL");
  const bo = await createPerson(
    owner,
    { name: "Bo Pairlink", group: "Close friends" },
    db!,
  );
  const ada = await createPerson(
    owner,
    { name: "Ada Pairlink", group: "Family" },
    db!,
  );
  // The acceptance test ends signed in as the other account; sign back in as owner.
  await context.addCookies([
    { name: "authjs.session-token", value: token, url: base!, httpOnly: true },
  ]);
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  await page.goto(`${base}/people/${ada.id}`);
  const relatedSection = page.getByRole("region", {
    name: "Related",
    exact: true,
  });
  await relatedSection
    .getByRole("button", { name: "Add link", exact: true })
    .click();
  await relatedSection.getByRole("combobox").fill("Bo Pairlink");
  await relatedSection
    .getByRole("button", { name: "Person: Bo Pairlink", exact: true })
    .click();
  await relatedSection
    .getByRole("link", { name: "Bo Pairlink", exact: true })
    .waitFor();
  const fromAda = await related(owner, { kind: "person", id: ada.id }, db!);
  assert.ok(fromAda.outgoing.some((i) => i.id === bo.id));
  await page.goto(`${base}/people/${bo.id}`);
  await relatedSection
    .getByRole("link", { name: ada.name, exact: true })
    .waitFor();
  assert.equal(
    await relatedSection
      .getByRole("button", { name: "Remove link", exact: true })
      .count(),
    0,
  );
  const fromBo = await related(owner, { kind: "person", id: bo.id }, db!);
  assert.deepEqual(fromBo.outgoing, []);
  assert.deepEqual(
    fromBo.incoming.map((i) => i.id),
    [ada.id],
  );
  await page.close();
});

test('Add note writes immediately to Outgoing and No notebook, opens the existing Note page',async(t)=>{
 if(!enabled) return t.skip('PEOPLE_TEST_BASE_URL and TEST_POSTGRES_URL');
 await context.addCookies([{name:'authjs.session-token',value:token,url:base!,httpOnly:true}]);
 const p=await createPerson(owner,{name:'Note person',group:'Family'},db!);
 await page.goto(`${base}/people/${p.id}`);
 await page.getByLabel('Note text',{exact:true}).fill('A memory\nExact words');
 await page.getByLabel('Occasion date (optional)',{exact:true}).fill('2026-10-09');
 for(const width of [900,393]) {
 await page.setViewportSize({width,height:852});
 const button=page.getByRole('button',{name:'Add note',exact:true});const box=await button.boundingBox();assert.ok(box && box.height >= (width<=480?44:40));
 assert.equal(await page.getByLabel('Note text',{exact:true}).evaluate(el=>getComputedStyle(el).fontSize),'16px');
 }
 await page.getByRole('button',{name:'Add note',exact:true}).click();
 const region=page.getByRole('region',{name:'Related',exact:true});
 await region.getByRole('link',{name:'A memory',exact:true}).waitFor();
 await page.reload();await region.getByRole('link',{name:'A memory',exact:true}).click();
 await page.waitForURL(/\/notes\/loose\/[\w-]+$/);
 await page.getByRole('heading',{name:'A memory',exact:true}).waitFor();
 await page.goto(`${base}/notes`);
 await page.getByRole('link',{name:'A memory',exact:true}).waitFor();
});
