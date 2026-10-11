import { createHash, randomUUID } from "node:crypto";
import { db as defaultDb, drafts, journalEntries, journalOperations } from "@repo/db";
import { validNoteBody } from "@repo/domain";
import { and, eq, sql } from "drizzle-orm";
import { isUuid, type Db } from "./db.ts";
import { isJournalDay } from "./journal-day.ts";

export class JournalError extends Error {}
const conflict = "Conflict: this Journal day changed in another tab. Your unsaved text is kept here. Copy it before reloading to compare with the latest version.";
const unavailable = "That item is unavailable. Refresh and try again.";

type AppendInput = { day: string; today: string; text: string; source: "draft" | "coach"; operationId: string };

// The shared append writer. Draft operations bind identity to the owned Draft
// and archive it in this same transaction; other sources use the same SQL append.
export async function appendJournal(userId: string, input: AppendInput, db: Db = defaultDb) {
  const { day, today, text, source, operationId } = input;
  if (!isJournalDay(day) || !isJournalDay(today)) throw new JournalError("Use a real YYYY-MM-DD calendar day and supply the browser's Today.");
  if (day > today) throw new JournalError("This day is not open yet.");
  if (!validNoteBody(text) || !text.trim()) throw new JournalError("Use nonempty text of at most 100,000 characters.");
  if (typeof operationId !== "string" || !operationId.trim() || operationId.length > 250 || !["draft", "coach"].includes(source)) throw new JournalError(unavailable);
  if (source === "draft" && !isUuid(operationId)) throw new JournalError(unavailable);
  const payloadHash = createHash("sha256").update(JSON.stringify([day, text])).digest("hex");
  return db.transaction(async (tx) => {
    let draft;
    if (source === "draft") {
      // Serializes against Task/Note filing as well as another Journal append.
      [draft] = await tx.select().from(drafts)
        .where(and(eq(drafts.userId, userId), eq(drafts.id, operationId))).for("update");
      if (!draft) throw new JournalError(unavailable);
    }
    const identity = and(eq(journalOperations.userId, userId), eq(journalOperations.source, source), eq(journalOperations.operationId, operationId));
    const entryId = randomUUID();
    // The unique claim waits for a concurrent identical operation to commit.
    // A failed append rolls back its claim, allowing a corrected retry.
    const [claimed] = await tx.insert(journalOperations).values({ userId, source, operationId, day, payloadHash, entryId })
      .onConflictDoNothing({ target: [journalOperations.userId, journalOperations.source, journalOperations.operationId] }).returning();
    if (!claimed) {
      const [original] = await tx.select().from(journalOperations).where(identity);
      if (!original) throw new JournalError(unavailable);
      if (original.day !== day || original.payloadHash !== payloadHash) throw new JournalError("Conflict: this append operation already used different text or a different day.");
      return { id: original.entryId, day: original.day };
    }
    if (draft && (draft.workspace !== "inbox" || draft.body !== text)) throw new JournalError(unavailable);
    const [entry] = await tx.insert(journalEntries).values({ id: entryId, userId, day, body: text })
      .onConflictDoUpdate({
        target: [journalEntries.userId, journalEntries.day],
        set: { body: sql`${journalEntries.body} || E'\\n\\n' || excluded.body`, revision: sql`${journalEntries.revision} + 1` },
      }).returning();
    // Check the complete result using the shared JS character bound (including
    // surrogate pairs). Throwing rolls back the append and the Draft archive.
    if (!entry || !validNoteBody(entry.body)) throw new JournalError("The resulting Journal body must be at most 100,000 characters.");
    await tx.update(journalOperations).set({ entryId: entry.id }).where(identity);
    if (source === "draft") await tx.update(drafts).set({ workspace: "archive" })
      .where(and(eq(drafts.userId, userId), eq(drafts.id, operationId), eq(drafts.workspace, "inbox")));
    return { id: entry.id, day: entry.day };
  });
}

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
