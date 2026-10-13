import { db as defaultDb, draftFilings, drafts, notebooks } from "@repo/db";
import { draftNoteTitle, draftToTask } from "@repo/domain";
import { fileDraftInputSchema, type FileDraftInput, type FiledDraft } from "@repo/domain/draft-filing";
import { and, asc, eq, TransactionRollbackError } from "drizzle-orm";
import { isUuid, type Db } from "../db.ts";
import { isJournalDay } from "../journal-day.ts";
import { addTask } from "../tasks.ts";
import { appendJournalInTransaction, createNoteInTransaction, JournalError, NoteError, replayNote, validateJournalAppend, type AppendInput, type NoteInput } from "./postgres.ts";

export class DraftError extends Error {}
const unavailable = "That item is unavailable. Refresh and try again.";
const differentDestination = "That draft was already filed to a different destination.";
type Draft = typeof drafts.$inferSelect & { sourceId: string };
type TaskInput = { today: string; area?: string; name?: string };

// All filing paths cross this seam: one owned row lock, one transaction, and
// no destination writer opens another transaction or acquires the Draft lock.
async function withDraft<T>(userId: string, draftId: string, db: Db, run: (draft: Draft | undefined, tx: Db) => Promise<T>) {
  return db.transaction(async (tx) => {
    const [draft] = await tx.select().from(drafts)
      .where(and(eq(drafts.userId, userId), eq(drafts.id, draftId))).for("update");
    // Operation identities are text, so preserve the supplied UUID spelling.
    return run(draft ? { ...draft, sourceId: draftId } : undefined, tx);
  });
}

async function archive(userId: string, draftId: string, tx: Db) {
  await tx.update(drafts).set({ workspace: "archive" })
    .where(and(eq(drafts.userId, userId), eq(drafts.id, draftId), eq(drafts.workspace, "inbox")));
}

async function writeTask(userId: string, draft: Draft, input: TaskInput, tx: Db) {
  const task = draftToTask(draft.body);
  if (!task) return null;
  const result = await addTask(userId, { ...task, ...input, name: input.name ?? task.name }, tx);
  if (!result) return null;
  await tx.insert(draftFilings).values({ userId, draftId: draft.id, destinationKey: JSON.stringify(["task", input.name ?? null]), kind: "task", entityId: result.id, name: result.name });
  await archive(userId, draft.id, tx);
  return result;
}

async function writeNote(userId: string, draft: Draft, input: Omit<NoteInput, "body">, tx: Db) {
  const from = { source: "draft", sourceId: draft.sourceId } as const;
  // Screen retries return the live Note, including edits, and honor tombstones.
  const existing = await replayNote(userId, from, tx);
  if (existing) {
    if (existing.notebookId !== input.notebookId) throw new NoteError(differentDestination);
    return existing;
  }
  if (draft.workspace !== "inbox" || !draft.body.trim()) throw new NoteError(unavailable);
  const note = await createNoteInTransaction(userId, { ...input, body: draft.body }, from, tx);
  await tx.insert(draftFilings).values({ userId, draftId: draft.id, destinationKey: JSON.stringify(["note", input.notebookId]), kind: "note", entityId: note.id, name: note.title, notebookId: input.notebookId });
  await archive(userId, draft.id, tx);
  return note;
}

async function writeJournal(userId: string, draft: Draft, input: { day: string; today: string; text?: string }, tx: Db) {
  const append = { ...input, text: input.text ?? draft.body, source: "draft", operationId: draft.sourceId } as const;
  validateJournalAppend(append);
  const result = await appendJournalInTransaction(userId, append, tx, draft);
  if (result.appended) await archive(userId, draft.id, tx);
  return result.receipt;
}

// Durable receipts are the Coach result, independent of later destination edits
// or deletion. Screen entry points below retain their established return shapes.
export async function fileDraft(userId: string, input: FileDraftInput & { today: string }, db: Db = defaultDb): Promise<FiledDraft> {
  const { today, ...filing } = input ?? {};
  const parsed = fileDraftInputSchema.safeParse(filing);
  if (!parsed.success) throw new DraftError("Choose exactly one draft and one destination.");
  const { draftId, destination } = parsed.data;
  return withDraft(userId, draftId, db, async (draft, tx) => {
    if (!draft) throw new DraftError("Draft not found.");
    const identity = and(eq(draftFilings.userId, userId), eq(draftFilings.draftId, draftId));
    // Journal filings are recorded in journal_operations (by appendJournalInTransaction),
    // not draft_filings. This check only stops a Task/Note-filed draft being re-filed to a Journal.
    if (destination.kind === "journal") {
      const [filed] = await tx.select().from(draftFilings).where(identity);
      if (filed) throw new DraftError(differentDestination);
      const day = !destination.day || destination.day === "today" ? today : destination.day;
      if (!isJournalDay(today) || !isJournalDay(day)) throw new DraftError("Supply the browser's Today as a real YYYY-MM-DD calendar day, then retry.");
      if (day > today) throw new DraftError("This day is not open yet.");
      return { kind: "journal", ...await writeJournal(userId, draft, { day, today }, tx) };
    }
    let notebookId: string | undefined;
    if (destination.kind === "note") {
      notebookId = destination.notebookId;
      const books = await tx.select({ id: notebooks.id, name: notebooks.name }).from(notebooks)
        .where(eq(notebooks.userId, userId)).orderBy(asc(notebooks.name), asc(notebooks.id));
      if (destination.notebook) {
        const matches = books.filter((book) => book.name.toLowerCase() === destination.notebook!.toLowerCase());
        if (notebookId && !matches.some((book) => book.id === notebookId)) {
          throw new DraftError("That Notebook name and id don't match. Choose one existing Notebook.");
        }
        if (!notebookId) {
          if (matches.length !== 1) throw new DraftError("Choose one existing, unambiguous Notebook name or id.");
          notebookId = matches[0]!.id;
        }
      }
    }
    const key = destination.kind === "task" ? JSON.stringify(["task", destination.name ?? null]) : JSON.stringify(["note", notebookId]);
    const [original] = await tx.select().from(draftFilings).where(identity);
    if (original) {
      if (original.destinationKey !== key) throw new DraftError(differentDestination);
      return original.kind === "note" && original.notebookId
        ? { kind: "note", id: original.entityId, name: original.name, notebookId: original.notebookId }
        : { kind: "task", id: original.entityId, name: original.name };
    }
    if (draft.workspace !== "inbox") throw new DraftError(differentDestination);
    if (destination.kind === "note") {
      const note = await writeNote(userId, draft, { notebookId: notebookId!, title: draftNoteTitle(draft.body) }, tx);
      return { kind: "note", id: note.id, name: note.title, notebookId: notebookId! };
    }
    const result = await writeTask(userId, draft, { today, name: destination.name }, tx);
    if (!result) throw new DraftError("Couldn't file that draft as a Task. Choose a valid name and destination.");
    const [receipt] = await tx.select().from(draftFilings).where(identity);
    if (!receipt) throw new DraftError("Couldn't file that draft.");
    return { kind: "task", id: receipt.entityId, name: receipt.name };
  });
}

// A foreign, malformed, missing or already-filed screen Task is a silent no-op.
export async function fileDraftAsTask(userId: string, draftId: string, db: Db = defaultDb, input: TaskInput = { today: "" }) {
  if (!isUuid(draftId)) return true;
  try {
    await withDraft(userId, draftId, db, async (draft, tx) => {
      if (!draft || draft.workspace !== "inbox") return;
      if (!await writeTask(userId, draft, input, tx)) throw new TransactionRollbackError();
    });
    return true;
  } catch (error) {
    if (error instanceof TransactionRollbackError) return false;
    throw error;
  }
}

export async function fileDraftAsNote(userId: string, draftId: string, input: Omit<NoteInput, "body">, db: Db = defaultDb) {
  if (!isUuid(draftId)) throw new NoteError(unavailable);
  return withDraft(userId, draftId, db, async (draft, tx) => {
    if (!draft) throw new NoteError(unavailable);
    return writeNote(userId, draft, input, tx);
  });
}

export async function fileDraftAsJournal(userId: string, draftId: string, input: { day: string; today: string }, db: Db = defaultDb) {
  if (!isUuid(draftId)) throw new JournalError(unavailable);
  return withDraft(userId, draftId, db, async (draft, tx) => {
    if (!draft) throw new JournalError(unavailable);
    return writeJournal(userId, draft, { day: input.day, today: input.today }, tx);
  });
}

// Compatibility for direct Journal appends: a Draft source also crosses the
// filing seam, while ordinary Coach appends need only the destination mutation.
export async function appendJournal(userId: string, input: AppendInput, db: Db = defaultDb) {
  validateJournalAppend(input);
  if (input.source === "draft") {
    return withDraft(userId, input.operationId, db, async (draft, tx) => {
      if (!draft) throw new JournalError(unavailable);
      return writeJournal(userId, draft, input, tx);
    });
  }
  return db.transaction(async (tx) => (await appendJournalInTransaction(userId, input, tx)).receipt);
}
