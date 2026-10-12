import { notFound } from "next/navigation";
import { requireUser } from "../../../auth";
import { getJournalDay, getJournalTemplate } from "../../../lib/journal";
import { formatJournalDay, isJournalDay } from "../../../lib/journal-day";
import { related } from "../../../lib/links";
import { getMood } from "../../../lib/mood";
import { Header } from "../../header";
import { JournalDay } from "../journal-day";
import { JournalTemplateSettings } from "../template-settings";

export default async function JournalDayPage({ params }: { params: Promise<{ day: string }> }) {
  const user = await requireUser();
  const { day } = await params;
  if (!isJournalDay(day)) notFound();
  const [entry, settings, mood] = await Promise.all([getJournalDay(user.id, day), getJournalTemplate(user.id), getMood(user.id, day)]);
  const links = entry?.body.trim() ? await related(user.id, { kind: "journal", id: day }) : null;
  return <><Header email={user.email} /><main className="font-sans">
    <h1>Journal · {formatJournalDay(day)}</h1>
    <JournalDay key={day} day={day} entry={entry ? { body: entry.body, revision: entry.revision } : null} settings={settings} mood={mood} links={links} />
    <JournalTemplateSettings settings={settings} />
  </main></>;
}
