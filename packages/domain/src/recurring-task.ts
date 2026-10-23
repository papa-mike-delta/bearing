import { nextDate, type NextDateRule } from "./next-date.ts";

type RepeatingTask = {
  name: string;
  note: string;
  priority: number;
  goalId: string | null;
  areaId: string;
  rule: NextDateRule | null;
};

// Completion day, never the old reminder day, anchors the next Task.
export function spawnTask(task: RepeatingTask, completionDay: string) {
  if (!task.rule) return null;
  const date = nextDate(task.rule, completionDay);
  if (!date) throw new Error("Cannot determine next Task date");
  const { name, note, priority, goalId, areaId, rule } = task;
  return { name, note, priority, goalId, areaId, rule, date };
}
