"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { maxNoteBodyLength } from "@repo/domain";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { MarkdownEditor } from "../../components/markdown-editor";
import { useUnsavedChanges } from "../../components/use-unsaved-changes";
import { isJournalDay, shiftJournalDay } from "../../lib/journal-day";
import { localToday } from "../../lib/today";
import type { Mood } from "../../lib/mood-values";
import { useBrowserToday } from "../browser-today";
import { updateJournalDay } from "./actions";
import { MoodControl } from "./mood-control";

type Entry = { body: string; revision: number };
type Settings = { template: string; alwaysLoad: boolean };

export function JournalDay({ day, entry, settings, mood }: { day: string; entry: Entry | null; settings: Settings; mood: Mood | null }) {
  const today = useBrowserToday();
  const previous = shiftJournalDay(day, -1);
  const next = shiftJournalDay(day, 1);
  if (!today) return <p role="status">Checking the browser’s calendar day…</p>;
  return <>
    <nav aria-label="Journal days" className="mb-6 flex flex-wrap items-center gap-3">
      {previous ? <Button variant="outline" nativeButton={false} render={<Link href={`/journal/${previous}`} />}>Previous</Button> : <Button variant="outline" disabled>Previous</Button>}
      <DayField key={day} day={day} today={today} />
      {next && next <= today ? <Button variant="outline" nativeButton={false} render={<Link href={`/journal/${next}`} />}>Next</Button> : <Button variant="outline" disabled>Next</Button>}
      <Button variant="outline" nativeButton={false} render={<Link href="/journal" />}>Today</Button>
      {day <= today && <Button variant="outline" className="ml-auto" nativeButton={false} render={<Link href={`/coach?closeDay=${day}`} prefetch={false} />}>Daily close</Button>}
    </nav>
    {day > today ? <p>This day is not open yet.</p> : <>
      <MoodControl day={day} initialMood={mood} />
      <JournalEditor day={day} entry={entry} settings={settings} />
    </>}
  </>;
}

function DayField({ day, today }: { day: string; today: string }) {
  const router = useRouter();
  const open = (chosen: unknown) => {
    if (isJournalDay(chosen) && chosen !== day && chosen <= localToday()) router.push(`/journal/${chosen}`);
  };
  // Choosing a complete date opens it; Enter still submits the field.
  return <form className="flex flex-row items-center gap-2" onSubmit={(event) => {
    event.preventDefault();
    open(new FormData(event.currentTarget).get("day"));
  }}>
    <label className="sr-only" htmlFor="journal-day">Journal date</label>
    <Input className="w-auto" id="journal-day" name="day" type="date" min="0001-01-01" max={today} defaultValue={day} required onChange={(event) => open(event.target.value)} />
  </form>;
}

function JournalEditor({ day, entry, settings }: { day: string; entry: Entry | null; settings: Settings }) {
  const [saved, setSaved] = useState(entry ?? { body: "", revision: 0 });
  // A prompt is an editor baseline, never a saved reflection. Initialize only
  // when opening the day; refreshed settings must not replace local work.
  const [baseline, setBaseline] = useState(() => saved.body || (settings.alwaysLoad ? settings.template : ""));
  const [body, setBody] = useState(baseline);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const dirty = body !== baseline;
  const untouchedTemplate = !saved.body && body === settings.template;
  useUnsavedChanges(dirty, "Journal");
  const tooLong = body.length > maxNoteBodyLength;
  return <form data-journal-editor onSubmit={(event) => {
    event.preventDefault();
    start(async () => {
      setError("");
      try {
        const result = await updateJournalDay(day, body, saved.revision, localToday(), saved.revision === 0 ? baseline : undefined);
        if ("error" in result) setError(result.error);
        else if ("empty" in result) setError("An empty reflection or untouched template is not saved. Your saved entry is kept.");
        else { setSaved({ body, revision: result.revision }); setBaseline(body); }
      } catch { setError("Could not save. Your text is kept here; please retry."); }
    });
  }}>
    {!saved.body && <Button type="button" variant="outline" disabled={pending || !!body.trim()} onClick={() => {
      setBody(settings.template);
      setBaseline(settings.template);
      setError("");
    }}>Insert template</Button>}
    <MarkdownEditor value={body} onChange={setBody} disabled={pending} previewRefreshKey={saved.revision} />
    {tooLong && <p role="alert">Body exceeds 100,000 characters. Shorten it before saving; your text has not been truncated.</p>}
    {error && <p role="alert">{error}</p>}
    <div className="flex flex-wrap items-center gap-3">
      <span role="status">{pending ? "Saving…" : dirty ? "Unsaved changes" : saved.revision ? "Saved" : "No saved entry"}</span>
      <Button type="submit" disabled={pending || !dirty || untouchedTemplate || tooLong || !body.trim()}>Save</Button>
    </div>
    {dirty && !body.trim() && <p>An empty reflection writes nothing; the saved entry is kept.</p>}
  </form>;
}
