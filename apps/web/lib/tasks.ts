import { areas, db as defaultDb, tasks } from "@repo/db";
import {
  newTask,
  normalPriority,
  priorityList,
  stepPriority,
  type Workflow,
} from "@repo/domain";
import { and, eq, inArray, isNull } from "drizzle-orm";

// Every query here takes the session user. Tasks are reached through the
// user's Area, so another account's rows never match. The trailing `db` lets
// tests and transactions pass their own handle.

export type Db = Pick<
  typeof defaultDb,
  "select" | "insert" | "update" | "transaction"
>;

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Ids come from forms. Anything that isn't a uuid can't match a row.
export function isUuid(id: unknown): id is string {
  return typeof id === "string" && uuidPattern.test(id);
}

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

// The one way a task is created, whether added on the list or filed from a
// Draft. Returns false when the domain rule refuses the name or note.
// Accounts made before Areas existed get theirs here.
export async function addTask(
  userId: string,
  input: { name: string; note?: string },
  db: Db = defaultDb,
) {
  const task = newTask(input);
  if (!task) return false;
  let [area] = await userAreaIds(userId, db);
  if (!area) {
    await createArea(userId, db);
    [area] = await userAreaIds(userId, db);
  }
  if (!area) throw new Error("Account has no Area");
  await db.insert(tasks).values({
    name: task.name,
    note: task.note,
    areaId: area.id,
    priority: normalPriority,
  });
  return true;
}

export async function completeTask(
  userId: string,
  taskId: string,
  db: Db = defaultDb,
) {
  if (!isUuid(taskId)) return;
  await db
    .update(tasks)
    .set({ completedAt: new Date() })
    .where(openTaskOf(userId, taskId, db));
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
