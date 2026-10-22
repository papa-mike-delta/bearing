import type { TaskRecord } from "@repo/domain";

// Both Task screens pass the same fields across the server/client boundary.
export function taskForBrowser(task: TaskRecord) {
  return {
    ...task,
    createdAt: task.createdAt.toISOString(),
    completedAt: task.completedAt?.toISOString() ?? null,
  };
}
