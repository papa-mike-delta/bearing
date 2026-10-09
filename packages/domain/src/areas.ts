// Areas, workflows, dates, and the task page. Pure: no React, no database.
// The page and the Coach call this. They do not grow a second copy of the sort.

import {
  nextTask,
  normalPriority,
  priorityList,
  type ListTask,
} from "./priority-list.ts";
import { maxTaskNameLength } from "./task.ts";
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
export const offeredWorkflows = ["priority-list", "now-later"] as const;

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
};

export type TaskSection = {
  id: "now" | "later";
  label: string;
  tasks: TaskRecord[];
};

export type AreaView = {
  id: string;
  name: string;
  workflow: Workflow;
  wipLimit: number;
  nextId: string | null;
  warning: boolean;
  strip: TaskRecord[];
  tasks: TaskRecord[];
  sections: TaskSection[];
};

export type CoachEntry = {
  id: string;
  name: string;
  priority: number;
  area: string;
  isNext: boolean;
};

const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

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

function laterTasks(tasks: readonly TaskRecord[], today: string) {
  const later = tasks.filter((task) => task.status === "later");
  const due = later.filter((task) => dated(task, today) === "due");
  const future = later.filter((task) => dated(task, today) === "future");
  const rest = later.filter((task) => dated(task, today) === null);
  return {
    strip: [...due].sort(byAge),
    bottom: [...future].sort((a, b) => byDate(
      { date: a.date ?? "", priority: a.priority, id: a.id },
      { date: b.date ?? "", priority: b.priority, id: b.id },
    )),
    rest: [...rest].sort(byAge),
  };
}

function nowTasks(tasks: readonly TaskRecord[]) {
  return tasks
    .filter(
      (task) =>
        task.status === "next" ||
        task.status === "started" ||
        task.status === "waiting",
    )
    .sort(byAge);
}

export function viewArea(
  area: AreaRecord,
  tasks: readonly TaskRecord[],
  today: string,
): AreaView {
  const open = tasks.filter((task) => task.areaId === area.id && isOpen(task));
  const base = {
    id: area.id,
    name: area.name,
    workflow: area.workflow,
    wipLimit: area.wipLimit,
  };
  if (area.workflow !== "now-later") {
    const ordered = priorityList(open);
    return {
      ...base,
      nextId: nextTask(open)?.id ?? null,
      warning: false,
      strip: [],
      tasks: ordered,
      sections: [],
    };
  }
  const { strip, bottom, rest } = laterTasks(open, today);
  const now = nowTasks(open);
  return {
    ...base,
    nextId: now[0]?.id ?? null,
    warning: now.length > area.wipLimit,
    strip,
    tasks: [],
    sections: [
      { id: "now", label: "Now", tasks: now },
      { id: "later", label: "Later", tasks: [...rest, ...bottom] },
    ],
  };
}

export function stackedPage(
  areas: readonly AreaRecord[],
  tasks: readonly TaskRecord[],
  hiddenAreaIds: readonly string[],
  today: string,
): AreaView[] {
  const hidden = new Set(hiddenAreaIds);
  return areasInCreationOrder(areas)
    .filter((area) => !hidden.has(area.id))
    .map((area) => viewArea(area, tasks, today));
}

// Every Area, hidden or not. Each Area's Next is marked. Order is Area
// creation, then that Area's own order, strip included.
export function coachList(
  areas: readonly AreaRecord[],
  tasks: readonly TaskRecord[],
  today: string,
): CoachEntry[] {
  return areasInCreationOrder(areas).flatMap((area) => {
    const view = viewArea(area, tasks, today);
    const ordered =
      view.workflow === "now-later"
        ? [
            ...view.strip,
            ...(view.sections.find((section) => section.id === "now")?.tasks ??
              []),
            ...(view.sections.find((section) => section.id === "later")
              ?.tasks ?? []),
          ]
        : view.tasks;
    return ordered.map((task) => ({
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
