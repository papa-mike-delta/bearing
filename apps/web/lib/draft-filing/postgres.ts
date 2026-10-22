import { createHash, randomUUID } from "node:crypto";
import { journalEntries, journalOperations, notebooks, noteOperations, notes } from "@repo/db";
import { noteName, validNoteBody, validNoteOccasionDate } from "@repo/domain";
import { and, eq, sql } from "drizzle-orm";
import { isUuid, type Db } from "../db.ts";
import { isJournalDay } from "../journal-day.ts";

export class NoteError extends Error {}
export class JournalError extends Error {}
const unavailable = "That item is unavailable. Refresh and try again.";

export type NoteInput = { notebookId: string; title: string; body: string; occasionDate?: string | null; today?: string };
export type NoteSource = { source: "draft" | "coach"; sourceId: string };

export async function replayNote(userId: string, from: NoteSource, db: Db) {
  const [operation] = await db.select().from(noteOperations).where(and(
    eq(noteOperations.userId, userId), eq(noteOperations.source, from.source), eq(noteOperations.sourceId, from.sourceId),
  ));
  if (!operation) return null;
  const [note] = await db.select().from(notes).where(and(eq(notes.id, operation.noteId), eq(notes.userId, userId)));
  if (!note) throw new NoteError("The previously created Note is no longer available. It will not be recreated.");
  return note;
}

export function validateNoteCreation(input: NoteInput, from: NoteSource) {
  if (input.occasionDate != null && !validNoteOccasionDate(input.occasionDate, input.today)) throw new NoteError("Occasion date must be today or a past day. Supply the browser’s Today.");
  const title = noteName(input.title);
  if (!title || !validNoteBody(input.body)) throw new NoteError("Use a title of 1–200 characters and a body of at most 100,000 characters.");
  if (!from.sourceId || from.sourceId.length > 250 || !["draft", "coach"].includes(from.source)) throw new NoteError(unavailable);
  return title;
}

// The caller owns the transaction. Claims and destination rows commit together.
export async function createNoteInTransaction(userId: string, input: NoteInput, from: NoteSource, tx: Db) {
  const title = validateNoteCreation(input, from);
  const [book] = isUuid(input.notebookId)
    ? await tx.select().from(notebooks).where(and(eq(notebooks.id, input.notebookId), eq(notebooks.userId, userId))) : [];
  if (!book) throw new NoteError(unavailable);
  const id = randomUUID();
  const [claimed] = await tx.insert(noteOperations).values({ userId, ...from, noteId: id })
    .onConflictDoNothing().returning({ id: noteOperations.id });
  if (!claimed) {
    const existing = await replayNote(userId, from, tx);
    if (!existing) throw new NoteError(unavailable);
    return existing;
  }
  const [note] = await tx.insert(notes).values({ id, userId, notebookId: input.notebookId, title, body: input.body, occasionDate: input.occasionDate ?? null }).returning();
  return note!;
}

export type AppendInput = { day: string; today: string; text: string; source: "draft" | "coach"; operationId: string };

export function validateJournalAppend(input: AppendInput) {
  const { day, today, text, source, operationId } = input;
  if (!isJournalDay(day) || !isJournalDay(today)) throw new JournalError("Use a real YYYY-MM-DD calendar day and supply the browser's Today.");
  if (day > today) throw new JournalError("This day is not open yet.");
  if (!validNoteBody(text) || !text.trim()) throw new JournalError("Use nonempty text of at most 100,000 characters.");
  if (typeof operationId !== "string" || !operationId.trim() || operationId.length > 250 || !["draft", "coach"].includes(source)) throw new JournalError(unavailable);
  if (source === "draft" && !isUuid(operationId)) throw new JournalError(unavailable);
}

export async function appendJournalInTransaction(userId: string, input: AppendInput, tx: Db, draft?: { workspace: string; body: string }) {
  const { day, text, source, operationId } = input;
  const payloadHash = createHash("sha256").update(JSON.stringify([day, text])).digest("hex");
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
    return { receipt: { id: original.entryId, day: original.day }, appended: false };
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
  return { receipt: { id: entry.id, day: entry.day }, appended: true };
}
