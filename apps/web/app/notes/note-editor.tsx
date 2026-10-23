"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Field, FieldGroup, FieldLabel } from "@repo/ui/components/field";
import { MarkdownEditor } from "../../components/markdown-editor";
import { useExplicitSave } from "../../lib/use-explicit-save";
import { useBrowserToday } from "../browser-today";
import { removeNote, updateNote } from "./actions";

type Note = { id: string; title: string; body: string; pinned: boolean; revision: number; occasionDate: string | null };

export function NoteEditor({ note }: { note: Note }) {
  const today = useBrowserToday();
  const session = useExplicitSave({
    initial: { saved: note, value: { title: note.title, body: note.body, pinned: note.pinned, occasionDate: note.occasionDate } },
    equal: (left, right) => left.title === right.title && left.body === right.body && left.pinned === right.pinned && left.occasionDate === right.occasionDate,
    failureMessage: "Could not save. Your text is kept here; please retry.",
    save: async ({ value, saved }) => {
      if (!today) return { error: "Wait for the browser’s Today before saving." };
      const result = await updateNote(note.id, { ...value, today, revision: saved.revision });
      if ("error" in result) return result;
      const accepted = { ...value, title: result.title };
      return { value: accepted, saved: { ...saved, ...accepted, revision: result.revision } };
    },
  });
  const { value, saved, error, dirty, setError } = session;
  const { title, body, pinned, occasionDate } = value;
  const setTitle = (title: string) => session.edit({ ...value, title });
  const setBody = (body: string) => session.edit({ ...value, body });
  const setPinned = (pinned: boolean) => session.edit({ ...value, pinned });
  const [deleting, start] = useTransition();
  const pending = session.pending || deleting;
  const router = useRouter();
  const futureDay = !!occasionDate && !!today && occasionDate > today;
  return <form data-note-editor onSubmit={(event) => {
    event.preventDefault();
    session.save();
  }}>
    <FieldGroup><Field><FieldLabel htmlFor="note-title">Title</FieldLabel>
      <Input id="note-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} required disabled={pending} />
    </Field></FieldGroup>
    <Field><FieldLabel htmlFor="note-occasion">Occasion date (optional)</FieldLabel>
      <div className="note-occasion-row">
        <Input id="note-occasion" type="date" className="min-h-10 text-base" value={occasionDate ?? ""} max={today ?? undefined}
          aria-invalid={futureDay || undefined} aria-describedby={futureDay ? "note-occasion-error" : undefined}
          onChange={(event) => session.edit({ ...value, occasionDate: event.target.value || null })} disabled={pending} />
        <Button type="button" variant="outline" aria-label="Clear occasion date" disabled={pending || !occasionDate}
          onClick={() => session.edit({ ...value, occasionDate: null })}>Clear</Button>
      </div>
      {futureDay && <p id="note-occasion-error" className="note-field-error">The occasion date must be today or a past day.</p>}
    </Field>
    <MarkdownEditor value={body} onChange={setBody} disabled={pending} />
    <label className="flex items-center gap-2"><input type="checkbox" checked={pinned} onChange={(event) => setPinned(event.target.checked)} disabled={pending} />Pin this Note</label>
    {body.length > 100_000 && <p role="alert">Body exceeds 100,000 characters. Shorten it before saving; your text has not been truncated.</p>}
    {error && <p role="alert">{error}</p>}
    <span role="status" className="block">{pending ? "Saving…" : dirty ? "Unsaved changes" : "Saved"}</span>
    <div className="note-actions">
      <Button type="submit" disabled={pending || !dirty || !today || body.length > 100_000}>Save Note</Button>
      <Button type="button" variant="destructive" className="ml-auto" disabled={pending} onClick={() => {
        if (!window.confirm("Delete this Note permanently? Any unsaved changes will also be lost.")) return;
        start(async () => {
          try {
            const result = await removeNote(note.id, saved.revision);
            if ("error" in result) setError(result.error);
            else { session.leaveWithoutPrompt(); router.push(result.href); }
          } catch { setError("Could not delete. Please try again."); }
        });
      }}>Delete Note</Button>
    </div>
  </form>;
}
