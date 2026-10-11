"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Field, FieldGroup, FieldLabel } from "@repo/ui/components/field";
import { MarkdownEditor } from "../../components/markdown-editor";
import { useUnsavedChanges } from "../../components/use-unsaved-changes";
import { removeNote, updateNote } from "./actions";

type Note = { id: string; title: string; body: string; pinned: boolean; revision: number };

export function NoteEditor({ note }: { note: Note }) {
  const [saved, setSaved] = useState(note);
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const [pinned, setPinned] = useState(note.pinned);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const dirty = title !== saved.title || body !== saved.body || pinned !== saved.pinned;
  const guard = useUnsavedChanges(dirty);
  const router = useRouter();
  return <form data-note-editor onSubmit={(event) => {
    event.preventDefault();
    start(async () => {
      setError("");
      try {
        const result = await updateNote(note.id, { title, body, pinned, revision: saved.revision });
        if ("error" in result) setError(result.error);
        else { setTitle(result.title); setSaved({ ...saved, title: result.title, body, pinned, revision: result.revision }); }
      } catch { setError("Could not save. Your text is kept here; please retry."); }
    });
  }}>
    <FieldGroup><Field><FieldLabel htmlFor="note-title">Title</FieldLabel>
      <Input id="note-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} required disabled={pending} />
    </Field></FieldGroup>
    <MarkdownEditor value={body} onChange={setBody} disabled={pending} />
    <label className="flex items-center gap-2"><input type="checkbox" checked={pinned} onChange={(event) => setPinned(event.target.checked)} disabled={pending} />Pin this Note</label>
    {body.length > 100_000 && <p role="alert">Body exceeds 100,000 characters. Shorten it before saving; your text has not been truncated.</p>}
    {error && <p role="alert">{error}</p>}
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span role="status">{pending ? "Saving…" : dirty ? "Unsaved changes" : "Saved"}</span>
      <Button type="submit" disabled={pending || !dirty || body.length > 100_000}>Save Note</Button>
      <Button type="button" variant="destructive" disabled={pending} onClick={() => {
        if (!window.confirm("Delete this Note permanently? Any unsaved changes will also be lost.")) return;
        start(async () => {
          try {
            const result = await removeNote(note.id, saved.revision);
            if ("error" in result) setError(result.error);
            else { guard.current = false; router.push(result.href); }
          } catch { setError("Could not delete. Please try again."); }
        });
      }}>Delete Note</Button>
    </div>
  </form>;
}
