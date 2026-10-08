// Tool definitions, skill files, and knowledge markdown.
// No model calls and no AI SDK. apps/web wraps the tools and owns the route.

export type { CoachData, ListedTask, ToolRunContext } from "./data.ts";
export { coachSystemPrompt, maxCoachSteps } from "./prompt.ts";
export { receipt, shownParts, type ShownPart } from "./receipts.ts";
export { completeTask } from "./tools/complete-task.ts";
export { createTask } from "./tools/create-task.ts";
export { listArea, maxListedTasks } from "./tools/list-area.ts";

// The longest message a person can send the Coach, in UTF-16 code units (what
// an input's maxLength counts). Every saved message goes into later prompts.
export const maxCoachMessageLength = 4_000;

export const skills = [
  "weekly-review",
  "habit-design",
  "reconnect",
  "daily-close",
  "empty-now",
] as const;

export type Skill = (typeof skills)[number];
