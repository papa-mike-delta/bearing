"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { maxNoteBodyLength, type RelatedLists } from "@repo/domain";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { MarkdownEditor } from "../../components/markdown-editor";
import { Related } from "../../components/related";
import { useExplicitSave } from "../../lib/use-explicit-save";
import { isJournalDay, shiftJournalDay } from "../../lib/journal-day";
import { localToday } from "../../lib/today";
import type { Mood } from "../../lib/mood-values";
import { useBrowserToday } from "../browser-today";
import { updateJournalDay } from "./actions";
import { MoodControl } from "./mood-control";

type Entry = { body: string; revision: number };
type Settings = { template: string; alwaysLoad: boolean };

export function JournalDay({ day, entry, settings, mood, links }: { day: string; entry: Entry | null; settings: Settings; mood: Mood | null; links: RelatedLists | null }) {
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
      {entry && links ? <Related source={{ kind: "journal", id: day }} initial={links} /> : null}
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
    <Button type="submit" variant="outline" size="sm">Open</Button>
  </form>;
}

function JournalEditor({ day, entry, settings }: { day: string; entry: Entry | null; settings: Settings }) {
  // A prompt is an editor baseline, never a saved reflection. Initialize only
  // when opening the day; refreshed settings must not replace local work.
  const session = useExplicitSave({
    initial: {
      saved: entry ?? { body: "", revision: 0 },
      value: entry?.body || (settings.alwaysLoad ? settings.template : ""),
    },
    subject: "Journal",
    failureMessage: "Could not save. Your text is kept here; please retry.",
    save: async ({ value: body, saved, baseline }) => {
      const result = await updateJournalDay(day, body, saved.revision, localToday(), saved.revision === 0 ? baseline : undefined);
      if ("error" in result) return result;
      if ("empty" in result) return { error: "An empty reflection or untouched template is not saved. Your saved entry is kept." };
      return { value: body, saved: { body, revision: result.revision } };
    },
  });
  const { value: body, saved, error, pending, dirty, edit: setBody } = session;
  const untouchedTemplate = !saved.body && body === settings.template;
  const tooLong = body.length > maxNoteBodyLength;
  return <form data-journal-editor onSubmit={(event) => {
    event.preventDefault();
    session.save();
  }}>
    {!saved.body && <Button type="button" variant="outline" disabled={pending || !!body.trim()} onClick={() => {
      session.loadBaseline(settings.template);
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
