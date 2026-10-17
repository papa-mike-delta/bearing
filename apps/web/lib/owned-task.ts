import { areas, db as defaultDb, goals, tasks } from "@repo/db";
import {
  applyTaskUpdate,
  assignGoal,
  changeStatus,
  goalInArea,
  moveToColumn,
  moveToLater,
  moveToNow,
  offeredWorkflow,
  scheduleTask,
  stepPriority,
  type AreaRecord,
  type GoalRecord,
  type KanbanColumn,
  type TaskPatch,
  type TaskRecord,
  type TaskStatus,
} from "@repo/domain";
import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { isUuid, type Db } from "./db.ts";

type TaskRef = { id: string; name: string };

// Single-Task access includes hidden Areas. Only commands require an open Task.
// Ownership is checked in Postgres; no account collections cross this seam.
function ownedArea(userId: string, db: Db) {
  return db
    .select({ id: areas.id })
    .from(areas)
    .where(and(eq(areas.id, tasks.areaId), eq(areas.userId, userId)));
}

const taskFields = {
  id: tasks.id,
  areaId: tasks.areaId,
  name: tasks.name,
  note: tasks.note,
  status: tasks.status,
  previousStatus: tasks.previousStatus,
  age: tasks.age,
  date: tasks.scheduledOn,
  completedAt: tasks.completedAt,
  priority: tasks.priority,
  goalId: tasks.goalId,
};

// Detail and name-based edits need this Area's Goals, never other Areas' Goals.
// Keep name matching in goalInArea: SQL lower/trim has different Unicode rules.
function areaGoals(areaId: string, db: Db) {
  return db
    .select({
      id: goals.id,
      areaId: goals.areaId,
      name: goals.name,
      order: goals.position,
    })
    .from(goals)
    .where(eq(goals.areaId, areaId));
}

function asDay(value: string | Date): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}

export async function taskDetail(
  userId: string,
  taskId: string,
  db: Db = defaultDb,
): Promise<{ task: TaskRecord; area: AreaRecord; goals: GoalRecord[] } | null> {
  if (!isUuid(taskId)) return null;
  const [row] = await db
    .select({
      task: { ...taskFields, createdAt: tasks.createdAt },
      area: {
        id: areas.id,
        name: areas.name,
        workflow: areas.workflow,
        wipLimit: areas.wipLimit,
        createdAt: areas.createdAt,
      },
    })
    .from(tasks)
    .innerJoin(areas, eq(tasks.areaId, areas.id))
    .where(and(eq(tasks.id, taskId), eq(areas.userId, userId)));
  // The account projection's lookup compared the supplied spelling verbatim.
  if (!row || row.task.id !== taskId) return null;
  return {
    task: {
      ...row.task,
      status: asTaskStatus(row.task.status),
      previousStatus: row.task.previousStatus
        ? asTaskStatus(row.task.previousStatus)
        : null,
      age: asDay(row.task.age),
      date: row.task.date ? asDay(row.task.date) : null,
    },
    area: {
      ...row.area,
      workflow: offeredWorkflow(row.area.workflow) ?? "priority-list",
    },
    goals: await areaGoals(row.area.id, db),
  };
}

async function lockedOpen(userId: string, taskId: string, db: Db) {
  if (!isUuid(taskId)) return null;
  const [row] = await db
    .select(taskFields)
    .from(tasks)
    .where(
      and(
        eq(tasks.id, taskId),
        inArray(tasks.areaId, ownedArea(userId, db)),
        isNull(tasks.completedAt),
        ne(tasks.status, "completed"),
      ),
    )
    // The ownership subquery adds no Area or User row locks. Serialize on the
    // Task first, then read Goals, as all existing single-Task commands do.
    .for("update");
  return row ?? null;
}

function toStatusTask(
  row: NonNullable<Awaited<ReturnType<typeof lockedOpen>>>,
) {
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
  to: "now" | KanbanColumn,
  db: Db = defaultDb,
) {
  if (!isUuid(taskId)) return false;
  return db.transaction(async (tx) => {
    const row = await lockedOpen(userId, taskId, tx);
    if (!row) return false;
    const current = toStatusTask(row);
    const next =
      to === "now"
        ? moveToNow(current)
        : to === "later"
          ? moveToLater(current)
          : moveToColumn(current, to);
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
): Promise<TaskRef | null> {
  if (!isUuid(taskId)) return null;
  return db.transaction(async (tx) => {
    const row = await lockedOpen(userId, taskId, tx);
    if (!row) return null;
    const next = scheduleTask(toStatusTask(row), date, today);
    if (!next) return null;
    const [saved] = await tx
      .update(tasks)
      .set({
        status: next.status,
        previousStatus: next.previousStatus,
        completedAt: next.completedAt,
        age: next.age,
        scheduledOn: next.date,
      })
      .where(eq(tasks.id, taskId))
      .returning({ id: tasks.id, name: tasks.name });
    return saved ?? null;
  });
}

function asTaskStatus(value: string): TaskStatus {
  if (
    value === "later" ||
    value === "next" ||
    value === "started" ||
    value === "waiting" ||
    value === "completed"
  ) {
    return value;
  }
  return "later";
}

export async function setTaskGoal(
  userId: string,
  taskId: string,
  goalId: string | null,
  db: Db = defaultDb,
) {
  if (!isUuid(taskId)) return false;
  if (goalId !== null && !isUuid(goalId)) return false;
  return db.transaction(async (tx) => {
    const row = await lockedOpen(userId, taskId, tx);
    if (!row) return false;
    const [match] = goalId
      ? await tx
          .select({ id: goals.id, areaId: goals.areaId })
          .from(goals)
          .where(and(eq(goals.id, goalId), eq(goals.areaId, row.areaId)))
      : [];
    if (goalId && (!match || match.id !== goalId)) return false;
    const next = assignGoal(
      { areaId: row.areaId, goalId: row.goalId },
      match ? { id: match.id, areaId: match.areaId } : null,
    );
    if (!next) return false;
    await tx
      .update(tasks)
      .set({ goalId: next.goalId })
      .where(eq(tasks.id, taskId));
    return true;
  });
}

export type OpenTaskPatch = {
  name?: string;
  note?: string;
  priority?: number;
  status?: TaskStatus;
  goal?: string | null;
};

// The Coach's update. Area, workflow, and the date are not in the patch.
export async function updateOpenTask(
  userId: string,
  taskId: string,
  input: OpenTaskPatch,
  db: Db = defaultDb,
): Promise<TaskRef | null> {
  if (!isUuid(taskId)) return null;
  return db.transaction(async (tx) => {
    const row = await lockedOpen(userId, taskId, tx);
    if (!row) return null;
    const patch: TaskPatch = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.note !== undefined) patch.note = input.note;
    if (input.priority !== undefined) patch.priority = input.priority;
    if (input.status !== undefined) patch.status = input.status;
    if (input.goal !== undefined) {
      if (input.goal === null || input.goal.trim() === "") {
        patch.goal = null;
      } else {
        const match = goalInArea(
          input.goal,
          await areaGoals(row.areaId, tx),
          row.areaId,
        );
        if (!match) return null;
        patch.goal = { id: match.id, areaId: match.areaId };
      }
    }
    const next = applyTaskUpdate(
      {
        name: row.name,
        note: row.note,
        priority: row.priority,
        status: asTaskStatus(row.status),
        previousStatus: row.previousStatus
          ? asTaskStatus(row.previousStatus)
          : null,
        completedAt: row.completedAt,
        areaId: row.areaId,
        goalId: row.goalId,
      },
      patch,
      new Date(),
    );
    if (!next) return null;
    const [saved] = await tx
      .update(tasks)
      .set({
        name: next.name,
        note: next.note,
        priority: next.priority,
        status: next.status,
        previousStatus: next.previousStatus,
        completedAt: next.completedAt,
        goalId: next.goalId,
      })
      .where(eq(tasks.id, taskId))
      .returning({ id: tasks.id, name: tasks.name });
    return saved ?? null;
  });
}
