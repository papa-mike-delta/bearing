import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { after, before, describe, test } from "node:test";
import { createDb, journalOperations, users } from "@repo/db";
import { eq, inArray } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { appendJournal, getJournalDay, saveJournalDay } from "./journal.ts";
import { captureDraft, fileDraftAsJournal, fileDraftAsTask, inboxDrafts } from "./drafts.ts";
import { createArea } from "./areas.ts";
import { createNotebook, fileDraftAsNote } from "./notes.ts";

const url = process.env.TEST_POSTGRES_URL;
if (!url && process.env.CI) test("Journal append tests require Postgres in CI", () => assert.fail("TEST_POSTGRES_URL missing"));

describe("Journal append", { skip: !url && "TEST_POSTGRES_URL missing" }, () => {
  const admin = createDb(url!).$client;
  const database = `bearing_append_${randomUUID().replaceAll("-", "")}`;
  const connection = new URL(url ?? "postgres://localhost/test");
  connection.pathname = `/${database}`;
  const db = createDb(connection.toString());
  const a = randomUUID(), b = randomUUID();
  const today = "2026-10-11";
  async function draft(body: string, userId = a) {
    await captureDraft(userId, body, db);
    return (await inboxDrafts(userId, db))[0]!;
  }
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
  test("filing archives and preserves the entire draft in the day's single document", async () => {
    const first = await draft("# First\n\nFull **markdown**\r\n");
    const receipt = await fileDraftAsJournal(a, first.id, { day: today, today }, db);
    assert.equal(receipt.day, today);
    assert.equal((await getJournalDay(a, today, db))?.body, first.body);
    assert.ok(!(await inboxDrafts(a, db)).some((row) => row.id === first.id));
    const second = await draft("Second reflection");
    const appended = await fileDraftAsJournal(a, second.id, { day: today, today }, db);
    assert.equal(appended.id, receipt.id);
    const entry = (await getJournalDay(a, today, db))!;
    assert.equal(entry.body, "# First\n\nFull **markdown**\r\n\n\nSecond reflection");
    assert.equal(entry.revision, 2);
    assert.ok(!(await inboxDrafts(a, db)).some((row) => row.id === second.id));
  });
  test("lost-response retries return the original day and entry, even after a hand edit", async () => {
    const captured = await draft("Remember this reflection");
    const input = { day: "2026-10-10", today };
    const results = await Promise.all([1, 2].map(() => fileDraftAsJournal(a, captured.id, input, db)));
    assert.deepEqual(results[0], results[1]);
    const entry = (await getJournalDay(a, input.day, db))!;
    assert.equal(entry.body, captured.body);
    assert.equal(entry.revision, 1);
    const edited = (await saveJournalDay(a, input.day, "Hand edited; original text removed", entry.revision, today, db))!;
    assert.deepEqual(await fileDraftAsJournal(a, captured.id, { ...input, today: "2026-10-12" }, db), results[0]);
    assert.deepEqual(await getJournalDay(a, input.day, db), edited);
  });
  test("the same operation with changed text or day conflicts without changing either day", async () => {
    const input = { day: "2026-10-09", today, text: "Original reflection", source: "coach" as const, operationId: randomUUID() };
    const receipt = await appendJournal(a, input, db);
    const original = await getJournalDay(a, input.day, db);
    await assert.rejects(appendJournal(a, { ...input, text: "Changed reflection" }, db), /Conflict/);
    await assert.rejects(appendJournal(a, { ...input, day: "2026-10-08" }, db), /Conflict/);
    assert.deepEqual(await appendJournal(a, { ...input, today: "2026-10-12" }, db), receipt);
    assert.deepEqual(await getJournalDay(a, input.day, db), original);
    assert.equal(await getJournalDay(a, "2026-10-08", db), null);
    const captured = await draft("Draft destination stays fixed");
    await fileDraftAsJournal(a, captured.id, { day: input.day, today }, db);
    const afterDraft = await getJournalDay(a, input.day, db);
    await assert.rejects(fileDraftAsJournal(a, captured.id, { day: "2026-10-08", today }, db), /Conflict/);
    await assert.rejects(appendJournal(a, { ...input, source: "draft", operationId: captured.id, text: "Changed draft" }, db), /Conflict/);
    assert.deepEqual(await getJournalDay(a, input.day, db), afterDraft);
    assert.equal(await getJournalDay(a, "2026-10-08", db), null);
  });
  test("future, impossible, and missing browser days leave drafts in the Inbox", async () => {
    const captured = await draft("Calendar validation");
    for (const input of [
      { day: "2026-10-12", today },
      { day: "2023-02-29", today },
      { day: "2026-04-31", today },
      { day: "0000-01-01", today },
      { day: "2026-2-03", today },
      { day: "2026-10-07", today: "" },
      { day: "2026-10-07", today: "2026-02-29" },
    ]) {
      await assert.rejects(fileDraftAsJournal(a, captured.id, input, db), /calendar day|not open yet/);
      assert.ok((await inboxDrafts(a, db)).some((row) => row.id === captured.id));
    }
    assert.equal(await getJournalDay(a, "2026-10-12", db), null);
    assert.equal(await getJournalDay(a, "2026-10-07", db), null);
    // Accepted only when it is Today in this browser, regardless of server date.
    const receipt = await fileDraftAsJournal(a, captured.id, { day: "2024-02-29", today: "2024-02-29" }, db);
    assert.equal(receipt.day, "2024-02-29");
  });
  test("the total body bound rolls back append, archive, and provenance; a corrected retry works", async () => {
    const day = "2026-10-07";
    const full = (await saveJournalDay(a, day, "x".repeat(99_998), 0, today, db))!;
    const captured = await draft("z");
    await assert.rejects(fileDraftAsJournal(a, captured.id, { day, today }, db), /100,000/);
    assert.deepEqual(await getJournalDay(a, day, db), full);
    assert.ok((await inboxDrafts(a, db)).some((row) => row.id === captured.id));
    await saveJournalDay(a, day, "x".repeat(99_997), full.revision, today, db);
    await fileDraftAsJournal(a, captured.id, { day, today }, db);
    const accepted = (await getJournalDay(a, day, db))!;
    assert.equal(accepted.body, "x".repeat(99_997) + "\n\nz");
    assert.equal(accepted.body.length, 100_000);
    assert.ok(!(await inboxDrafts(a, db)).some((row) => row.id === captured.id));
    for (const body of ["x".repeat(100_001), " \n\t"]) {
      const invalid = await draft(body);
      await assert.rejects(fileDraftAsJournal(a, invalid.id, { day: "2026-10-06", today }, db), /nonempty.*100,000/);
      assert.ok((await inboxDrafts(a, db)).some((row) => row.id === invalid.id));
      assert.equal(await getJournalDay(a, "2026-10-06", db), null);
    }
    // Match the shared Notes limit: JS counts each emoji as two characters.
    const emojiDay = "2026-10-05";
    await saveJournalDay(a, emojiDay, "x".repeat(99_997), 0, today, db);
    const emoji = await draft("😀");
    await assert.rejects(fileDraftAsJournal(a, emoji.id, { day: emojiDay, today }, db), /100,000/);
    assert.ok((await inboxDrafts(a, db)).some((row) => row.id === emoji.id));
  });
  test("concurrent appends and their retries both survive exactly once", async () => {
    const day = "2026-10-04";
    const first = await draft("First concurrent append");
    const second = await draft("Second concurrent append");
    const input = { day, today };
    const results = await Promise.all([
      fileDraftAsJournal(a, first.id, input, db), fileDraftAsJournal(a, second.id, input, db),
      fileDraftAsJournal(a, first.id, input, db), fileDraftAsJournal(a, second.id, input, db),
    ]);
    assert.equal(new Set(results.map((row) => row.id)).size, 1);
    const entry = (await getJournalDay(a, day, db))!;
    assert.ok(["First concurrent append\n\nSecond concurrent append", "Second concurrent append\n\nFirst concurrent append"].includes(entry.body));
    assert.equal(entry.revision, 2);
    const remaining = await inboxDrafts(a, db);
    assert.ok(!remaining.some((row) => row.id === first.id || row.id === second.id));
    // Independent callers also share the writer and unique operation claim.
    const inputs = ["Third", "Fourth"].map((text) => ({ day, today, text, source: "coach" as const, operationId: randomUUID() }));
    await Promise.all(inputs.flatMap((input) => [appendJournal(a, input, db), appendJournal(a, input, db)]));
    const current = (await getJournalDay(a, day, db))!;
    assert.ok([entry.body + "\n\nThird\n\nFourth", entry.body + "\n\nFourth\n\nThird"].includes(current.body));
    assert.equal(current.revision, 4);
  });
  test("a full-page save waiting behind an append rejects the stale revision and keeps the appended text", async () => {
    const day = "2026-10-03";
    const original = (await saveJournalDay(a, day, "Saved reflection", 0, today, db))!;
    const captured = await draft("Appended reflection");
    let saving: Promise<void> | undefined;
    // Hold the row lock through the append, then submit the old editor revision
    // from another connection while the append transaction is still open.
    await db.transaction(async (tx) => {
      await fileDraftAsJournal(a, captured.id, { day, today }, tx);
      saving = assert.rejects(saveJournalDay(a, day, "Local unsaved edit", original.revision, today, db), /Conflict.*unsaved text is kept/);
    });
    await saving;
    const current = (await getJournalDay(a, day, db))!;
    assert.equal(current.body, "Saved reflection\n\nAppended reflection");
    assert.equal(current.revision, 2);
    // The caller can reconcile its retained text using the current revision.
    await saveJournalDay(a, day, current.body + "\n\nLocal unsaved edit", current.revision, today, db);
    assert.equal((await getJournalDay(a, day, db))?.body, "Saved reflection\n\nAppended reflection\n\nLocal unsaved edit");
  });
  test("foreign drafts are unavailable and the same day and operation identity stay private to each user", async () => {
    const day = "2026-10-02";
    const privateEntry = (await saveJournalDay(b, day, "Private B", 0, today, db))!;
    const foreign = await draft("Foreign draft", b);
    for (const draftId of [foreign.id, randomUUID(), "malformed"]) {
      await assert.rejects(fileDraftAsJournal(a, draftId, { day, today }, db), /unavailable/);
    }
    await assert.rejects(appendJournal(a, { day, today, text: foreign.body, source: "draft", operationId: foreign.id }, db), /unavailable/);
    assert.ok((await inboxDrafts(b, db)).some((row) => row.id === foreign.id));
    assert.equal(await getJournalDay(a, day, db), null);
    assert.deepEqual(await getJournalDay(b, day, db), privateEntry);
    const owned = await draft("Private A");
    const receipt = await fileDraftAsJournal(a, owned.id, { day, today }, db);
    assert.notEqual(receipt.id, privateEntry.id);
    assert.equal((await getJournalDay(a, day, db))?.body, "Private A");
    assert.deepEqual(await getJournalDay(b, day, db), privateEntry);
    await assert.rejects(fileDraftAsJournal(a, owned.id, { day: privateEntry.id, today }, db), /calendar day/);
    const operationId = randomUUID();
    const results = await Promise.all([a, b].map((userId) => appendJournal(userId, { day, today, text: "Owned append", source: "coach", operationId }, db)));
    assert.notEqual(results[0]!.id, results[1]!.id);
    assert.equal((await getJournalDay(a, day, db))?.body, "Private A\n\nOwned append");
    assert.equal((await getJournalDay(b, day, db))?.body, "Private B\n\nOwned append");
    await assert.rejects(appendJournal(a, { day, today, text: "Invented draft body", source: "draft", operationId: (await draft("Whole draft")).id }, db), /unavailable/);
  });
  test("stale Task/Note submissions cannot also append a filed draft", async () => {
    await createArea(a, "Tasks", db);
    const notebook = await createNotebook(a, "Notes", db);
    const taskDraft = await draft("Filed as a task");
    assert.equal(await fileDraftAsTask(a, taskDraft.id, db, { today }), true);
    const noteDraft = await draft("Filed as a note");
    await fileDraftAsNote(a, noteDraft.id, { notebookId: notebook.id, title: "Filed" }, db);
    for (const captured of [taskDraft, noteDraft]) {
      await assert.rejects(fileDraftAsJournal(a, captured.id, { day: "2026-10-01", today }, db), /unavailable/);
      assert.equal(await getJournalDay(a, "2026-10-01", db), null);
    }
  });
  test("concurrent appends at the size bound archive only the accepted draft", async () => {
    const day = "2026-09-30";
    await saveJournalDay(a, day, "x".repeat(99_995), 0, today, db);
    const first = await draft("aaa"), second = await draft("bbb");
    const results = await Promise.allSettled([first, second].map((captured) => fileDraftAsJournal(a, captured.id, { day, today }, db)));
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    const failed = results.find((result) => result.status === "rejected");
    assert.ok(failed?.status === "rejected");
    assert.match(failed.reason.message, /100,000/);
    const current = (await getJournalDay(a, day, db))!;
    assert.ok(["x".repeat(99_995) + "\n\naaa", "x".repeat(99_995) + "\n\nbbb"].includes(current.body));
    assert.equal(current.revision, 2);
    const remaining = await inboxDrafts(a, db);
    for (const [index, captured] of [first, second].entries()) {
      assert.equal(remaining.some((row) => row.id === captured.id), results[index]?.status === "rejected");
    }
  });
  test("deleting an account cascades its durable append provenance", async () => {
    const userId = randomUUID();
    await db.insert(users).values({ id: userId, email: `${userId}@test.invalid`, passwordHash: "-" });
    try {
      await appendJournal(userId, { day: today, today, text: "Removed with account", source: "coach", operationId: randomUUID() }, db);
      assert.equal((await db.select().from(journalOperations).where(eq(journalOperations.userId, userId))).length, 1);
      await db.delete(users).where(eq(users.id, userId));
      assert.equal((await db.select().from(journalOperations).where(eq(journalOperations.userId, userId))).length, 0);
      assert.equal(await getJournalDay(userId, today, db), null);
    } finally {
      await db.delete(users).where(eq(users.id, userId));
    }
  });
});
