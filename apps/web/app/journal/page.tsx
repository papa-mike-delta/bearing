import { requireUser } from "../../auth";
import { getJournalTemplate } from "../../lib/journal";
import { Header } from "../header";
import { OpenToday } from "./open-today";
import { JournalTemplateSettings } from "./template-settings";

export default async function JournalPage({ searchParams }: { searchParams: Promise<{ template?: string }> }) {
  const user = await requireUser();
  const { template } = await searchParams;
  return <><Header email={user.email} /><main className="font-sans"><h1>Journal</h1>
    {template === "edit" ? <JournalTemplateSettings settings={await getJournalTemplate(user.id)} editing /> : <OpenToday />}
  </main></>;
}
