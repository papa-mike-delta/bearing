import { areas, db as defaultDb, tasks } from "@repo/db";
import {
  newTask,
  normalPriority,
  priorityList,
  stepPriority,
  type Workflow,
} from "@repo/domain";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { isUuid, type Db } from "./db.ts";

// Every query here takes the session user. Tasks are reached through the
// user's Area, so another account's rows never match. The trailing `db` lets
// tests and transactions pass their own handle.

export async function createArea(userId: string, db: Db = defaultDb) {
  const workflow: Workflow = "priority-list";
  await db
    .insert(areas)
    .values({ userId, name: "Tasks", workflow })
    .onConflictDoNothing({ target: areas.userId });
}

function userAreaIds(userId: string, db: Db = defaultDb) {
  return db
    .select({ id: areas.id })
    .from(areas)
    .where(eq(areas.userId, userId));
}

function openTaskOf(userId: string, taskId: string, db: Db) {
  return and(
    eq(tasks.id, taskId),
    inArray(tasks.areaId, userAreaIds(userId, db)),
    isNull(tasks.completedAt),
  );
}

export async function openTasks(userId: string, db: Db = defaultDb) {
  const rows = await db
    .select({
      id: tasks.id,
      name: tasks.name,
      note: tasks.note,
      priority: tasks.priority,
      createdAt: tasks.createdAt,
      completedAt: tasks.completedAt,
    })
    .from(tasks)
    .where(
      and(
        inArray(tasks.areaId, userAreaIds(userId, db)),
        isNull(tasks.completedAt),
      ),
    );
  return priorityList(rows);
}

// Where a Task came from: the Coach and its tool-call id.
export type Provenance = { source: "coach"; sourceId: string };

// Keeps the provenance index row well under Postgres's btree size limit.
export const maxSourceIdLength = 200;

type TaskRef = { id: string; name: string };

// The one way a task is created, whether added on the list, filed from a
// Draft, or added with provenance. Returns the Task, or null when the domain
// rule refuses the name or note, or the source id is blank or too long. With
// provenance already used in the Area it adds nothing and returns that Task.
// Accounts made before Areas existed get theirs here.
export async function addTask(
  userId: string,
  input: { name: string; note?: string; from?: Provenance },
  db: Db = defaultDb,
): Promise<TaskRef | null> {
  const task = newTask(input);
  const { from } = input;
  const badSourceId =
    from && (!from.sourceId.trim() || from.sourceId.length > maxSourceIdLength);
  if (!task || badSourceId) return null;
  let [area] = await userAreaIds(userId, db);
  if (!area) {
    await createArea(userId, db);
    [area] = await userAreaIds(userId, db);
  }
  if (!area) throw new Error("Account has no Area");
  const ref = { id: tasks.id, name: tasks.name };
  const [added] = await db
    .insert(tasks)
    .values({
      name: task.name,
      note: task.note,
      areaId: area.id,
      priority: normalPriority,
      source: from?.source,
      sourceId: from?.sourceId,
    })
    .onConflictDoNothing({
      target: [tasks.areaId, tasks.source, tasks.sourceId],
    })
    .returning(ref);
  if (added) return added;
  // Only provenance can conflict. Return the Task that already has it.
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

// Returns the completed Task, or null when the id matched no open Task of
// this user.
export async function completeTask(
  userId: string,
  taskId: string,
  db: Db = defaultDb,
): Promise<TaskRef | null> {
  if (!isUuid(taskId)) return null;
  const [done] = await db
    .update(tasks)
    .set({ completedAt: new Date() })
    .where(openTaskOf(userId, taskId, db))
    .returning({ id: tasks.id, name: tasks.name });
  return done ?? null;
}

// Locks the row so concurrent steps can't overwrite each other, and keeps
// stepPriority as the only clamp.
export async function changePriority(
  userId: string,
  taskId: string,
  step: 1 | -1,
  db: Db = defaultDb,
) {
  if (!isUuid(taskId)) return;
  await db.transaction(async (tx) => {
    const [task] = await tx
      .select({ priority: tasks.priority })
      .from(tasks)
      .where(openTaskOf(userId, taskId, tx))
      .for("update");
    if (!task) return;
    await tx
      .update(tasks)
      .set({ priority: stepPriority(task.priority, step) })
      .where(eq(tasks.id, taskId));
  });
}
