export const skills = [
  "weekly-review",
  "habit-design",
  "reconnect",
  "daily-close",
  "empty-now",
] as const;

export type Skill = (typeof skills)[number];

