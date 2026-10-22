import {
  isCalendarDay,
  PersonError,
  personIsDue,
  type PersonFields,
} from "@repo/domain";
import {
  createPerson,
  deletePerson,
  listPeople,
  savePerson,
} from "./people.ts";
import type { Db } from "./db.ts";
// Next's auth/cache boundary is injected so actions can be exercised against
// real Postgres without a running Next request.
export function peopleActions(ports: {
  requireUser: () => Promise<{ id: string }>;
  invalidate: (path: string) => void;
  db: Db;
}) {
  const failure = (error: unknown) => ({
    error:
      error instanceof PersonError
        ? error.message
        : "Could not save. Your changes are kept here; please try again.",
  });
  return {
    async add(input: { name: string; group: string }) {
      const user = await ports.requireUser();
      try {
        const p = await createPerson(user.id, input, ports.db);
        ports.invalidate("/people");
        return { href: `/people/${p.id}` };
      } catch (error) {
        return failure(error);
      }
    },
    async save(id: string, input: PersonFields, today: string) {
      const user = await ports.requireUser();
      try {
        const person = await savePerson(user.id, id, input, today, ports.db);
        ports.invalidate("/people");
        return { person };
      } catch (error) {
        return failure(error);
      }
    },
    async remove(id: string) {
      const user = await ports.requireUser();
      try {
        await deletePerson(user.id, id, ports.db);
        ports.invalidate("/people");
        return { href: "/people" };
      } catch (error) {
        return failure(error);
      }
    },
    async due(today: string) {
      const user = await ports.requireUser();
      if (!isCalendarDay(today)) return { error: "Use a real calendar day." };
      try {
        return {
          count: (await listPeople(user.id, ports.db)).filter((p) =>
            personIsDue(p, today),
          ).length,
        };
      } catch (error) {
        return failure(error);
      }
    },
  };
}
