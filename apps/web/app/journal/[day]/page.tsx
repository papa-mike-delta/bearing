import { notFound } from "next/navigation";
import { requireUser } from "../../../auth";
import { getJournalDay } from "../../../lib/journal";
import { isJournalDay } from "../../../lib/journal-day";
import { Header } from "../../header";
import { JournalDay } from "../journal-day";

export default async function JournalDayPage({ params }: { params: Promise<{ day: string }> }) {
  const user = await requireUser();
  const { day } = await params;
  if (!isJournalDay(day)) notFound();
  const entry = await getJournalDay(user.id, day);
  return <><Header email={user.email} /><main className="font-sans">
    <h1>Journal · {day}</h1>
    <JournalDay key={day} day={day} entry={entry ? { body: entry.body, revision: entry.revision } : null} />
  </main></>;
}
