import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { after, before, describe, test } from "node:test";
import { createDb, users, journalSettings, drafts } from "@repo/db";
import { eq, inArray } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { getJournalTemplate, saveJournalTemplate, setAlwaysLoadTemplate, getJournalDay, saveJournalDay, appendJournal } from "./journal.ts";

const url = process.env.TEST_POSTGRES_URL;
if (!url && process.env.CI) test("Journal database tests require Postgres in CI", () => assert.fail("TEST_POSTGRES_URL missing"));

describe("Journal templates", { skip: !url && "TEST_POSTGRES_URL missing" }, () => {
  const admin = createDb(url!).$client;
  const database = `bearing_journal_template_${randomUUID().replaceAll("-", "")}`;
  const connection = new URL(url ?? "postgres://localhost/test");
  connection.pathname = `/${database}`;
  const db = createDb(connection.toString());
  const a = randomUUID(), b = randomUUID();
  before(async () => {
    await admin.query(`create database "${database}"`);
    await migrate(db, { migrationsFolder: fileURLToPath(new URL("../../../packages/db/drizzle", import.meta.url)) });
    await db.insert(users).values([a, b].map((id) => ({ id, email: `${id}@test.invalid`, passwordHash: "-" })));
  });
  after(async () => {
    await db.delete(users).where(inArray(users.id, [a, b]));
    await db.$client.end();
    await admin.query(`drop database if exists "${database}"`);
    await admin.end();
  });
  test("starter sections and default-off setting are read-only before customization", async () => {
    await db.transaction(async (tx) => {
      await tx.execute("set transaction read only");
      assert.deepEqual(await getJournalTemplate(a, tx), {
        template: "## Gratitude\n\n## Best thing\n\n## Hard part\n",
        alwaysLoad: false,
      });
    });
  });
  test("view writes no settings row", async () => {
    await getJournalTemplate(a, db);
    assert.equal((await db.select().from(journalSettings).where(eq(journalSettings.userId, a))).length, 0);
  });
  test("custom templates preserve every character at the bound and reject longer input", async () => {
    const template = "\n## My prompts\r\n" + "x".repeat(9_984);
    assert.equal(template.length, 10_000);
    await saveJournalTemplate(a, template, db);
    assert.deepEqual(await getJournalTemplate(a, db), { template, alwaysLoad: false });
    await assert.rejects(saveJournalTemplate(a, template + "!", db), /10,000/);
    assert.equal((await getJournalTemplate(a, db)).template, template);
    await saveJournalTemplate(a, "", db);
    assert.equal((await getJournalTemplate(a, db)).template, "");
  });
  test("always-load persists independently of the template and account ownership", async () => {
    await setAlwaysLoadTemplate(b, true, db);
    assert.deepEqual(await getJournalTemplate(b, db), {
      template: "## Gratitude\n\n## Best thing\n\n## Hard part\n", alwaysLoad: true,
    });
    assert.deepEqual(await getJournalTemplate(a, db), { template: "", alwaysLoad: false });
    await saveJournalTemplate(b, "## Private B\n", db);
    assert.deepEqual(await getJournalTemplate(b, db), { template: "## Private B\n", alwaysLoad: true });
    await setAlwaysLoadTemplate(b, false, db);
    assert.deepEqual(await getJournalTemplate(b, db), { template: "## Private B\n", alwaysLoad: false });
    assert.deepEqual(await getJournalTemplate(a, db), { template: "", alwaysLoad: false });
    await assert.rejects(setAlwaysLoadTemplate(b, "false" as unknown as boolean, db), /boolean/);
    assert.deepEqual(await getJournalTemplate(b, db), { template: "## Private B\n", alwaysLoad: false });
  });
  test("untouched templates and empty bodies cannot create a day; edited words save", async () => {
    const starterUser = randomUUID();
    await db.insert(users).values({ id: starterUser, email: `${starterUser}@test.invalid`, passwordHash: "-" });
    try {
      const { template } = await getJournalTemplate(starterUser, db);
      for (const body of ["", " \n\t", template]) {
        await db.transaction(async (tx) => {
          await tx.execute("set transaction read only");
          assert.equal(await saveJournalDay(starterUser, "2026-10-10", body, 0, "2026-10-11", tx), null);
        });
        assert.equal(await getJournalDay(starterUser, "2026-10-10", db), null);
      }
      await saveJournalTemplate(starterUser, "## My question\n", db);
      assert.equal(await saveJournalDay(starterUser, "2026-10-10", "## My question\n", 0, "2026-10-11", db), null);
      assert.equal(await getJournalDay(starterUser, "2026-10-10", db), null);
      const edited = "## My question\nA walk with a friend.";
      assert.equal((await saveJournalDay(starterUser, "2026-10-10", edited, 0, "2026-10-11", db))?.body, edited);
      assert.equal((await getJournalDay(starterUser, "2026-10-10", db))?.body, edited);
    } finally { await db.delete(users).where(eq(users.id, starterUser)); }
  });
  test("template changes leave an existing day and its revision alone", async () => {
    const original = (await saveJournalDay(a, "2026-10-09", "A reflection", 0, "2026-10-11", db))!;
    await saveJournalTemplate(a, "## Changed prompt\n", db);
    await setAlwaysLoadTemplate(a, true, db);
    assert.deepEqual(await getJournalDay(a, original.day, db), original);
    // Existing documents are ordinary editable text, even if they match a prompt.
    const saved = (await saveJournalDay(a, original.day, "## Changed prompt\n", original.revision, "2026-10-11", db))!;
    assert.equal(saved.body, "## Changed prompt\n");
    assert.equal(await getJournalDay(b, original.day, db), null);
  });
  test("an untouched loaded template is refused after another tab changes the settings", async () => {
    await saveJournalTemplate(a, "## Old question\n", db);
    const loaded = (await getJournalTemplate(a, db)).template;
    await saveJournalTemplate(a, "## New question\n", db);
    assert.equal(await saveJournalDay(a, "2026-10-08", loaded, 0, "2026-10-11", db, loaded), null);
    assert.equal(await getJournalDay(a, "2026-10-08", db), null);
    assert.equal((await saveJournalDay(a, "2026-10-08", loaded + "An answer.", 0, "2026-10-11", db, loaded))?.body, loaded + "An answer.");
  });
  test("always-load never adds prompts to Inbox or coach appends, even for template text", async () => {
    await saveJournalTemplate(a, "## Prompt\n", db);
    await setAlwaysLoadTemplate(a, true, db);
    const draftId = randomUUID();
    await db.insert(drafts).values({ id: draftId, userId: a, body: "## Prompt\n" });
    await appendJournal(a, { day: "2026-10-07", today: "2026-10-11", text: "## Prompt\n", source: "draft", operationId: draftId }, db);
    assert.equal((await getJournalDay(a, "2026-10-07", db))?.body, "## Prompt\n");
    await appendJournal(a, { day: "2026-10-06", today: "2026-10-11", text: "Only the requested text", source: "coach", operationId: randomUUID() }, db);
    assert.equal((await getJournalDay(a, "2026-10-06", db))?.body, "Only the requested text");
  });
  test("deleting an account cascades its settings", async () => {
    const owner = randomUUID();
    await db.insert(users).values({ id: owner, email: `${owner}@test.invalid`, passwordHash: "-" });
    await saveJournalTemplate(owner, "Private prompt", db);
    await db.delete(users).where(eq(users.id, owner));
    assert.deepEqual(await getJournalTemplate(owner, db), {
      template: "## Gratitude\n\n## Best thing\n\n## Hard part\n", alwaysLoad: false,
    });
  });
});
