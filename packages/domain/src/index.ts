// Product rules live here. No React, no database.
// Workflow sort, scheduling, recurrence, and reconnect are pure functions.

export * from "./draft.ts";
export * from "./priority-list.ts";

export const workflows = [
  "priority-list",
  "now-later",
  "kanban",
  "must-should-want",
  "plan-your-days",
  "eisenhower",
] as const;

export type Workflow = (typeof workflows)[number];
