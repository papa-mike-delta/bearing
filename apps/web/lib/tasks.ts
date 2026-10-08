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

type Db = Pick<typeof db, "insert">;

export async function createArea(userId: string, tx: Db = db) {
  const workflow: Workflow = "priority-list";
  await tx.insert(areas).values({ userId, name: "Tasks", workflow });
}

function userAreaIds(userId: string) {
  return db
    .select({ id: areas.id })
    .from(areas)
    .where(eq(areas.userId, userId));
}

export async function openTasks(userId: string) {
  const rows = await db
    .select({
      id: tasks.id,
      name: tasks.name,
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

export async function addTask(userId: string, name: string) {
  const [area] = await userAreaIds(userId).limit(1);
  if (!area) return;
  await db
    .insert(tasks)
    .values({ areaId: area.id, name, priority: normalPriority });
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
