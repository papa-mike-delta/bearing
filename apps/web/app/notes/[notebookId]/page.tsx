import Link from "next/link";
import { notFound } from "next/navigation";
import { noteHref } from "@repo/domain";
import { requireUser } from "../../../auth";
import { getNotebook, listNotes } from "../../../lib/notes";
import { Header } from "../../header";

export default async function NotebookPage({ params }: { params: Promise<{ notebookId: string }> }) {
  const user = await requireUser();
  const { notebookId } = await params;
  const book = await getNotebook(user.id, notebookId);
  if (!book) notFound();
  const notes = await listNotes(user.id, notebookId);
  return <><Header email={user.email} /><main className="font-sans">
    <Link href="/notes">All notebooks</Link><h1>{book.name}</h1>
    <p><Link href="/inbox">Capture in Inbox</Link> to add a Note here.</p>
    {notes.length ? <ul className="flex flex-col gap-3">
      {notes.map((note) => <li key={note.id}><Link className="panel flex items-center justify-between" href={noteHref(book.id, note.id)}>
        <span className="min-w-0 break-words">{note.title}</span>{note.pinned && <span className="text-muted-foreground">Pinned</span>}
      </Link></li>)}
    </ul> : <p className="empty-state">This notebook is empty. File a draft from Inbox to keep it here.</p>}
  </main></>;
}
