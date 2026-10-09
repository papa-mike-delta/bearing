import { z } from "zod";
import type { ToolRunContext } from "../data.ts";

const inputSchema = z
  .object({
    taskId: z.string().min(1),
    date: z.string(),
  })
  .strict();

const uuidSchema = z.uuid();

export const scheduleTask = {
  description:
    "Schedule an open Task on a future calendar date, YYYY-MM-DD, strictly after today. This is the only way to set a date. It forces the status to later and sets the Task's age to that date. Today or earlier is refused. The result is the Task's id and name (and which Task is Next after), refused when the date or Task is refused, or invalidId when the id isn't a uuid.",
  inputSchema,
  async run(
    { taskId, date }: z.infer<typeof inputSchema>,
    { userId, data }: ToolRunContext,
  ) {
    if (!uuidSchema.safeParse(taskId).success) {
      return { invalidId: true as const };
    }
    const before = await data.listOpenTasks(userId);
    const area = before.find((task) => task.id === taskId)?.area;
    const result = await data.scheduleTask(userId, taskId, date);
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
