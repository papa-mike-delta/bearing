"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "../../auth";
import { createNotebook, deleteNote, fileDraftAsNote, noteHref, NoteError, saveNote } from "../../lib/notes";

function failure(error: unknown) {
  return { error: error instanceof NoteError ? error.message : "Could not save. Your text is kept here; please try again." };
}

export async function addNotebook(name: string) {
  const user = await requireUser();
  try {
    const row = await createNotebook(user.id, name);
    revalidatePath("/notes", "layout");
    return { href: `/notes/${row.id}` };
  } catch (error) { return failure(error); }
}

export async function fileNote(draftId: string, notebookId: string, title: string) {
  const user = await requireUser();
  try {
    const note = await fileDraftAsNote(user.id, draftId, { notebookId, title });
    revalidatePath("/inbox");
    revalidatePath("/notes", "layout");
    return { href: noteHref(note.notebookId, note.id) };
  } catch (error) { return failure(error); }
}

export async function updateNote(id: string, input: { title: string; body: string; pinned: boolean; revision: number }) {
  const user = await requireUser();
  try {
    const note = await saveNote(user.id, id, input);
    revalidatePath("/notes", "layout");
    return { revision: note.revision, title: note.title };
  } catch (error) { return failure(error); }
}

export async function removeNote(id: string, revision: number) {
  const user = await requireUser();
  try {
    const row = await deleteNote(user.id, id, revision);
    revalidatePath("/notes", "layout");
    return { href: row.notebookId ? `/notes/${row.notebookId}` : "/notes" };
  } catch (error) { return failure(error); }
}
