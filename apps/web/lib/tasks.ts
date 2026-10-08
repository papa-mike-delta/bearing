import { areas, db, tasks } from "@repo/db";
import {
  normalPriority,
  priorityList,
  stepPriority,
  type Workflow,
} from "@repo/domain";
import { and, eq, inArray, isNull } from "drizzle-orm";

// Every query here takes the session user. Tasks are reached through the
// user's Area, so another account's rows never match.

type Db = Pick<typeof db, "select" | "insert">;

export async function createArea(userId: string, tx: Db = db) {
  const workflow: Workflow = "priority-list";
  await tx.insert(areas).values({ userId, name: "Tasks", workflow });
}

function userAreaIds(userId: string, tx: Db = db) {
  return tx
    .select({ id: areas.id })
    .from(areas)
    .where(eq(areas.userId, userId));
}

export async function openTasks(userId: string) {
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
        inArray(tasks.areaId, userAreaIds(userId)),
        isNull(tasks.completedAt),
      ),
    );
  return priorityList(rows);
}

// The one way a task is created, whether added on the list or filed from a Draft.
export async function addTask(
  userId: string,
  task: { name: string; note?: string },
  tx: Db = db,
) {
  const [area] = await userAreaIds(userId, tx).limit(1);
  if (!area) return;
  await tx
    .insert(tasks)
    .values({ ...task, areaId: area.id, priority: normalPriority });
}

export async function completeTask(userId: string, taskId: string) {
  await db
    .update(tasks)
    .set({ completedAt: new Date() })
    .where(
      and(
        eq(tasks.id, taskId),
        inArray(tasks.areaId, userAreaIds(userId)),
        isNull(tasks.completedAt),
      ),
    );
}

export async function changePriority(
  userId: string,
  taskId: string,
  step: 1 | -1,
) {
  const mine = and(
    eq(tasks.id, taskId),
    inArray(tasks.areaId, userAreaIds(userId)),
  );
  const [task] = await db
    .select({ priority: tasks.priority })
    .from(tasks)
    .where(mine);
  if (!task) return;
  await db
    .update(tasks)
    .set({ priority: stepPriority(task.priority, step) })
    .where(mine);
}
