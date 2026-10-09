import { db as defaultDb, tasks } from "@repo/db";
import {
  changeStatus,
  coachList,
  moveToLater,
  moveToNow,
  newTask,
  newTaskFields,
  pickArea,
  scheduleTask,
  stepPriority,
  type TaskRecord,
} from "@repo/domain";
import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { loadAccount } from "./areas.ts";
import { isUuid, type Db } from "./db.ts";

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
    coachList(loaded.areas, loaded.tasks, today).map((entry, index) => [
      entry.id,
      index,
    ]),
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
  return coachList(loaded.areas, loaded.tasks, today);
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

async function lockedOpen(userId: string, taskId: string, db: Db) {
  if (!isUuid(taskId)) return null;
  const loaded = await loadAccount(userId, db);
  const areaIds = loaded.areas.map((area) => area.id);
  if (!areaIds.length) return null;
  const [row] = await db
    .select({
      id: tasks.id,
      name: tasks.name,
      status: tasks.status,
      previousStatus: tasks.previousStatus,
      age: tasks.age,
      date: tasks.scheduledOn,
      completedAt: tasks.completedAt,
      priority: tasks.priority,
    })
    .from(tasks)
    .where(
      and(
        eq(tasks.id, taskId),
        inArray(tasks.areaId, areaIds),
        isNull(tasks.completedAt),
        ne(tasks.status, "completed"),
      ),
    )
    .for("update");
  return row ?? null;
}

function toStatusTask(row: NonNullable<Awaited<ReturnType<typeof lockedOpen>>>) {
  return {
    status: row.status as TaskRecord["status"],
    previousStatus: row.previousStatus as TaskRecord["previousStatus"],
    completedAt: row.completedAt,
    age: row.age,
    date: row.date,
  };
}

export async function completeTask(
  userId: string,
  taskId: string,
  db: Db = defaultDb,
): Promise<TaskRef | null> {
  if (!isUuid(taskId)) return null;
  return db.transaction(async (tx) => {
    const row = await lockedOpen(userId, taskId, tx);
    if (!row) return null;
    const next = changeStatus(toStatusTask(row), "completed", new Date());
    if (!next) return null;
    const [done] = await tx
      .update(tasks)
      .set({
        status: next.status,
        previousStatus: next.previousStatus,
        completedAt: next.completedAt,
      })
      .where(eq(tasks.id, taskId))
      .returning({ id: tasks.id, name: tasks.name });
    return done ?? null;
  });
}

export async function changePriority(
  userId: string,
  taskId: string,
  step: 1 | -1,
  db: Db = defaultDb,
) {
  if (!isUuid(taskId)) return;
  await db.transaction(async (tx) => {
    const row = await lockedOpen(userId, taskId, tx);
    if (!row) return;
    await tx
      .update(tasks)
      .set({ priority: stepPriority(row.priority, step) })
      .where(eq(tasks.id, taskId));
  });
}

export async function moveTask(
  userId: string,
  taskId: string,
  to: "now" | "later",
  db: Db = defaultDb,
) {
  if (!isUuid(taskId)) return false;
  return db.transaction(async (tx) => {
    const row = await lockedOpen(userId, taskId, tx);
    if (!row) return false;
    const current = toStatusTask(row);
    const next = to === "now" ? moveToNow(current) : moveToLater(current);
    if (!next) return false;
    await tx
      .update(tasks)
      .set({
        status: next.status,
        previousStatus: next.previousStatus,
        completedAt: next.completedAt,
      })
      .where(eq(tasks.id, taskId));
    return true;
  });
}

export async function scheduleOn(
  userId: string,
  taskId: string,
  date: string,
  today: string,
  db: Db = defaultDb,
) {
  if (!isUuid(taskId)) return false;
  return db.transaction(async (tx) => {
    const row = await lockedOpen(userId, taskId, tx);
    if (!row) return false;
    const next = scheduleTask(toStatusTask(row), date, today);
    if (!next) return false;
    await tx
      .update(tasks)
      .set({
        status: next.status,
        previousStatus: next.previousStatus,
        completedAt: next.completedAt,
        age: next.age,
        scheduledOn: next.date,
      })
      .where(eq(tasks.id, taskId));
    return true;
  });
}
