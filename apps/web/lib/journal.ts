import { db as defaultDb, journalEntries } from "@repo/db";
import { validNoteBody } from "@repo/domain";
import { and, eq, sql } from "drizzle-orm";
import type { Db } from "./db.ts";
import { isJournalDay } from "./journal-day.ts";

export class JournalError extends Error {}
const conflict = "Conflict: this Journal day changed in another tab. Your unsaved text is kept here. Copy it before reloading to compare with the latest version.";

export async function getJournalDay(userId: string, day: string, db: Db = defaultDb) {
  if (!isJournalDay(day)) return null;
  const [entry] = await db.select().from(journalEntries)
    .where(and(eq(journalEntries.userId, userId), eq(journalEntries.day, day)));
  return entry ?? null;
}

// Revision zero represents an unsaved, virtual day.
export async function saveJournalDay(userId: string, day: string, body: string, expectedRevision: number, today: string, db: Db = defaultDb) {
  if (!isJournalDay(day) || !isJournalDay(today)) throw new JournalError("Use a real YYYY-MM-DD calendar day and supply the browser's Today.");
  if (day > today) throw new JournalError("This day is not open yet.");
  if (!validNoteBody(body)) throw new JournalError("Use a body of at most 100,000 characters.");
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || expectedRevision >= 2_147_483_647) {
    throw new JournalError("Use a valid Journal revision. Refresh and try again.");
  }
  if (!body.trim()) return null;
  if (expectedRevision === 0) {
    const [entry] = await db.insert(journalEntries).values({ userId, day, body })
      .onConflictDoNothing({ target: [journalEntries.userId, journalEntries.day] }).returning();
    if (entry) return entry;
    throw new JournalError(conflict);
  }
  const [entry] = await db.update(journalEntries).set({ body, revision: sql`${journalEntries.revision} + 1` })
    .where(and(eq(journalEntries.userId, userId), eq(journalEntries.day, day), eq(journalEntries.revision, expectedRevision))).returning();
  if (entry) return entry;
  if (!(await getJournalDay(userId, day, db))) throw new JournalError("That item is unavailable. Refresh and try again.");
  throw new JournalError(conflict);
}
