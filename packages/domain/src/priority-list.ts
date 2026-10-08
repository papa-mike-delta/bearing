// Priority List: one list, no sections, open or completed.

export const normalPriority = 0;

export type ListTask = {
  priority: number;
  createdAt: Date;
  completedAt: Date | null;
};

// Open tasks, highest priority first, then oldest first.
export function priorityList<T extends ListTask>(tasks: readonly T[]): T[] {
  return tasks
    .filter((task) => task.completedAt === null)
    .sort(
      (a, b) =>
        b.priority - a.priority ||
        a.createdAt.getTime() - b.createdAt.getTime(),
    );
}

// The task marked next is the first open task in list order.
export function nextTask<T extends ListTask>(tasks: readonly T[]): T | null {
  return priorityList(tasks)[0] ?? null;
}
