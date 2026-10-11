import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, test } from "node:test";
import { createDb, drafts, notebooks, notes, noteOperations, users } from "@repo/db";
import { eq, inArray } from "drizzle-orm";
import { createNotebook, createNote, deleteNote, fileDraftAsNote, getNote, getNotebook, listNotebooks, listNotes, saveNote } from "./notes.ts";
import { captureDraft, fileDraftAsTask, inboxDrafts } from "./drafts.ts";
import { createArea } from "./areas.ts";
import { openTasks } from "./tasks.ts";

const url = process.env.TEST_POSTGRES_URL;
if (!url && process.env.CI) test("Notes database tests require Postgres in CI", () => assert.fail("TEST_POSTGRES_URL missing"));

describe("Notes persistence", { skip: !url && "TEST_POSTGRES_URL missing" }, () => {
  const db = createDb(url!);
  const a = randomUUID(), b = randomUUID();
  let book = "", foreignBook = "";
  const operation = () => ({ source: "coach" as const, sourceId: randomUUID() });
  const input = (title = "A note") => ({ notebookId: book, title, body: "\n# Heading\n\nFull **markdown**\n" });
  before(async () => {
    await db.insert(users).values([a, b].map((id) => ({ id, email: `${id}@test.invalid`, passwordHash: "-" })));
    book = (await createNotebook(a, "Ideas", db)).id;
    foreignBook = (await createNotebook(b, "Private", db)).id;
    await createArea(a, "Tasks", db);
  });
  after(async () => {
    for (const table of [notes, noteOperations, notebooks, drafts]) await db.delete(table).where(inArray(table.userId, [a, b]));
    await db.delete(users).where(inArray(users.id, [a, b]));
    await db.$client.end();
  });
  test("owner-scoped reads, writes, destinations and malformed IDs", async () => {
    const note = await createNote(a, input(), operation(), db);
    assert.equal(await getNote(b, note.id, db), null);
    assert.equal(await getNotebook(b, book, db), null);
    assert.equal(await getNote(a, "invalid", db), null);
    assert.deepEqual(await listNotes(b, book, db), []);
    assert.equal((await listNotebooks(b, db))[0]?.id, foreignBook);
    await assert.rejects(createNote(a, { ...input(), notebookId: foreignBook }, operation(), db));
    await assert.rejects(saveNote(b, note.id, { ...note, title: "Foreign" }, db));
    await assert.rejects(deleteNote(b, note.id, note.revision, db));
    assert.equal((await getNote(a, note.id, db))?.title, note.title);
  });
  test("concurrent and lost-response retries return one Note; deletion retains tombstone", async () => {
    const from = operation();
    const rows = await Promise.all(Array.from({ length: 5 }, () => createNote(a, input("Replay"), from, db)));
    assert.equal(new Set(rows.map((row) => row.id)).size, 1);
    await deleteNote(a, rows[0]!.id, 1, db);
    await assert.rejects(createNote(a, input("Replay"), from, db), /no longer available/);
  });
  test("optimistic saves preserve exact markdown and reject concurrent changes", async () => {
    const note = await createNote(a, input("Edits"), operation(), db);
    const saves = await Promise.allSettled([saveNote(a, note.id, { ...note, body: "First", pinned: true }, db), saveNote(a, note.id, { ...note, body: "Second" }, db)]);
    assert.equal(saves.filter((s) => s.status === "fulfilled").length, 1);
    const current = (await getNote(a, note.id, db))!;
    assert.equal(current.revision, 2);
    await assert.rejects(deleteNote(a, note.id, 1, db));
    const saved = await saveNote(a, note.id, { ...current, body: input().body, pinned: true }, db);
    assert.equal(saved.body, input().body);
    const listed = await listNotes(a, book, db);
    assert.equal(listed[0]?.id, note.id);
  });
  test("filing validates, preserves full source, archives atomically and replays", async () => {
    await captureDraft(a, input().body, db);
    const draft = (await inboxDrafts(a, db))[0]!;
    await assert.rejects(fileDraftAsNote(b, draft.id, { notebookId: foreignBook, title: "No" }, db));
    await assert.rejects(fileDraftAsNote(a, draft.id, { notebookId: foreignBook, title: "No" }, db));
    await assert.rejects(fileDraftAsNote(a, draft.id, { notebookId: book, title: " " }, db));
    assert.ok((await inboxDrafts(a, db)).some((d) => d.id === draft.id));
    const results = await Promise.all([1, 2].map(() => fileDraftAsNote(a, draft.id, { notebookId: book, title: "Filed" }, db)));
    assert.equal(results[0]!.id, results[1]!.id);
    assert.equal(results[0]!.body, draft.body);
    assert.ok(!(await inboxDrafts(a, db)).some((d) => d.id === draft.id));
    await fileDraftAsTask(a, draft.id, db, { today: "2026-10-10" });
    assert.equal((await openTasks(a, db)).length, 0);
    await deleteNote(a, results[0]!.id, 1, db);
    await assert.rejects(fileDraftAsNote(a, draft.id, { notebookId: book, title: "Again" }, db));
  });
  test("Task/Note filing race creates exactly one destination", async () => {
    await captureDraft(a, "Race destination", db);
    const draft = (await inboxDrafts(a, db))[0]!;
    await Promise.allSettled([fileDraftAsTask(a, draft.id, db, { today: "2026-10-10" }), fileDraftAsNote(a, draft.id, { notebookId: book, title: "Race destination" }, db)]);
    const taskCount = (await openTasks(a, db)).filter((t) => t.name === "Race destination").length;
    const noteCount = (await listNotes(a, book, db)).filter((n) => n.title === "Race destination").length;
    assert.equal(taskCount + noteCount, 1);
  });
  test("blank and oversize bodies cannot be filed; empty titled notes are valid", async () => {
    for (const body of ["  ", "x".repeat(100_001)]) {
      await captureDraft(a, body, db);
      const draft = (await inboxDrafts(a, db))[0]!;
      await assert.rejects(fileDraftAsNote(a, draft.id, { notebookId: book, title: "Invalid" }, db));
      assert.equal((await db.select().from(drafts).where(eq(drafts.id, draft.id)))[0]?.workspace, "inbox");
    }
    assert.equal((await createNote(a, { ...input(), body: "" }, operation(), db)).body, "");
  });
});
