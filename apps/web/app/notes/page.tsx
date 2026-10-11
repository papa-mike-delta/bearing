import Link from "next/link";
import type { Metadata } from "next";
import { requireUser } from "../../auth";
import { listNotebooks } from "../../lib/notes";
import { Header } from "../header";
import { NotebookForm } from "./notebook-form";

export const metadata: Metadata = { title: "Notes · Bearing", description: "Keep captured thoughts in your private notebooks." };

export default async function NotesPage() {
  const user = await requireUser();
  const notebooks = await listNotebooks(user.id);
  return <><Header email={user.email} /><main className="font-sans">
    <h1>Notes</h1>
    <p>Give your captured thoughts a home. <Link href="/inbox">Capture in Inbox</Link>, then file into a notebook.</p>
    <NotebookForm />
    {notebooks.length ? <ul className="flex flex-col gap-3">
      {notebooks.map((book) => <li key={book.id}><Link href={`/notes/${book.id}`} className="panel block">{book.name}</Link></li>)}
    </ul> : <p className="empty-state">No notebooks yet. Create one to start filing your drafts.</p>}
  </main></>;
}
