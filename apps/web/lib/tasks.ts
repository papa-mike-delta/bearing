import { db as defaultDb, tasks } from "@repo/db";
import { coachList, newTask, newTaskFields, pickArea } from "@repo/domain";
import { and, eq } from "drizzle-orm";
import { loadAccount } from "./areas.ts";
import type { Db } from "./db.ts";

// Existing screen and Coach imports share the owned Task interface.
export {
  changePriority,
  completeTask,
  moveTask,
  scheduleOn,
  setTaskGoal,
  taskDetail,
  updateOpenTask,
  type OpenTaskPatch,
} from "./owned-task.ts";

// Every query here takes the session user. Tasks are reached through the
// user's Areas, so another account's rows never match.

// Open Tasks in the order the Coach reads them. `today` places dates; a
// Priority List ignores it.
export async function openTasks(
  userId: string,
  db: Db = defaultDb,
  today = "",
) {
  const loaded = await loadAccount(userId, db);
  const order = new Map(
    coachList(loaded.areas, loaded.tasks, today, loaded.goals).map(
      (entry, index) => [entry.id, index],
    ),
  );
  return loaded.tasks
    .filter((task) => order.has(task.id))
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

export async function listForCoach(
  userId: string,
  today: string,
  db: Db = defaultDb,
) {
  const loaded = await loadAccount(userId, db);
  return coachList(loaded.areas, loaded.tasks, today, loaded.goals);
}

export type Provenance = { source: "coach"; sourceId: string };

export const maxSourceIdLength = 200;

type TaskRef = { id: string; name: string };

// The one way a task is created. Null when the name, note, day, or Area is
// refused, or the source id is blank or too long. One Area is used without
// a name. Several require a name. None refuses. Provenance already used in
// that Area returns the existing Task.
export async function addTask(
  userId: string,
  input: {
    name: string;
    note?: string;
    from?: Provenance;
    area?: string;
    today: string;
  },
  db: Db = defaultDb,
): Promise<TaskRef | null> {
  const task = newTask(input);
  const fields = newTaskFields(input.today);
  const { from } = input;
  const badSourceId =
    from && (!from.sourceId.trim() || from.sourceId.length > maxSourceIdLength);
  if (!task || !fields || badSourceId) return null;
  const loaded = await loadAccount(userId, db);
  const area = pickArea(loaded.areas, input.area);
  if (!area) return null;
  const ref = { id: tasks.id, name: tasks.name };
  const [added] = await db
    .insert(tasks)
    .values({
      name: task.name,
      note: task.note,
      areaId: area.id,
      priority: fields.priority,
      status: fields.status,
      age: fields.age,
      source: from?.source,
      sourceId: from?.sourceId,
    })
    .onConflictDoNothing({
      target: [tasks.areaId, tasks.source, tasks.sourceId],
    })
    .returning(ref);
  if (added) return added;
  if (!from) throw new Error("Task insert returned no row");
  const [existing] = await db
    .select(ref)
    .from(tasks)
    .where(
      and(
        eq(tasks.areaId, area.id),
        eq(tasks.source, from.source),
        eq(tasks.sourceId, from.sourceId),
      ),
    );
  if (!existing) throw new Error("Task provenance conflict with no row");
  return existing;
}
