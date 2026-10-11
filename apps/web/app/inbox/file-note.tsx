"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Field, FieldGroup, FieldLabel } from "@repo/ui/components/field";
import { draftNoteTitle } from "@repo/domain";
import { fileNote } from "../notes/actions";

export function FileNote({ draft, notebooks }: { draft: { id: string; body: string }; notebooks: { id: string; name: string }[] }) {
  const [title, setTitle] = useState(draftNoteTitle(draft.body));
  const [notebookId, setNotebookId] = useState(notebooks[0]?.id ?? "");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  if (!notebooks.length) return <details className="w-full"><summary>File as note</summary>
    <p className="hint"><Link href="/notes" className="text-primary underline">Create a notebook first</Link></p>
  </details>;
  return <details className="w-full"><summary>File as note</summary>
    <form className="note-filing" onSubmit={(event) => {
      event.preventDefault();
      start(async () => {
        try {
          const result = await fileNote(draft.id, notebookId, title);
          if ("error" in result) setError(result.error);
          else window.location.assign(result.href);
        } catch { setError("Could not file. Please retry; a committed filing will not create a duplicate."); }
      });
    }}>
      <FieldGroup><Field><FieldLabel htmlFor={`book-${draft.id}`}>Notebook</FieldLabel>
        <select id={`book-${draft.id}`} className="choice" value={notebookId} onChange={(event) => setNotebookId(event.target.value)} disabled={pending} required>
          {notebooks.map((book) => <option key={book.id} value={book.id}>{book.name}</option>)}
        </select>
      </Field><Field><FieldLabel htmlFor={`title-${draft.id}`}>Note title</FieldLabel>
        <Input id={`title-${draft.id}`} value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} required disabled={pending} />
      </Field></FieldGroup>
      <p className="hint">The full draft is preserved as the Note body.</p>
      {error && <p role="alert">{error}</p>}
      <Button type="submit" disabled={pending}>{pending ? "Filing…" : "File and open Note"}</Button>
    </form>
  </details>;
}
