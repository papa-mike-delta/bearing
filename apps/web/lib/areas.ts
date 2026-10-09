import { areas, db as defaultDb, tasks, users } from "@repo/db";
import {
  areaName,
  areaNameTaken,
  areasInCreationOrder,
  defaultWipLimit,
  offeredWorkflow,
  taskStatuses,
  wipLimit,
  type AreaRecord,
  type TaskRecord,
  type TaskStatus,
  type Workflow,
} from "@repo/domain";
import { and, eq, inArray, sql } from "drizzle-orm";
import { isUuid, type Db } from "./db.ts";

// The account's Areas, Tasks, and hide-set. Another account's rows never match.

export type LoadedAccount = {
  areas: AreaRecord[];
  tasks: TaskRecord[];
  hiddenAreaIds: string[];
};

function asWorkflow(value: string): Workflow {
  return offeredWorkflow(value) ?? "priority-list";
}

function asStatus(value: string): TaskStatus {
  return taskStatuses.find((status) => status === value) ?? "later";
}

function asDay(value: string | Date): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value;
}

function uniqueViolation(error: unknown) {
  return (error as { cause?: { code?: string } }).cause?.code === "23505";
}

export async function loadAccount(
  userId: string,
  db: Db = defaultDb,
): Promise<LoadedAccount> {
  const areaRows = await db
    .select({
      id: areas.id,
      name: areas.name,
      workflow: areas.workflow,
      wipLimit: areas.wipLimit,
      createdAt: areas.createdAt,
    })
    .from(areas)
    .where(eq(areas.userId, userId));
  const [user] = await db
    .select({ hiddenAreaIds: users.hiddenAreaIds })
    .from(users)
    .where(eq(users.id, userId));
  const areaIds = areaRows.map((area) => area.id);
  const taskRows = areaIds.length
    ? await db
        .select({
          id: tasks.id,
          areaId: tasks.areaId,
          name: tasks.name,
          note: tasks.note,
          priority: tasks.priority,
          status: tasks.status,
          previousStatus: tasks.previousStatus,
          age: tasks.age,
          date: tasks.scheduledOn,
          createdAt: tasks.createdAt,
          completedAt: tasks.completedAt,
        })
        .from(tasks)
        .where(inArray(tasks.areaId, areaIds))
    : [];
  return {
    areas: areaRows.map((area) => ({
      ...area,
      workflow: asWorkflow(area.workflow),
      wipLimit: area.wipLimit,
    })),
    tasks: taskRows.map((task) => ({
      ...task,
      status: asStatus(task.status),
      previousStatus: task.previousStatus
        ? asStatus(task.previousStatus)
        : null,
      age: asDay(task.age),
      date: task.date ? asDay(task.date) : null,
    })),
    hiddenAreaIds: user?.hiddenAreaIds ?? [],
  };
}

export async function createArea(
  userId: string,
  name: string,
  db: Db = defaultDb,
) {
  const trimmed = areaName(name);
  if (!trimmed) return null;
  const existing = await db
    .select({ id: areas.id, name: areas.name })
    .from(areas)
    .where(eq(areas.userId, userId));
  if (areaNameTaken(trimmed, existing)) return null;
  try {
    const [row] = await db
      .insert(areas)
      .values({
        userId,
        name: trimmed,
        workflow: "priority-list",
        wipLimit: defaultWipLimit,
      })
      .returning({ id: areas.id, name: areas.name });
    return row ?? null;
  } catch (error) {
    if (uniqueViolation(error)) return null;
    throw error;
  }
}

export async function renameArea(
  userId: string,
  areaId: string,
  name: string,
  db: Db = defaultDb,
) {
  if (!isUuid(areaId)) return null;
  const trimmed = areaName(name);
  if (!trimmed) return null;
  const existing = await db
    .select({ id: areas.id, name: areas.name })
    .from(areas)
    .where(eq(areas.userId, userId));
  if (!existing.some((area) => area.id === areaId)) return null;
  if (areaNameTaken(trimmed, existing, areaId)) return null;
  try {
    const [row] = await db
      .update(areas)
      .set({ name: trimmed })
      .where(and(eq(areas.id, areaId), eq(areas.userId, userId)))
      .returning({ id: areas.id, name: areas.name });
    return row ?? null;
  } catch (error) {
    if (uniqueViolation(error)) return null;
    throw error;
  }
}

// Refuses while any Task, including a completed one, still belongs to the Area.
export async function deleteArea(
  userId: string,
  areaId: string,
  db: Db = defaultDb,
): Promise<"deleted" | "missing" | "has-tasks"> {
  if (!isUuid(areaId)) return "missing";
  return db.transaction(async (tx) => {
    const [owned] = await tx
      .select({ id: areas.id })
      .from(areas)
      .where(and(eq(areas.id, areaId), eq(areas.userId, userId)))
      .for("update");
    if (!owned) return "missing";
    const [task] = await tx
      .select({ id: tasks.id })
      .from(tasks)
      .where(eq(tasks.areaId, areaId))
      .limit(1);
    if (task) return "has-tasks";
    const [removed] = await tx
      .delete(areas)
      .where(
        and(
          eq(areas.id, areaId),
          eq(areas.userId, userId),
          sql`not exists (select 1 from ${tasks} where ${tasks.areaId} = ${areas.id})`,
        ),
      )
      .returning({ id: areas.id });
    if (!removed) return "has-tasks";
    const [user] = await tx
      .select({ hiddenAreaIds: users.hiddenAreaIds })
      .from(users)
      .where(eq(users.id, userId));
    if (user) {
      await tx
        .update(users)
        .set({
          hiddenAreaIds: user.hiddenAreaIds.filter((id) => id !== areaId),
        })
        .where(eq(users.id, userId));
    }
    return "deleted";
  });
}

export async function setAreaHidden(
  userId: string,
  areaId: string,
  hidden: boolean,
  db: Db = defaultDb,
) {
  if (!isUuid(areaId)) return false;
  return db.transaction(async (tx) => {
    const [owned] = await tx
      .select({ id: areas.id })
      .from(areas)
      .where(and(eq(areas.id, areaId), eq(areas.userId, userId)));
    if (!owned) return false;
    const [user] = await tx
      .select({ hiddenAreaIds: users.hiddenAreaIds })
      .from(users)
      .where(eq(users.id, userId))
      .for("update");
    if (!user) return false;
    const ids = new Set(user.hiddenAreaIds);
    if (hidden) ids.add(areaId);
    else ids.delete(areaId);
    await tx
      .update(users)
      .set({ hiddenAreaIds: [...ids] })
      .where(eq(users.id, userId));
    return true;
  });
}

export async function setAreaWorkflow(
  userId: string,
  areaId: string,
  workflow: string,
  db: Db = defaultDb,
) {
  if (!isUuid(areaId)) return false;
  const next = offeredWorkflow(workflow);
  if (!next) return false;
  const [row] = await db
    .update(areas)
    .set({ workflow: next })
    .where(and(eq(areas.id, areaId), eq(areas.userId, userId)))
    .returning({ id: areas.id });
  return Boolean(row);
}

export async function setAreaWip(
  userId: string,
  areaId: string,
  limit: number,
  db: Db = defaultDb,
) {
  if (!isUuid(areaId)) return false;
  const next = wipLimit(limit);
  if (next === null) return false;
  const [row] = await db
    .update(areas)
    .set({ wipLimit: next })
    .where(and(eq(areas.id, areaId), eq(areas.userId, userId)))
    .returning({ id: areas.id });
  return Boolean(row);
}

export function orderedAreas(loaded: LoadedAccount) {
  const counts = new Map<string, number>();
  for (const task of loaded.tasks) {
    counts.set(task.areaId, (counts.get(task.areaId) ?? 0) + 1);
  }
  const hidden = new Set(loaded.hiddenAreaIds);
  return areasInCreationOrder(loaded.areas).map((area) => ({
    ...area,
    hidden: hidden.has(area.id),
    taskCount: counts.get(area.id) ?? 0,
  }));
}
