import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { createDb, users } from "@repo/db";
import { eq } from "drizzle-orm";
import { createNote, createNotebook, getNote } from "./notes.ts";
import { noteActions } from "./note-actions.ts";

const url = process.env.TEST_POSTGRES_URL;
test("Note save action authenticates and refuses future dates without storing any fields", { skip: !url }, async () => {
  const db = createDb(url!);
  const id = randomUUID();
  try {
    await db.insert(users).values({ id, email: `${id}@test.invalid`, passwordHash: "-" });
    const book = await createNotebook(id, "Memories", db);
    const note = await createNote(id, { notebookId: book.id, title: "Original", body: "Kept" }, { source: "coach", sourceId: randomUUID() }, db);
    const paths: string[] = [];
    const actions = noteActions({ requireUser: async () => ({ id }), invalidate: p => { paths.push(p); }, db });
    const fields = { ...note, title: "Edited", body: "New", pinned: true, occasionDate: "2026-10-22", today: "2026-10-21" };
    assert.match((await actions.save(note.id, fields) as { error: string }).error, /today or a past day/);
    assert.deepEqual(await getNote(id, note.id, db), note);
    assert.equal(paths.length, 0);
    assert.ok("revision" in await actions.save(note.id, { ...fields, occasionDate: "2026-10-21" }));
    const saved = (await getNote(id, note.id, db))!;
    assert.equal(saved.occasionDate, "2026-10-21");
    assert.equal(saved.title, "Edited");
    assert.ok("revision" in await actions.save(note.id, { ...saved, occasionDate: null, today: fields.today }));
    assert.equal((await getNote(id, note.id, db))?.occasionDate, null);
    assert.ok(paths.includes("/notes"));
    const signedOut = noteActions({ requireUser: async () => { throw new Error("sign-in"); }, invalidate: () => {}, db });
    await assert.rejects(signedOut.save(note.id, fields), /sign-in/);
  } finally {
    await db.delete(users).where(eq(users.id, id));
    await db.$client.end();
  }
});
