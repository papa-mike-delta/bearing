import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { createDb, users } from "@repo/db";
import { createNote, receipt } from "@repo/coach";
import { eq } from "drizzle-orm";
import { coachData } from "./coach-tools.ts";
import { createNotebook, getNote, listNotes } from "./notes.ts";
import { getJournalDay } from "./journal.ts";

const url = process.env.TEST_POSTGRES_URL;
test("Coach occasion day is stored and replayed once; future refusal creates nothing and no Journal day", { skip: !url }, async () => {
  const db = createDb(url!);
  const userId = randomUUID();
  try {
    await db.insert(users).values({ id: userId, email: `${userId}@test.invalid`, passwordHash: "-" });
    const book = await createNotebook(userId, "Memories", db);
    const context = { userId, messageId: randomUUID(), toolCallId: "one", today: "2026-10-21", data: coachData(db) };
    const input = { notebook: "Memories", title: "Quote", body: "Exact words", day: "2026-10-09" };
    const result = await createNote.run(input, context);
    assert.ok("id" in result);
    assert.equal(result.day, "2026-10-09");
    assert.equal((await getNote(userId, result.id, db))?.occasionDate, "2026-10-09");
    assert.equal(await getJournalDay(userId, input.day, db), null);
    assert.equal(receipt({ type: "tool-createNote", state: "output-available", output: result }, context.today), "Created Note 'Quote' for Fri, Oct 9");
    assert.deepEqual(await createNote.run({ ...input, body: "Changed retry", day: "2026-10-20" }, { ...context, toolCallId: "resend" }), result);
    const refused = await createNote.run({ ...input, title: "Future", day: "2026-10-22" }, context);
    assert.equal(refused.refused, true);
    assert.equal(receipt({ type: "tool-createNote", state: "output-available", output: refused }), "No change: asked about the day for Note 'Future'");
    assert.equal((await listNotes(userId, book.id, db)).length, 1);
  } finally {
    await db.delete(users).where(eq(users.id, userId));
    await db.$client.end();
  }
});
