import { db as defaultDb, tasks } from "@repo/db";
import {
  applyTaskUpdate,
  assignGoal,
  changeStatus,
  coachList,
  goalInArea,
  moveToColumn,
  moveToLater,
  moveToNow,
  newTask,
  newTaskFields,
  pickArea,
  scheduleTask,
  stepPriority,
  type KanbanColumn,
  type TaskPatch,
  type TaskRecord,
  type TaskStatus,
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
    coachList(loaded.areas, loaded.tasks, today, loaded.goals).map(
      (entry, index) => [entry.id, index],
    ),
  );
  return loaded.tasks
    .filter((task) => order.has(task.id))
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

export async function taskDetail(
  userId: string,
  taskId: string,
  db: Db = defaultDb,
) {
  if (!isUuid(taskId)) return null;
  const loaded = await loadAccount(userId, db);
  const task = loaded.tasks.find((item) => item.id === taskId);
  if (!task) return null;
  const area = loaded.areas.find((item) => item.id === task.areaId);
  if (!area) return null;
  return {
    task,
    area,
    goals: loaded.goals.filter((goal) => goal.areaId === area.id),
  };
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

async function lockedOpen(userId: string, taskId: string, db: Db) {
  if (!isUuid(taskId)) return null;
  const loaded = await loadAccount(userId, db);
  const areaIds = loaded.areas.map((area) => area.id);
  if (!areaIds.length) return null;
  const [row] = await db
    .select({
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
    const loaded = await loadAccount(userId, tx);
    const match = goalId
      ? (loaded.goals.find((item) => item.id === goalId) ?? null)
      : null;
    if (goalId && !match) return false;
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
    const loaded = await loadAccount(userId, tx);
    const patch: TaskPatch = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.note !== undefined) patch.note = input.note;
    if (input.priority !== undefined) patch.priority = input.priority;
    if (input.status !== undefined) patch.status = input.status;
    if (input.goal !== undefined) {
      if (input.goal === null || input.goal.trim() === "") {
        patch.goal = null;
      } else {
        const match = goalInArea(input.goal, loaded.goals, row.areaId);
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
