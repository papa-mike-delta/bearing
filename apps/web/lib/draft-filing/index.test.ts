import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { after, before, describe, test } from "node:test";
import { createDb, draftFilings, drafts, journalEntries, journalOperations, noteOperations, notes, tasks, users } from "@repo/db";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { type FileDraftInput } from "@repo/domain";
import { createArea } from "../areas.ts";
import { createNotebook, deleteNote, getNote, saveNote } from "../notes.ts";
import { getJournalDay, saveJournalDay } from "../journal.ts";
import { openTasks } from "../tasks.ts";
import { fileDraft, fileDraftAsJournal, fileDraftAsNote, fileDraftAsTask } from "./index.ts";

const url = process.env.TEST_POSTGRES_URL;
if (!url && process.env.CI) test("Draft filing tests require Postgres in CI", () => assert.fail("TEST_POSTGRES_URL missing"));

describe("Draft filing interface (Postgres)", { skip: !url && "TEST_POSTGRES_URL missing" }, () => {
  const admin = createDb(url!).$client;
  const database = `bearing_filing_${randomUUID().replaceAll("-", "")}`;
  const connection = new URL(url ?? "postgres://localhost/test");
  connection.pathname = `/${database}`;
  const db = createDb(connection.toString());
  const today = "2026-10-11";
  async function account() {
    const userId = randomUUID();
    await db.insert(users).values({ id: userId, email: `${userId}@test.invalid`, passwordHash: "-" });
    const area = await createArea(userId, "Tasks", db);
    const book = await createNotebook(userId, "Reflections", db);
    return { userId, area: area!, book };
  }
  async function draft(userId: string, body = "Original title\nFull **markdown**\r\n") {
    const [row] = await db.insert(drafts).values({ userId, body }).returning();
    return row!;
  }
  const destination = (kind: "task" | "note" | "journal", bookId: string): FileDraftInput["destination"] =>
    kind === "note" ? { kind, notebookId: bookId } : kind === "journal" ? { kind, day: today } : { kind };
  before(async () => {
    await admin.query(`create database "${database}"`);
    await migrate(db, { migrationsFolder: fileURLToPath(new URL("../../../../packages/db/drizzle", import.meta.url)) });
  });
  after(async () => {
    await db.$client.end();
    await admin.query(`drop database if exists "${database}"`);
    await admin.end();
  });

  for (const kind of ["task", "note", "journal"] as const) {
    test(`${kind} filing archives atomically and replays its original receipt after edits`, async () => {
      const { userId, book } = await account();
      const captured = await draft(userId);
      const input = { draftId: captured.id, destination: destination(kind, book.id), today };
      const original = await fileDraft(userId, input, db);
      assert.equal(original.kind, kind);
      assert.equal((await db.select().from(drafts).where(eq(drafts.id, captured.id)))[0]?.workspace, "archive");
      if (original.kind === "task") {
        assert.equal(original.name, "Original title");
        const [task] = await db.select().from(tasks).where(eq(tasks.id, original.id));
        assert.equal(task?.note, "Full **markdown**");
        assert.equal(task?.source, null);
        await db.update(tasks).set({ name: "Edited task" }).where(eq(tasks.id, original.id));
      } else if (original.kind === "note") {
        assert.equal(original.name, "Original title");
        const note = (await getNote(userId, original.id, db))!;
        assert.equal(note.body, captured.body);
        await saveNote(userId, note.id, { ...note, title: "Edited Note", body: "Edited body" }, db);
      } else {
        const entry = (await getJournalDay(userId, original.day, db))!;
        assert.equal(entry.body, captured.body);
        await saveJournalDay(userId, original.day, "Hand edited Journal", entry.revision, today, db);
      }
      assert.deepEqual(await Promise.all([fileDraft(userId, input, db), fileDraft(userId, input, db)]), [original, original]);
      const filings = await db.select().from(draftFilings).where(eq(draftFilings.draftId, captured.id));
      const operations = await db.select().from(journalOperations).where(eq(journalOperations.operationId, captured.id));
      assert.equal(filings.length, kind === "journal" ? 0 : 1);
      assert.equal(operations.length, kind === "journal" ? 1 : 0);
      assert.equal((await openTasks(userId, db)).length, kind === "task" ? 1 : 0);
      assert.equal((await db.select().from(notes).where(eq(notes.userId, userId))).length, kind === "note" ? 1 : 0);
      if (kind === "journal") assert.equal((await getJournalDay(userId, today, db))?.body, "Hand edited Journal");
      const otherBook = await createNotebook(userId, "Other", db);
      for (const changed of [
        { kind: "task", name: "Different task" },
        { kind: "note", notebookId: otherBook.id },
        { kind: "journal", day: "2026-10-10" },
      ] as const) {
        await assert.rejects(fileDraft(userId, { ...input, destination: changed }, db), /different destination|different day/);
      }
      if (original.kind === "note") {
        const edited = (await getNote(userId, original.id, db))!;
        await deleteNote(userId, original.id, edited.revision, db);
        assert.deepEqual(await fileDraft(userId, input, db), original);
        await assert.rejects(fileDraftAsNote(userId, captured.id, { notebookId: book.id, title: "Retry" }, db), {
          message: "The previously created Note is no longer available. It will not be recreated.",
        });
        assert.equal((await db.select().from(notes).where(eq(notes.userId, userId))).length, 0);
        assert.equal((await db.select().from(noteOperations).where(eq(noteOperations.sourceId, captured.id))).length, 1);
      }
    });
  }

  test("another account cannot file a Draft through any of the four filing paths", async () => {
    const owner = await account();
    const intruder = await account();
    const captured = await draft(owner.userId);
    await Promise.allSettled([
      fileDraft(intruder.userId, { draftId: captured.id, destination: { kind: "task" }, today }, db),
      fileDraftAsTask(intruder.userId, captured.id, db, { today }),
      fileDraftAsNote(intruder.userId, captured.id, { notebookId: intruder.book.id, title: "Stolen" }, db),
      fileDraftAsJournal(intruder.userId, captured.id, { day: today, today }, db),
    ]);
    await assert.rejects(fileDraft(intruder.userId, { draftId: captured.id, destination: { kind: "note", notebookId: intruder.book.id }, today }, db), /Draft not found/);
    assert.equal((await db.select().from(drafts).where(eq(drafts.id, captured.id)))[0]?.workspace, "inbox");
    assert.equal((await db.select().from(draftFilings).where(eq(draftFilings.draftId, captured.id))).length, 0);
    assert.equal((await db.select().from(journalOperations).where(eq(journalOperations.operationId, captured.id))).length, 0);
    for (const userId of [owner.userId, intruder.userId]) {
      assert.equal((await openTasks(userId, db)).length, 0);
      assert.equal((await db.select().from(notes).where(eq(notes.userId, userId))).length, 0);
      assert.equal(await getJournalDay(userId, today, db), null);
    }
  });

  test("screen Note titles, live Note replay and Task Area choice survive Coach replay", async () => {
    const { userId, book } = await account();
    const secondArea = (await createArea(userId, "Work", db))!;
    const taskDraft = await draft(userId);
    assert.equal(await fileDraftAsTask(userId, taskDraft.id, db, { today, area: "work" }), true);
    const taskReceipt = await fileDraft(userId, { draftId: taskDraft.id, destination: { kind: "task" }, today }, db);
    const [task] = await db.select().from(tasks).where(eq(tasks.id, taskReceipt.id));
    assert.equal(task?.areaId, secondArea.id);
    const noteDraft = await draft(userId);
    const note = await fileDraftAsNote(userId, noteDraft.id, { notebookId: book.id, title: "Editable screen title" }, db);
    const edited = await saveNote(userId, note.id, { ...note, title: "Later title" }, db);
    assert.deepEqual(await fileDraftAsNote(userId, noteDraft.id, { notebookId: book.id, title: "Ignored on retry" }, db), edited);
    assert.deepEqual(await fileDraft(userId, { draftId: noteDraft.id, destination: { kind: "note", notebook: "reflections" }, today }, db), {
      kind: "note", id: note.id, name: "Editable screen title", notebookId: book.id,
    });
    const journalDraft = await draft(userId);
    const receipt = await fileDraftAsJournal(userId, journalDraft.id, { day: today, today }, db);
    assert.deepEqual(await fileDraft(userId, { draftId: journalDraft.id, destination: { kind: "journal" }, today }, db), { kind: "journal", ...receipt });
    assert.equal((await openTasks(userId, db)).length, 1);
  });

  test("text operation identities preserve the supplied Draft UUID spelling", async () => {
    const { userId, book } = await account();
    const noteDraft = await draft(userId);
    const noteId = noteDraft.id.toUpperCase();
    const noteInput = { notebookId: book.id, title: "Screen title" };
    const note = await fileDraftAsNote(userId, noteId, noteInput, db);
    assert.deepEqual(await fileDraftAsNote(userId, noteId, noteInput, db), note);
    assert.equal((await db.select().from(noteOperations).where(eq(noteOperations.noteId, note.id)))[0]?.sourceId, noteId);
    await assert.rejects(fileDraftAsNote(userId, noteDraft.id, noteInput, db), { message: "That item is unavailable. Refresh and try again." });
    const journalDraft = await draft(userId);
    const journalId = journalDraft.id.toUpperCase();
    const journalInput = { day: today, today };
    const receipt = await fileDraftAsJournal(userId, journalId, journalInput, db);
    assert.deepEqual(await fileDraftAsJournal(userId, journalId, journalInput, db), receipt);
    assert.equal((await db.select().from(journalOperations).where(eq(journalOperations.userId, userId)))[0]?.operationId, journalId);
    await assert.rejects(fileDraftAsJournal(userId, journalDraft.id, journalInput, db), { message: "That item is unavailable. Refresh and try again." });
  });

  test("competing Task, Note and Journal filings and duplicates serialize to one destination", async () => {
    const { userId, book } = await account();
    const captured = await draft(userId);
    const inputs = (["task", "note", "journal"] as const).map((kind) => ({ draftId: captured.id, destination: destination(kind, book.id), today }));
    const results = await Promise.allSettled(inputs.flatMap((input) => [fileDraft(userId, input, db), fileDraft(userId, input, db)]));
    const successes = results.filter((result) => result.status === "fulfilled");
    assert.equal(successes.length, 2);
    assert.deepEqual(successes[0]!.value, successes[1]!.value);
    assert.equal((await openTasks(userId, db)).length
      + (await db.select().from(notes).where(eq(notes.userId, userId))).length
      + Number(Boolean(await getJournalDay(userId, today, db))), 1);
    assert.equal((await db.select().from(drafts).where(eq(drafts.id, captured.id)))[0]?.workspace, "archive");
    assert.equal((await db.select().from(draftFilings).where(eq(draftFilings.draftId, captured.id))).length
      + (await db.select().from(journalOperations).where(eq(journalOperations.operationId, captured.id))).length, 1);
  });

  test("failure during archive rolls back every destination and receipt, permitting a corrected retry", async () => {
    // Fail after the destination and durable result were written. This check is
    // confined to this test database; the production schema is unchanged.
    await db.$client.query("alter table drafts add constraint reject_filing_archive check (body <> 'Reject archive' or workspace = 'inbox')");
    try {
      for (const kind of ["task", "note", "journal"] as const) {
        const { userId, book } = await account();
        const captured = await draft(userId, "Reject archive");
        const input = { draftId: captured.id, destination: destination(kind, book.id), today };
        await assert.rejects(fileDraft(userId, input, db));
        assert.equal((await db.select().from(drafts).where(eq(drafts.id, captured.id)))[0]?.workspace, "inbox");
        assert.deepEqual(await openTasks(userId, db), []);
        for (const table of [notes, journalEntries, draftFilings, noteOperations, journalOperations]) {
          assert.deepEqual(await db.select().from(table).where(eq(table.userId, userId)), []);
        }
        await db.update(drafts).set({ body: "Corrected filing" }).where(eq(drafts.id, captured.id));
        assert.equal((await fileDraft(userId, input, db)).kind, kind);
        assert.equal((await db.select().from(drafts).where(eq(drafts.id, captured.id)))[0]?.workspace, "archive");
      }
    } finally {
      await db.$client.query("alter table drafts drop constraint reject_filing_archive");
    }
  });
});
