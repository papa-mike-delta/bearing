"use server";
import { db } from "@repo/db";
import type { PersonFields } from "@repo/domain";
import { revalidatePath } from "next/cache";
import { requireUser } from "../../auth";
import { peopleActions } from "../../lib/people-actions";
const actions = peopleActions({
  db,
  requireUser,
  invalidate: (path) => revalidatePath(path, "layout"),
});
export async function addPerson(input: { name: string; group: string }) {
  return actions.add(input);
}
export async function updatePerson(
  id: string,
  input: PersonFields,
  today: string,
) {
  return actions.save(id, input, today);
}
export async function removePerson(id: string) {
  return actions.remove(id);
}
export async function duePeople(today: string) {
  return actions.due(today);
}
