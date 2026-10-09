// Areas, workflows, dates, and the task page. Pure: no React, no database.
// The page and the Coach call this. They do not grow a second copy of the sort.

import {
  maxPriority,
  minPriority,
  normalPriority,
  priorityList,
  type ListTask,
} from "./priority-list.ts";
import { maxTaskNameLength, newTask } from "./task.ts";
import type { Workflow } from "./index.ts";

export const taskStatuses = [
  "later",
  "next",
  "started",
  "waiting",
  "completed",
] as const;

export type TaskStatus = (typeof taskStatuses)[number];

// The workflows this phase offers. The others stay on the enum, unoffered.
export const offeredWorkflows = ["priority-list", "now-later", "kanban"] as const;

export type OfferedWorkflow = (typeof offeredWorkflows)[number];

export const maxAreaNameLength = maxTaskNameLength;
export const defaultWipLimit = 3;

const calendarDay = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isCalendarDay(value: string): boolean {
  const match = calendarDay.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = new Date(Date.UTC(year, month - 1, day));
  return (
    utc.getUTCFullYear() === year &&
    utc.getUTCMonth() === month - 1 &&
    utc.getUTCDate() === day
  );
}

// The UTC calendar day of an instant. Existing rows are backfilled with this.
export function utcDay(instant: Date): string {
  return instant.toISOString().slice(0, 10);
}

export function offeredWorkflow(value: string): OfferedWorkflow | null {
  return offeredWorkflows.find((workflow) => workflow === value) ?? null;
}

// Trimmed name, or null when it is empty or over the limit.
export function areaName(value: string): string | null {
  const name = value.trim();
  if (!name || name.length > maxAreaNameLength) return null;
  return name;
}

export function sameAreaName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

// True when another Area on the account already uses this name, ignoring case.
export function areaNameTaken(
  name: string,
  areas: readonly { id: string; name: string }[],
  exceptId?: string,
): boolean {
  return areas.some(
    (area) => area.id !== exceptId && sameAreaName(area.name, name),
  );
}

// The Area a new Task lands in. One Area is used as-is. Several require a
// name that matches exactly one, ignoring case. None refuses.
export function pickArea<T extends { id: string; name: string }>(
  areas: readonly T[],
  name?: string,
): T | null {
  if (areas.length === 0) return null;
  if (areas.length === 1) return areas[0] ?? null;
  if (!name || !areaName(name)) return null;
  const matches = areas.filter((area) => sameAreaName(area.name, name));
  return matches.length === 1 ? (matches[0] ?? null) : null;
}

// 1 through the Postgres integer max. Anything else is refused.
export function wipLimit(value: number): number | null {
  if (!Number.isSafeInteger(value) || value < 1 || value > 2_147_483_647) {
    return null;
  }
  return value;
}

export type StatusTask = {
  status: TaskStatus;
  previousStatus: TaskStatus | null;
  completedAt: Date | null;
};

// Previous status becomes the status being left. Leaving completed is refused.
// Setting the same status changes nothing.
export function changeStatus<T extends StatusTask>(
  task: T,
  status: TaskStatus,
  at?: Date,
): T | null {
  if (task.status === status) return task;
  if (task.status === "completed") return null;
  if (status === "completed") {
    if (!at) return null;
    return {
      ...task,
      previousStatus: task.status,
      status,
      completedAt: at,
    };
  }
  return { ...task, previousStatus: task.status, status, completedAt: null };
}

// Now sets next, unless the Task is already started or waiting.
export function moveToNow<T extends StatusTask>(task: T): T | null {
  if (task.status === "completed") return null;
  if (task.status === "started" || task.status === "waiting") return task;
  return changeStatus(task, "next");
}

export function moveToLater<T extends StatusTask>(task: T): T | null {
  if (task.status === "completed") return null;
  return changeStatus(task, "later");
}

export type ScheduleTask = StatusTask & { age: string; date: string | null };

// A day strictly after today. Forces later, and age becomes that day.
// A new date replaces the old one. Completed Tasks are refused.
export function scheduleTask<T extends ScheduleTask>(
  task: T,
  date: string,
  today: string,
): T | null {
  if (task.status === "completed") return null;
  if (!isCalendarDay(today) || !isCalendarDay(date) || date <= today) {
    return null;
  }
  const later = task.status === "later" ? task : changeStatus(task, "later");
  if (!later) return null;
  return { ...later, date, age: date };
}

export const kanbanColumns = ["started", "next", "waiting", "later"] as const;

export type KanbanColumn = (typeof kanbanColumns)[number];

// Dropping a Task on a column sets that status. Completed Tasks are refused.
export function moveToColumn<T extends StatusTask>(
  task: T,
  column: KanbanColumn,
): T | null {
  if (task.status === "completed") return null;
  return changeStatus(task, column);
}

export type GoalRecord = {
  id: string;
  areaId: string;
  name: string;
  order: number;
};

export function goalName(value: string): string | null {
  return areaName(value);
}

export function goalNameTaken(
  name: string,
  goals: readonly { id: string; areaId: string; name: string }[],
  areaId: string,
  exceptId?: string,
): boolean {
  return goals.some(
    (goal) =>
      goal.areaId === areaId &&
      goal.id !== exceptId &&
      sameAreaName(goal.name, name),
  );
}

// The next order is one past the highest, so a new Goal lands at the end.
export function nextGoalOrder(goals: readonly { order: number }[]): number {
  return goals.reduce((max, goal) => Math.max(max, goal.order), -1) + 1;
}

const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function goalsInOrder<T extends { id: string; order: number }>(
  goals: readonly T[],
): T[] {
  return [...goals].sort((a, b) => a.order - b.order || byId(a.id, b.id));
}

// Swaps a Goal with its neighbour. Null at the ends, or when it isn't there.
export function shiftGoal<T extends { id: string; order: number }>(
  goals: readonly T[],
  goalId: string,
  direction: "up" | "down",
): T[] | null {
  const ordered = goalsInOrder(goals);
  const index = ordered.findIndex((goal) => goal.id === goalId);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= ordered.length) return null;
  const next = [...ordered];
  const [moved] = next.splice(index, 1);
  next.splice(target, 0, moved!);
  return next.map((goal, order) => ({ ...goal, order }));
}

// Null clears the Goal. A Goal from another Area is refused.
export function assignGoal<T extends { areaId: string; goalId: string | null }>(
  task: T,
  goal: { id: string; areaId: string } | null,
): T | null {
  if (goal === null) return { ...task, goalId: null };
  if (goal.areaId !== task.areaId) return null;
  return { ...task, goalId: goal.id };
}

// One Goal in this Area, matched ignoring case. None, or more than one, refuses.
export function goalInArea(
  name: string,
  goals: readonly GoalRecord[],
  areaId: string,
): GoalRecord | null {
  const trimmed = goalName(name);
  if (!trimmed) return null;
  const matches = goals.filter(
    (goal) => goal.areaId === areaId && sameAreaName(goal.name, trimmed),
  );
  return matches.length === 1 ? (matches[0] ?? null) : null;
}

// Deleting a Goal drops it and clears it on the Tasks. The Tasks stay.
export function withoutGoal<
  TGoal extends { id: string },
  TTask extends { goalId: string | null },
>(
  goals: readonly TGoal[],
  tasks: readonly TTask[],
  goalId: string,
): { goals: TGoal[]; tasks: TTask[] } | null {
  if (!goals.some((goal) => goal.id === goalId)) return null;
  return {
    goals: goals.filter((goal) => goal.id !== goalId),
    tasks: tasks.map((task) =>
      task.goalId === goalId ? { ...task, goalId: null } : task,
    ),
  };
}

export type TaskPatch = {
  name?: string;
  note?: string;
  priority?: number;
  status?: TaskStatus;
  goal?: { id: string; areaId: string } | null;
};

// Name, note, priority, status, and Goal. Omitted fields stay. A status that
// leaves completed is refused. Setting completed completes the Task.
export function applyTaskUpdate<
  T extends StatusTask & {
    name: string;
    note: string;
    priority: number;
    areaId: string;
    goalId: string | null;
  },
>(task: T, update: TaskPatch, at: Date): T | null {
  let next = task;
  if (update.name !== undefined || update.note !== undefined) {
    const named = newTask({
      name: update.name ?? task.name,
      note: update.note ?? task.note,
    });
    if (!named) return null;
    next = { ...next, name: named.name, note: named.note };
  }
  if (update.priority !== undefined) {
    if (
      !Number.isInteger(update.priority) ||
      update.priority < minPriority ||
      update.priority > maxPriority
    ) {
      return null;
    }
    next = { ...next, priority: update.priority };
  }
  if (update.status !== undefined) {
    const changed = changeStatus(next, update.status, at);
    if (!changed) return null;
    next = changed;
  }
  if (update.goal !== undefined) {
    const assigned = assignGoal(next, update.goal);
    if (!assigned) return null;
    next = assigned;
  }
  return next;
}

export function canDeleteArea(
  areaId: string,
  tasks: readonly { areaId: string }[],
): boolean {
  return tasks.every((task) => task.areaId !== areaId);
}

export type AreaRecord = {
  id: string;
  name: string;
  workflow: Workflow;
  wipLimit: number;
  createdAt: Date;
};

export type TaskRecord = ListTask & {
  areaId: string;
  name: string;
  note: string;
  status: TaskStatus;
  previousStatus: TaskStatus | null;
  age: string;
  date: string | null;
  goalId: string | null;
};

export type TaskGroup = {
  goalId: string | null;
  name: string | null;
  tasks: TaskRecord[];
};

export type TaskSection = {
  id: "now" | "later" | KanbanColumn;
  label: string;
  tasks: TaskRecord[];
  groups: TaskGroup[];
};

export type AreaGoal = { id: string; name: string; order: number };

export type AreaView = {
  id: string;
  name: string;
  workflow: Workflow;
  wipLimit: number;
  nextId: string | null;
  warning: boolean;
  strip: TaskRecord[];
  tasks: TaskRecord[];
  groups: TaskGroup[];
  sections: TaskSection[];
  goals: AreaGoal[];
};

export type CoachEntry = {
  id: string;
  name: string;
  priority: number;
  area: string;
  isNext: boolean;
};

function byAge<T extends { age: string; priority: number; id: string }>(
  a: T,
  b: T,
) {
  return (
    (a.age < b.age ? -1 : a.age > b.age ? 1 : 0) ||
    b.priority - a.priority ||
    byId(a.id, b.id)
  );
}

function byDate<T extends { date: string; priority: number; id: string }>(
  a: T,
  b: T,
) {
  return (
    (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) ||
    b.priority - a.priority ||
    byId(a.id, b.id)
  );
}

export function areasInCreationOrder<T extends { id: string; createdAt: Date }>(
  areas: readonly T[],
): T[] {
  return [...areas].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || byId(a.id, b.id),
  );
}

function isOpen(task: TaskRecord): boolean {
  return task.status !== "completed" && task.completedAt === null;
}

// A stored date participates in the strip and the bottom of Later only when
// today is a real calendar day. A bad today leaves the date out of both.
function dated(task: TaskRecord, today: string): "future" | "due" | null {
  if (!task.date || !isCalendarDay(today) || !isCalendarDay(task.date)) {
    return null;
  }
  return task.date > today ? "future" : "due";
}

function laterPool(tasks: readonly TaskRecord[], today: string) {
  const later = tasks.filter((task) => task.status === "later");
  const due = later.filter((task) => dated(task, today) === "due");
  const rest = later.filter((task) => dated(task, today) !== "due");
  return { strip: [...due].sort(byAge), later: rest };
}

// Undated Tasks stay in the age sort. Future dates are a second band at the
// bottom of Later, grouped the same way, and left out of the age sort.
function groupLater(
  tasks: readonly TaskRecord[],
  goals: readonly GoalRecord[],
  areaId: string,
  today: string,
) {
  const future = tasks.filter((task) => dated(task, today) === "future");
  const rest = tasks.filter((task) => dated(task, today) !== "future");
  const datedBand = groupByGoal(rest, goals, areaId, (items) =>
    [...items].sort(byAge),
  );
  const futureBand = groupByGoal(future, goals, areaId, (items) =>
    [...items].sort((a, b) =>
      byDate(
        { date: a.date ?? "", priority: a.priority, id: a.id },
        { date: b.date ?? "", priority: b.priority, id: b.id },
      ),
    ),
  );
  return {
    groups: [...datedBand.groups, ...futureBand.groups],
    tasks: [...datedBand.tasks, ...futureBand.tasks],
  };
}

// Tasks with no Goal first, then each Goal that has a Task here, in Goal
// order. A Goal with nothing in this list adds no group. A dangling Goal id
// is treated as no Goal so the Task is not dropped.
function groupByGoal(
  tasks: readonly TaskRecord[],
  goals: readonly GoalRecord[],
  areaId: string,
  sortGroup: (tasks: TaskRecord[]) => TaskRecord[],
): { tasks: TaskRecord[]; groups: TaskGroup[] } {
  const ordered = goalsInOrder(goals.filter((goal) => goal.areaId === areaId));
  const known = new Set(ordered.map((goal) => goal.id));
  const groups: TaskGroup[] = [];
  const ungrouped = sortGroup(
    tasks.filter((task) => !task.goalId || !known.has(task.goalId)),
  );
  if (ungrouped.length > 0) {
    groups.push({ goalId: null, name: null, tasks: ungrouped });
  }
  for (const goal of ordered) {
    const mine = sortGroup(tasks.filter((task) => task.goalId === goal.id));
    if (mine.length > 0) {
      groups.push({ goalId: goal.id, name: goal.name, tasks: mine });
    }
  }
  return { groups, tasks: groups.flatMap((group) => group.tasks) };
}

function areaGoals(areaId: string, goals: readonly GoalRecord[]): AreaGoal[] {
  return goalsInOrder(goals.filter((goal) => goal.areaId === areaId)).map(
    (goal) => ({ id: goal.id, name: goal.name, order: goal.order }),
  );
}

function section(
  id: TaskSection["id"],
  label: string,
  grouped: { tasks: TaskRecord[]; groups: TaskGroup[] },
): TaskSection {
  return { id, label, tasks: grouped.tasks, groups: grouped.groups };
}

const kanbanLabels: Record<KanbanColumn, string> = {
  started: "In progress",
  next: "Next",
  waiting: "Waiting",
  later: "Later",
};

export function viewArea(
  area: AreaRecord,
  tasks: readonly TaskRecord[],
  today: string,
  goals: readonly GoalRecord[] = [],
): AreaView {
  const open = tasks.filter((task) => task.areaId === area.id && isOpen(task));
  const listed = areaGoals(area.id, goals);
  const base = {
    id: area.id,
    name: area.name,
    workflow: area.workflow,
    wipLimit: area.wipLimit,
    goals: listed,
  };
  if (area.workflow === "kanban") {
    const { strip, later } = laterPool(open, today);
    const columns = kanbanColumns.map((column) => {
      const pool =
        column === "later"
          ? later
          : open.filter((task) => task.status === column);
      const grouped =
        column === "later"
          ? groupLater(pool, goals, area.id, today)
          : groupByGoal(pool, goals, area.id, (items) =>
              [...items].sort(byAge),
            );
      return section(column, kanbanLabels[column], grouped);
    });
    const started = columns[0]?.tasks ?? [];
    const next = columns[1]?.tasks ?? [];
    return {
      ...base,
      nextId: started[0]?.id ?? next[0]?.id ?? null,
      warning: started.length > area.wipLimit,
      strip,
      tasks: [],
      groups: [],
      sections: columns,
    };
  }
  if (area.workflow !== "now-later") {
    const grouped = groupByGoal(open, goals, area.id, (items) =>
      priorityList(items),
    );
    return {
      ...base,
      nextId: grouped.tasks[0]?.id ?? null,
      warning: false,
      strip: [],
      tasks: grouped.tasks,
      groups: grouped.groups,
      sections: [],
    };
  }
  const { strip, later } = laterPool(open, today);
  const now = groupByGoal(
    open.filter(
      (task) =>
        task.status === "next" ||
        task.status === "started" ||
        task.status === "waiting",
    ),
    goals,
    area.id,
    (items) => [...items].sort(byAge),
  );
  const backlog = groupLater(later, goals, area.id, today);
  return {
    ...base,
    nextId: now.tasks[0]?.id ?? null,
    warning: now.tasks.length > area.wipLimit,
    strip,
    tasks: [],
    groups: [],
    sections: [
      section("now", "Now", now),
      section("later", "Later", backlog),
    ],
  };
}

export function stackedPage(
  areas: readonly AreaRecord[],
  tasks: readonly TaskRecord[],
  hiddenAreaIds: readonly string[],
  today: string,
  goals: readonly GoalRecord[] = [],
): AreaView[] {
  const hidden = new Set(hiddenAreaIds);
  return areasInCreationOrder(areas)
    .filter((area) => !hidden.has(area.id))
    .map((area) => viewArea(area, tasks, today, goals));
}

function viewOrder(view: AreaView): TaskRecord[] {
  if (view.sections.length === 0) return view.tasks;
  return [...view.strip, ...view.sections.flatMap((section) => section.tasks)];
}

// Every Area, hidden or not. Each Area's Next is marked. Order is Area
// creation, then that Area's own order, strip included.
export function coachList(
  areas: readonly AreaRecord[],
  tasks: readonly TaskRecord[],
  today: string,
  goals: readonly GoalRecord[] = [],
): CoachEntry[] {
  return areasInCreationOrder(areas).flatMap((area) => {
    const view = viewArea(area, tasks, today, goals);
    return viewOrder(view).map((task) => ({
      id: task.id,
      name: task.name,
      priority: task.priority,
      area: area.name,
      isNext: task.id === view.nextId,
    }));
  });
}

export function newTaskFields(today: string): {
  status: "later";
  priority: number;
  age: string;
  date: null;
} | null {
  if (!isCalendarDay(today)) return null;
  return { status: "later", priority: normalPriority, age: today, date: null };
}
