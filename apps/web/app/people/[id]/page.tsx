import { LogPersonNote } from '../../../components/log-person-note';
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "../../../auth";
import { getPerson } from "../../../lib/people";
import { Related } from "../../../components/related";
import { related } from "../../../lib/links";
import { Header } from "../../header";
import { PersonEditor } from "../person-editor";
export default async function PersonPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const person = await getPerson(user.id, (await params).id);
  if (!person) notFound();
  const source = { kind: "person" as const, id: person.id };
  const links = await related(user.id, source);
  return (
    <>
      <Header email={user.email} />
      <main className="font-sans">
        <Link href="/people">People</Link>
        <h1>{person.name}</h1>
        <PersonEditor key={person.id} person={person} />
        <LogPersonNote personId={person.id} />
        <Related source={source} initial={links} />
      </main>
    </>
  );
}
