// Product rules live here. No React, no database.
// Workflow sort, scheduling, recurrence, and reconnect are pure functions.

export * from "./areas.ts";
export * from "./draft.ts";
// The filing schema builds zod at import time, so it has its own entry
// (@repo/domain/draft-filing) to keep zod out of client bundles. Types are free.
export type { FileDraftInput, FiledDraft } from "./draft-filing.ts";
export * from "./habit.ts";
export * from "./link.ts";
export * from "./next-date.ts";
export * from "./note.ts";
export * from "./priority-list.ts";
export * from "./task.ts";

export const workflows = [
  "priority-list",
  "now-later",
  "kanban",
  "must-should-want",
  "plan-your-days",
  "eisenhower",
] as const;

export type Workflow = (typeof workflows)[number];

export * from "./recurring-task.ts";
