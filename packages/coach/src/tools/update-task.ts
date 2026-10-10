import {
  kanbanColumns,
  maxAreaNameLength,
  maxPriority,
  maxTaskNameLength,
  maxTaskNoteLength,
  minPriority,
} from "@repo/domain";
import { z } from "zod";
import type { ToolRunContext } from "../data.ts";

const inputSchema = z
  .object({
    taskId: z.string().min(1),
    name: z.string().trim().min(1).max(maxTaskNameLength).optional(),
    note: z.string().max(maxTaskNoteLength).optional(),
    priority: z.number().int().min(minPriority).max(maxPriority).optional(),
    status: z.enum(kanbanColumns).optional(),
    // Goal names share the Area name limit (goalName → areaName).
    goal: z.string().max(maxAreaNameLength).nullable().optional(),
  })
  .strict();

const uuidSchema = z.uuid();

export const updateTask = {
  description:
    "Update an open Task's name, note, priority (from -2 to 2), status, or Goal. Omit a field to leave it. status is started, next, waiting, or later. completeTask is the only way to complete a Task. A status that would leave completed is refused. goal is the Goal's name in the Task's Area; null or an empty string clears it. A Goal from another Area is refused. This cannot change the Task's Area or its date — use scheduleTask to set a date. The result is the Task's id and name (and which Task is Next after), refused when a field or the Task is refused, or invalidId when the id isn't a uuid.",
  inputSchema,
  async run(
    { taskId, name, note, priority, status, goal }: z.infer<typeof inputSchema>,
    { userId, data }: ToolRunContext,
  ) {
    if (!uuidSchema.safeParse(taskId).success) {
      return { invalidId: true as const };
    }
    const before = await data.listOpenTasks(userId);
    const area = before.find((task) => task.id === taskId)?.area;
    const result = await data.updateTask(userId, taskId, {
      ...(name === undefined ? {} : { name }),
      ...(note === undefined ? {} : { note }),
      ...(priority === undefined ? {} : { priority }),
      ...(status === undefined ? {} : { status }),
      ...(goal === undefined ? {} : { goal }),
    });
    if (result === null) return { refused: true as const };
    const after = await data.listOpenTasks(userId);
    const next = after.find(
      (task) => task.isNext && (area === undefined || task.area === area),
    );
    return {
      id: result.id,
      name: result.name,
      next: next ? { id: next.id, name: next.name } : null,
    };
  },
};
