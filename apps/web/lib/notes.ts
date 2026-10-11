import { randomUUID } from "node:crypto";
import { db as defaultDb, drafts, notebooks, noteOperations, notes } from "@repo/db";
import { noteName, validNoteBody } from "@repo/domain";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { isUuid, type Db } from "./db.ts";

export class NoteError extends Error {}
const unavailable = "That item is unavailable. Refresh and try again.";

export async function listNotebooks(userId: string, db: Db = defaultDb) {
  return db.select({ id: notebooks.id, name: notebooks.name }).from(notebooks)
    .where(eq(notebooks.userId, userId)).orderBy(asc(notebooks.name), asc(notebooks.id));
}

export async function createNotebook(userId: string, input: string, db: Db = defaultDb) {
  const name = noteName(input);
  if (!name) throw new NoteError("Use a notebook name between 1 and 200 characters.");
  const [row] = await db.insert(notebooks).values({ userId, name }).returning({ id: notebooks.id });
  return row!;
}

export async function getNotebook(userId: string, id: string, db: Db = defaultDb) {
  if (!isUuid(id)) return null;
  const [row] = await db.select().from(notebooks).where(and(eq(notebooks.id, id), eq(notebooks.userId, userId)));
  return row ?? null;
}

export async function listNotes(userId: string, notebookId: string, db: Db = defaultDb) {
  if (!(await getNotebook(userId, notebookId, db))) return [];
  return db.select({ id: notes.id, title: notes.title, pinned: notes.pinned, updatedAt: notes.updatedAt }).from(notes)
    .where(and(eq(notes.userId, userId), eq(notes.notebookId, notebookId)))
    .orderBy(desc(notes.pinned), desc(notes.updatedAt), asc(notes.id));
}

export async function getNote(userId: string, id: string, db: Db = defaultDb) {
  if (!isUuid(id)) return null;
  const [row] = await db.select().from(notes).where(and(eq(notes.id, id), eq(notes.userId, userId)));
  return row ?? null;
}

export type NoteInput = { notebookId: string; title: string; body: string };
export type NoteSource = { source: "draft" | "coach"; sourceId: string };

async function replay(userId: string, from: NoteSource, db: Db) {
  const [operation] = await db.select().from(noteOperations).where(and(
    eq(noteOperations.userId, userId), eq(noteOperations.source, from.source), eq(noteOperations.sourceId, from.sourceId),
  ));
  if (!operation) return null;
  const note = await getNote(userId, operation.noteId, db);
  if (!note) throw new NoteError("The previously created Note is no longer available. It will not be recreated.");
  return note;
}

export async function createNote(userId: string, input: NoteInput, from: NoteSource, db: Db = defaultDb) {
  const title = noteName(input.title);
  if (!title || !validNoteBody(input.body)) throw new NoteError("Use a title of 1–200 characters and a body of at most 100,000 characters.");
  if (!from.sourceId || from.sourceId.length > 250 || !["draft", "coach"].includes(from.source)) throw new NoteError(unavailable);
  return db.transaction(async (tx) => {
    if (!(await getNotebook(userId, input.notebookId, tx))) throw new NoteError(unavailable);
    const id = randomUUID();
    const [claimed] = await tx.insert(noteOperations).values({ userId, ...from, noteId: id })
      .onConflictDoNothing().returning({ id: noteOperations.id });
    if (!claimed) {
      const existing = await replay(userId, from, tx);
      if (!existing) throw new NoteError(unavailable);
      return existing;
    }
    const [note] = await tx.insert(notes).values({ id, userId, notebookId: input.notebookId, title, body: input.body }).returning();
    return note!;
  });
}

export async function fileDraftAsNote(userId: string, draftId: string, input: Omit<NoteInput, "body">, db: Db = defaultDb) {
  if (!isUuid(draftId)) throw new NoteError(unavailable);
  return db.transaction(async (tx) => {
    // This row lock also serializes against fileDraftAsTask's guarded UPDATE.
    const [draft] = await tx.select().from(drafts).where(and(eq(drafts.id, draftId), eq(drafts.userId, userId))).for("update");
    if (!draft) throw new NoteError(unavailable);
    const from = { source: "draft", sourceId: draftId } as const;
    const existing = await replay(userId, from, tx);
    if (existing) return existing;
    if (draft.workspace !== "inbox" || !draft.body.trim()) throw new NoteError(unavailable);
    const note = await createNote(userId, { ...input, body: draft.body }, from, tx);
    await tx.update(drafts).set({ workspace: "archive" }).where(and(eq(drafts.id, draftId), eq(drafts.userId, userId)));
    return note;
  });
}

export async function saveNote(userId: string, id: string, input: { title: string; body: string; pinned: boolean; revision: number }, db: Db = defaultDb) {
  const title = noteName(input.title);
  if (!title || !validNoteBody(input.body) || typeof input.pinned !== "boolean" || !Number.isSafeInteger(input.revision) || input.revision < 1) {
    throw new NoteError("Use a title of 1–200 characters and a body of at most 100,000 characters.");
  }
  if (!isUuid(id)) throw new NoteError(unavailable);
  const [note] = await db.update(notes).set({ title, body: input.body, pinned: input.pinned, revision: sql`${notes.revision} + 1` })
    .where(and(eq(notes.id, id), eq(notes.userId, userId), eq(notes.revision, input.revision))).returning();
  if (note) return note;
  if (!(await getNote(userId, id, db))) throw new NoteError(unavailable);
  throw new NoteError("Conflict: this Note changed in another tab. Your unsaved text is kept here. Copy it before reloading to compare with the latest version.");
}

export async function deleteNote(userId: string, id: string, revision: number, db: Db = defaultDb) {
  if (!isUuid(id) || !Number.isSafeInteger(revision) || revision < 1) throw new NoteError(unavailable);
  const [deleted] = await db.delete(notes).where(and(eq(notes.userId, userId), eq(notes.id, id), eq(notes.revision, revision)))
    .returning({ notebookId: notes.notebookId });
  if (!deleted) throw new NoteError("The Note is unavailable or has changed. Reload before deleting.");
  return deleted;
}
