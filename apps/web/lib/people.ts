import { db as defaultDb, people, habitOperations } from "@repo/db";
import {
  PersonError,
  personIdentity,
  validatePerson,
  type PersonFields,
} from "@repo/domain";
import { and, eq, sql } from "drizzle-orm";
import { isUuid, type Db } from "./db.ts";
export { PersonError };
const owned = (userId: string, id: string) =>
  and(eq(people.userId, userId), eq(people.id, id));
const unavailable = () =>
  new PersonError("That person is unavailable. Refresh and try again.");
export async function listPeople(userId: string, db: Db = defaultDb) {
  return db
    .select()
    .from(people)
    .where(eq(people.userId, userId))
    .orderBy(people.createdAt, people.id);
}
export async function getPerson(
  userId: string,
  id: string,
  db: Db = defaultDb,
) {
  if (!isUuid(id)) return null;
  return (await db.select().from(people).where(owned(userId, id)))[0] ?? null;
}
export async function createPerson(
  userId: string,
  input: { name: string; group: string },
  db: Db = defaultDb,
) {
  const fields = {
    ...personIdentity(input),
    rule: null,
    lastConnected: null,
    agreedDay: null,
  };
  return (
    await db
      .insert(people)
      .values({ userId, ...fields })
      .returning()
  )[0]!;
}
export async function savePerson(
  userId: string,
  id: string,
  input: PersonFields,
  today: string,
  db: Db = defaultDb,
) {
  const fields = validatePerson(input, today);
  if (!isUuid(id)) throw unavailable();
  const [row] = await db
    .update(people)
    .set(fields)
    .where(owned(userId, id))
    .returning();
  if (!row) throw unavailable();
  return row;
}
export async function deletePerson(
  userId: string,
  id: string,
  db: Db = defaultDb,
) {
  if (!isUuid(id)) throw unavailable();
  const [row] = await db
    .delete(people)
    .where(owned(userId, id))
    .returning({ id: people.id });
  if (!row) throw unavailable();
}
export type PersonDayInput = {
  personId: string;
  field: "lastConnected" | "agreedDay";
  day: string | null;
  today: string;
  operationId: string;
};
export type PersonDayResult = { id: string; name: string; day: string | null };
export async function setCoachPersonDay(
  userId: string,
  input: PersonDayInput,
  db: Db = defaultDb,
): Promise<PersonDayResult> {
  if (!isUuid(input.personId) || !input.operationId) throw unavailable();
  return db.transaction(async (tx) => {
    // Reuse the existing durable JSON operation ledger, whose historical SQL
    // name is habit_operations. Its entity id has no FK. A distinct source
    // keeps person receipts outside every Habit query and undo operation.
    const source = "coach-person";
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${source + userId}), hashtext(${input.operationId}))`,
    );
    const key = and(
      eq(habitOperations.userId, userId),
      eq(habitOperations.source, source),
      eq(habitOperations.operationId, input.operationId),
    );
    const [replay] = await tx.select().from(habitOperations).where(key);
    if (replay) return replay.result as PersonDayResult;
    const [person] = await tx
      .select()
      .from(people)
      .where(owned(userId, input.personId))
      .for("update");
    if (!person) throw unavailable();
    if (input.field === "lastConnected" && input.day === null)
      throw new PersonError("Choose a last connected day.");
    // A retained agreed day may now be past. Validate the field being changed
    // without invalidating that historical agreement on a last-connected edit.
    const candidate = { ...person, [input.field]: input.day };
    validatePerson(
      input.field === "lastConnected"
        ? { ...candidate, agreedDay: null }
        : candidate,
      input.today,
    );
    await tx
      .update(people)
      .set({ [input.field]: input.day })
      .where(owned(userId, input.personId));
    const result = { id: person.id, name: person.name, day: input.day };
    await tx
      .insert(habitOperations)
      .values({
        userId,
        source,
        operationId: input.operationId,
        habitId: person.id,
        result,
      });
    return result;
  });
}
