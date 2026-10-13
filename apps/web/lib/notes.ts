import { db as defaultDb, notebooks, notes } from "@repo/db";
import { noteHref, noteName, validNoteBody } from "@repo/domain";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { isUuid, type Db } from "./db.ts";
import { deleteEdgesForNotes } from "./links.ts";
import { createNoteInTransaction, NoteError, validateNoteCreation, type NoteInput, type NoteSource } from "./draft-filing/postgres.ts";

export { noteHref };

export { NoteError, type NoteInput, type NoteSource } from "./draft-filing/postgres.ts";
export { fileDraftAsNote } from "./draft-filing/index.ts";
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

export async function listLooseNotes(userId: string, db: Db = defaultDb) {
  return db.select({ id: notes.id, title: notes.title, pinned: notes.pinned, updatedAt: notes.updatedAt }).from(notes)
    .where(and(eq(notes.userId, userId), isNull(notes.notebookId)))
    .orderBy(desc(notes.pinned), desc(notes.updatedAt), asc(notes.id));
}

export async function countNotes(userId: string, notebookId: string, db: Db = defaultDb) {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(notes)
    .where(and(eq(notes.userId, userId), eq(notes.notebookId, notebookId)));
  return Number(row?.n ?? 0);
}

export async function getNote(userId: string, id: string, db: Db = defaultDb) {
  if (!isUuid(id)) return null;
  const [row] = await db.select().from(notes).where(and(eq(notes.id, id), eq(notes.userId, userId)));
  return row ?? null;
}

export async function createNote(userId: string, input: NoteInput, from: NoteSource, db: Db = defaultDb) {
  validateNoteCreation(input, from);
  return db.transaction((tx) => createNoteInTransaction(userId, input, from, tx));
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
  return db.transaction(async (tx) => {
    const [row] = await tx.select({ id: notes.id, revision: notes.revision, notebookId: notes.notebookId }).from(notes)
      .where(and(eq(notes.userId, userId), eq(notes.id, id))).for("update");
    if (!row || row.revision !== revision) throw new NoteError("The Note is unavailable or has changed. Reload before deleting.");
    await deleteEdgesForNotes(tx, userId, [id]);
    await tx.delete(notes).where(and(eq(notes.userId, userId), eq(notes.id, id), eq(notes.revision, revision)));
    return { notebookId: row.notebookId };
  });
}

export async function deleteNotebook(db: Db, userId: string, notebookId: string, mode: "delete-notes" | "move-notes") {
  if (!isUuid(notebookId)) return false;
  return db.transaction(async (tx) => {
    const [book] = await tx.select({ id: notebooks.id }).from(notebooks)
      .where(and(eq(notebooks.id, notebookId), eq(notebooks.userId, userId))).for("update");
    if (!book) return false;
    const owned = and(eq(notes.userId, userId), eq(notes.notebookId, notebookId));
    if (mode === "delete-notes") {
      const rows = await tx.select({ id: notes.id }).from(notes).where(owned).for("update");
      await deleteEdgesForNotes(tx, userId, rows.map((row) => row.id));
      await tx.delete(notes).where(owned);
    } else await tx.update(notes).set({ notebookId: null }).where(owned);
    await tx.delete(notebooks).where(and(eq(notebooks.id, notebookId), eq(notebooks.userId, userId)));
    return true;
  });
}
