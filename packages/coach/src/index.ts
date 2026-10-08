// Tool definitions, skill files, and knowledge markdown.
// No model calls. apps/web owns the AI SDK route.

export const skills = [
  "weekly-review",
  "habit-design",
  "reconnect",
  "daily-close",
  "empty-now",
] as const;

export type Skill = (typeof skills)[number];
