import { z } from "zod";
import type { ToolRunContext } from "../data.ts";

// Accept any string so a malformed id becomes a structured result, not a
// schema error the model sees as a generic tool failure.
const inputSchema = z.object({ taskId: z.string().min(1) });

const uuidSchema = z.uuid();

export const completeTask = {
  description:
    "Complete exactly one open Task by its id. The result is that Task's id and name (and which Task is Next after), notFound when it isn't an open Task, or invalidId when the id isn't a uuid.",
  inputSchema,
  async run(
    { taskId }: z.infer<typeof inputSchema>,
    { userId, messageId, today, data }: ToolRunContext,
  ) {
    if (!uuidSchema.safeParse(taskId).success) {
      return { invalidId: true as const };
    }
    const before = await data.listOpenTasks(userId);
    const area = before.find((task) => task.id === taskId)?.area;
    const result = await data.completeTask(userId, taskId, { messageId, today });
    if (result === null) return { notFound: true as const };
    const after = await data.listOpenTasks(userId);
    const next = after.find(
      (task) => task.isNext && (area === undefined || task.area === area),
    );
    return {
      id: result.id,
      name: result.name,
      ...(result.spawned ? { spawned: result.spawned } : {}),
      next: next ? { id: next.id, name: next.name } : null,
    };
  },
};
