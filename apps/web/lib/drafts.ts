import { db as defaultDb, draftFilings, drafts } from "@repo/db";
import { fileDraft as filingTool, maxListedInboxDrafts, type FileDraftInput, type FiledDraft } from "@repo/coach";
import { draftNoteTitle, draftToTask } from "@repo/domain";
import { and, desc, eq, sql, TransactionRollbackError } from "drizzle-orm";
import { isUuid, type Db } from "./db.ts";
import { fileDraftAsNote, listNotebooks } from "./notes.ts";
import { addTask } from "./tasks.ts";
import { isJournalDay } from "./journal-day.ts";
import { appendJournal, JournalError } from "./journal.ts";

// Every query here takes the session user.

export async function captureDraft(
  userId: string,
  body: string,
  db: Db = defaultDb,
) {
  await db.insert(drafts).values({ userId, body });
}

export async function inboxDrafts(userId: string, db: Db = defaultDb) {
  return db
    .select({ id: drafts.id, body: drafts.body })
    .from(drafts)
    .where(and(eq(drafts.userId, userId), eq(drafts.workspace, "inbox")))
    .orderBy(desc(drafts.createdAt), desc(drafts.id));
}

// Bound the read in SQL as well as at the SDK-independent tool boundary.
export async function listInboxDrafts(userId: string, db: Db = defaultDb) {
  const rows = await db.select({ id: drafts.id, excerpt: sql<string>`left(${drafts.body}, 200)`, createdAt: drafts.createdAt }).from(drafts)
    .where(and(eq(drafts.userId, userId), eq(drafts.workspace, "inbox")))
    .orderBy(desc(drafts.createdAt), desc(drafts.id)).limit(maxListedInboxDrafts);
  return rows.map((row) => ({ ...row, excerpt: row.excerpt.slice(0, 200), createdAt: row.createdAt.toISOString() }));
}

export async function fileDraftAsJournal(userId: string, draftId: string, input: { day: string; today: string }, db: Db = defaultDb) {
  if (!isUuid(draftId)) throw new JournalError("That item is unavailable. Refresh and try again.");
  const [draft] = await db.select({ body: drafts.body }).from(drafts)
    .where(and(eq(drafts.id, draftId), eq(drafts.userId, userId)));
  if (!draft) throw new JournalError("That item is unavailable. Refresh and try again.");
  return appendJournal(userId, { ...input, text: draft.body, source: "draft", operationId: draftId }, db);
}

// Archives the Draft and creates its task, or neither. Returns false when the
// text can't become a task (the Draft stays in the Inbox). A foreign,
// already-filed, or malformed id is a silent no-op.
export async function fileDraftAsTask(
  userId: string,
  draftId: string,
  db: Db = defaultDb,
  input: { today: string; area?: string; name?: string } = { today: "" },
) {
  if (!isUuid(draftId)) return true;
  try {
    await db.transaction(async (tx) => {
      const [draft] = await tx
        .update(drafts)
        .set({ workspace: "archive" })
        .where(
          and(
            eq(drafts.id, draftId),
            eq(drafts.userId, userId),
            eq(drafts.workspace, "inbox"),
          ),
        )
        .returning({ body: drafts.body });
      if (!draft) return;
      const task = draftToTask(draft.body);
      if (!task) return tx.rollback();
      const result = await addTask(userId, { ...task, ...input, name: input.name ?? task.name }, tx);
      if (!result) return tx.rollback();
      await tx.insert(draftFilings).values({ userId, draftId, destinationKey: JSON.stringify(["task", input.name ?? null]), kind: "task", entityId: result.id, name: result.name });
    });
    return true;
  } catch (error) {
    if (error instanceof TransactionRollbackError) return false;
    throw error;
  }
}

export class DraftError extends Error {}

// One owned Draft lock serializes Coach and screen filings. The screen writer
// commits the archive and receipt together; the adapter never creates entities.
export async function fileDraft(userId: string, input: FileDraftInput & { today: string }, db: Db = defaultDb): Promise<FiledDraft> {
  const { today, ...filing } = input ?? {};
  const parsed = filingTool.inputSchema.safeParse(filing);
  if (!parsed.success) throw new DraftError("Choose exactly one draft and one destination.");
  const { draftId, destination } = parsed.data;

  return db.transaction(async (tx) => {
    const [draft] = await tx.select().from(drafts).where(and(eq(drafts.userId, userId), eq(drafts.id, draftId))).for("update");
    if (!draft) throw new DraftError("Draft not found.");
    if (destination.kind === "journal") {
      const [filed] = await tx.select().from(draftFilings).where(and(eq(draftFilings.userId, userId), eq(draftFilings.draftId, draftId)));
      if (filed) throw new DraftError("That draft was already filed to a different destination.");
      const day = !destination.day || destination.day === "today" ? today : destination.day;
      if (!isJournalDay(today) || !isJournalDay(day)) throw new DraftError("Supply the browser's Today as a real YYYY-MM-DD calendar day, then retry.");
      if (day > today) throw new DraftError("This day is not open yet.");
      const result = await fileDraftAsJournal(userId, draftId, { day, today: today }, tx);
      return { kind: "journal", ...result };
    }
    let notebookId: string | undefined;
    if (destination.kind === "note") {
      notebookId = destination.notebookId;
      if (!notebookId) {
        const matches = (await listNotebooks(userId, tx)).filter((book) => book.name.toLowerCase() === destination.notebook!.toLowerCase());
        if (matches.length !== 1) throw new DraftError("Choose one existing, unambiguous Notebook name or id.");
        notebookId = matches[0]!.id;
      }
    }
    const key = destination.kind === "task" ? JSON.stringify(["task", destination.name ?? null]) : JSON.stringify(["note", notebookId]);
    const identity = and(eq(draftFilings.userId, userId), eq(draftFilings.draftId, draftId));
    const [original] = await tx.select().from(draftFilings).where(identity);
    if (original) {
      if (original.destinationKey !== key) throw new DraftError("That draft was already filed to a different destination.");
      return original.kind === "note" && original.notebookId
        ? { kind: "note", id: original.entityId, name: original.name, notebookId: original.notebookId }
        : { kind: "task", id: original.entityId, name: original.name };
    }
    if (draft.workspace !== "inbox") throw new DraftError("That draft was already filed to a different destination.");
    if (destination.kind === "note") {
      const note = await fileDraftAsNote(userId, draftId, { notebookId: notebookId!, title: draftNoteTitle(draft.body) }, tx);
      return { kind: "note", id: note.id, name: note.title, notebookId: notebookId! };
    }
    if (!(await fileDraftAsTask(userId, draftId, tx, { today: today, name: destination.name }))) throw new DraftError("Couldn't file that draft as a Task. Choose a valid name and destination.");
    const [result] = await tx.select().from(draftFilings).where(identity);
    if (!result) throw new DraftError("Couldn't file that draft.");
    return { kind: "task", id: result.entityId, name: result.name };
  });
}
