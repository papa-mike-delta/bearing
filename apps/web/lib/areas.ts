import { areas, db as defaultDb, goals, tasks, users } from "@repo/db";
import {
  areaName,
  parseNextDateRule,
  areaNameTaken,
  areasInCreationOrder,
  defaultWipLimit,
  goalName,
  goalNameTaken,
  nextGoalOrder,
  offeredWorkflow,
  shiftGoal,
  taskStatuses,
  wipLimit,
  type AreaRecord,
  type GoalRecord,
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
  goals: GoalRecord[];
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
          rule: tasks.rule,
          goalId: tasks.goalId,
          createdAt: tasks.createdAt,
          completedAt: tasks.completedAt,
        })
        .from(tasks)
        .where(inArray(tasks.areaId, areaIds))
    : [];
  const goalRows = areaIds.length
    ? await db
        .select({
          id: goals.id,
          areaId: goals.areaId,
          name: goals.name,
          order: goals.position,
        })
        .from(goals)
        .where(inArray(goals.areaId, areaIds))
    : [];
  return {
    areas: areaRows.map((area) => ({
      ...area,
      workflow: asWorkflow(area.workflow),
      wipLimit: area.wipLimit,
    })),
    tasks: taskRows.map((task) => ({
      ...task,
      rule: parseNextDateRule(task.rule),
      status: asStatus(task.status),
      previousStatus: task.previousStatus
        ? asStatus(task.previousStatus)
        : null,
      age: asDay(task.age),
      date: task.date ? asDay(task.date) : null,
    })),
    goals: goalRows,
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

// Name, hide flag, workflow, and limit are all checked before any write,
// including a case-insensitive clash with this account's other Areas. Null
// refuses the name or the Area. False refuses the limit or the workflow.
// The Area row and the hidden list then update together, or not at all.
export async function saveArea(
  userId: string,
  areaId: string,
  input: { name: string; hidden: boolean; workflow: string; limit: number },
  db: Db = defaultDb,
) {
  if (!isUuid(areaId)) return null;
  const name = areaName(input.name);
  if (!name) return null;
  const workflow = offeredWorkflow(input.workflow);
  const limit = wipLimit(input.limit);
  const existing = await db
    .select({ id: areas.id, name: areas.name })
    .from(areas)
    .where(eq(areas.userId, userId));
  if (!existing.some((area) => area.id === areaId)) return null;
  if (areaNameTaken(name, existing, areaId)) return null;
  if (typeof input.hidden !== "boolean" || !workflow || limit === null) {
    return false;
  }
  try {
    return await db.transaction(async (tx) => {
      const [user] = await tx
        .select({ hiddenAreaIds: users.hiddenAreaIds })
        .from(users)
        .where(eq(users.id, userId))
        .for("update");
      if (!user) return null;
      const [row] = await tx
        .update(areas)
        .set({ name, workflow, wipLimit: limit })
        .where(and(eq(areas.id, areaId), eq(areas.userId, userId)))
        .returning({ id: areas.id });
      if (!row) return null;
      const ids = new Set(user.hiddenAreaIds);
      if (input.hidden) ids.add(areaId);
      else ids.delete(areaId);
      await tx
        .update(users)
        .set({ hiddenAreaIds: [...ids] })
        .where(eq(users.id, userId));
      return true;
    });
  } catch (error) {
    if (uniqueViolation(error)) return null;
    throw error;
  }
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

async function ownedArea(userId: string, areaId: string, db: Db) {
  if (!isUuid(areaId)) return null;
  const [area] = await db
    .select({ id: areas.id })
    .from(areas)
    .where(and(eq(areas.id, areaId), eq(areas.userId, userId)));
  return area ?? null;
}

export async function createGoal(
  userId: string,
  areaId: string,
  name: string,
  db: Db = defaultDb,
) {
  const trimmed = goalName(name);
  if (!trimmed || !(await ownedArea(userId, areaId, db))) return null;
  const existing = await db
    .select({ id: goals.id, areaId: goals.areaId, name: goals.name, order: goals.position })
    .from(goals)
    .where(eq(goals.areaId, areaId));
  if (goalNameTaken(trimmed, existing, areaId)) return null;
  try {
    const [row] = await db
      .insert(goals)
      .values({
        areaId,
        name: trimmed,
        position: nextGoalOrder(existing),
      })
      .returning({ id: goals.id, name: goals.name });
    return row ?? null;
  } catch (error) {
    if (uniqueViolation(error)) return null;
    throw error;
  }
}

export async function renameGoal(
  userId: string,
  goalId: string,
  name: string,
  db: Db = defaultDb,
) {
  if (!isUuid(goalId)) return null;
  const trimmed = goalName(name);
  if (!trimmed) return null;
  const [current] = await db
    .select({ id: goals.id, areaId: goals.areaId, name: goals.name })
    .from(goals)
    .innerJoin(areas, eq(goals.areaId, areas.id))
    .where(and(eq(goals.id, goalId), eq(areas.userId, userId)));
  if (!current) return null;
  const existing = await db
    .select({ id: goals.id, areaId: goals.areaId, name: goals.name })
    .from(goals)
    .where(eq(goals.areaId, current.areaId));
  if (goalNameTaken(trimmed, existing, current.areaId, goalId)) return null;
  try {
    const [row] = await db
      .update(goals)
      .set({ name: trimmed })
      .where(eq(goals.id, goalId))
      .returning({ id: goals.id, name: goals.name });
    return row ?? null;
  } catch (error) {
    if (uniqueViolation(error)) return null;
    throw error;
  }
}

export async function moveGoal(
  userId: string,
  goalId: string,
  direction: "up" | "down",
  db: Db = defaultDb,
) {
  if (!isUuid(goalId)) return false;
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({ id: goals.id, areaId: goals.areaId })
      .from(goals)
      .innerJoin(areas, eq(goals.areaId, areas.id))
      .where(and(eq(goals.id, goalId), eq(areas.userId, userId)))
      .for("update");
    if (!current) return false;
    const rows = await tx
      .select({
        id: goals.id,
        areaId: goals.areaId,
        name: goals.name,
        order: goals.position,
      })
      .from(goals)
      .where(eq(goals.areaId, current.areaId))
      .for("update");
    const next = shiftGoal(rows, goalId, direction);
    if (!next) return false;
    for (const goal of next) {
      await tx
        .update(goals)
        .set({ position: goal.order })
        .where(eq(goals.id, goal.id));
    }
    return true;
  });
}

// The Goal row goes. Tasks keep their rows; the foreign key clears the Goal.
export async function deleteGoal(
  userId: string,
  goalId: string,
  db: Db = defaultDb,
) {
  if (!isUuid(goalId)) return false;
  const [removed] = await db
    .delete(goals)
    .where(
      and(
        eq(goals.id, goalId),
        sql`exists (select 1 from ${areas} where ${areas.id} = ${goals.areaId} and ${areas.userId} = ${userId})`,
      ),
    )
    .returning({ id: goals.id });
  return Boolean(removed);
}
