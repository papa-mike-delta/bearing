import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "../../../../auth";
import { getNote, getNotebook } from "../../../../lib/notes";
import { Header } from "../../../header";
import { NoteEditor } from "../../note-editor";

export default async function NotePage({ params }: { params: Promise<{ notebookId: string; noteId: string }> }) {
  const user = await requireUser();
  const { notebookId, noteId } = await params;
  if (notebookId === "_") {
    const note = await getNote(user.id, noteId);
    if (!note || note.notebookId !== null) notFound();
    return <><Header email={user.email} /><main className="font-sans">
      <Link href="/notes">No notebook</Link><h1>{note.title}</h1>
      <NoteEditor key={note.id} note={{ id: note.id, title: note.title, body: note.body, pinned: note.pinned, revision: note.revision }} />
    </main></>;
  }
  const [book, note] = await Promise.all([getNotebook(user.id, notebookId), getNote(user.id, noteId)]);
  if (!book || !note || note.notebookId !== book.id) notFound();
  return <><Header email={user.email} /><main className="font-sans">
    <Link href={`/notes/${book.id}`}>{book.name}</Link><h1>{note.title}</h1>
    <NoteEditor key={note.id} note={{ id: note.id, title: note.title, body: note.body, pinned: note.pinned, revision: note.revision }} />
  </main></>;
}
