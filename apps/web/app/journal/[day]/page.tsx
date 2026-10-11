import { notFound } from "next/navigation";
import { requireUser } from "../../../auth";
import { getJournalDay, getJournalTemplate } from "../../../lib/journal";
import { isJournalDay } from "../../../lib/journal-day";
import { Header } from "../../header";
import { JournalDay } from "../journal-day";
import { JournalTemplateSettings } from "../template-settings";

export default async function JournalDayPage({ params }: { params: Promise<{ day: string }> }) {
  const user = await requireUser();
  const { day } = await params;
  if (!isJournalDay(day)) notFound();
  const [entry, settings] = await Promise.all([getJournalDay(user.id, day), getJournalTemplate(user.id)]);
  return <><Header email={user.email} /><main className="font-sans">
    <h1>Journal · {day}</h1>
    <JournalTemplateSettings settings={settings} />
    <JournalDay key={day} day={day} entry={entry ? { body: entry.body, revision: entry.revision } : null} settings={settings} />
  </main></>;
}
