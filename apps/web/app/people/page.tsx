import { requireUser } from "../../auth";
import { Header } from "../header";
import { listPeople } from "../../lib/people";
import { PeopleBoard } from "./people-board";
export default async function PeoplePage() {
  const user = await requireUser();
  const people = await listPeople(user.id);
  return (
    <>
      <Header email={user.email} />
      <main className="font-sans">
        <h1>People</h1>
        <PeopleBoard people={people} />
      </main>
    </>
  );
}
