// Tool definitions, skill files, and knowledge markdown.
// No model calls. apps/web owns the AI SDK route.

export { coachSystemPrompt } from "./prompt.ts";

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
