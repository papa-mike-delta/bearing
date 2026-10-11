import Link from "next/link";
import type { Metadata } from "next";
import { requireUser } from "../../auth";
import { listLooseNotes, listNotebooks, noteHref } from "../../lib/notes";
import { Header } from "../header";
import { NotebookForm } from "./notebook-form";

export const metadata: Metadata = { title: "Notes · Bearing", description: "Keep captured thoughts in your private notebooks." };

export default async function NotesPage() {
  const user = await requireUser();
  const [notebooks, loose] = await Promise.all([listNotebooks(user.id), listLooseNotes(user.id)]);
  return <><Header email={user.email} /><main className="font-sans">
    <h1>Notes</h1>
    <p>Give your captured thoughts a home. <Link href="/inbox">Capture in Inbox</Link>, then file into a notebook.</p>
    <NotebookForm />
    {notebooks.length ? <ul className="flex flex-col gap-3">
      {notebooks.map((book) => <li key={book.id}><Link href={`/notes/${book.id}`} className="panel block">{book.name}</Link></li>)}
    </ul> : <p className="empty-state">No notebooks yet. Create one to start filing your drafts.</p>}
    {loose.length > 0 && <>
      <h2 className="mt-8">No notebook</h2>
      <ul className="flex flex-col gap-3">
        {loose.map((note) => <li key={note.id}><Link className="panel flex items-center justify-between" href={noteHref(null, note.id)}>
          <span className="min-w-0 break-words">{note.title}</span>{note.pinned && <span className="text-muted-foreground">Pinned</span>}
        </Link></li>)}
      </ul>
    </>}
  </main></>;
}
