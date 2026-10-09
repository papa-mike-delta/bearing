import { z } from "zod";
import type { ToolRunContext } from "../data.ts";

// Accept any string so a malformed id becomes a structured result, not a
// schema error the model sees as a generic tool failure.
const inputSchema = z.object({ taskId: z.string().min(1) });

const uuidSchema = z.uuid();

async function nextOf(
  userId: string,
  data: ToolRunContext["data"],
): Promise<{ id: string; name: string } | null> {
  const tasks = await data.listOpenTasks(userId);
  const next = tasks.find((t) => t.isNext);
  return next ? { id: next.id, name: next.name } : null;
}

export const completeTask = {
  description:
    "Complete exactly one open Task by its id. The result is that Task's id and name (and which Task is Next after), notFound when it isn't an open Task, or invalidId when the id isn't a uuid.",
  inputSchema,
  async run(
    { taskId }: z.infer<typeof inputSchema>,
    { userId, data }: ToolRunContext,
  ) {
    if (!uuidSchema.safeParse(taskId).success) {
      return { invalidId: true as const };
    }
    const result = await data.completeTask(userId, taskId);
    if (result === null) return { notFound: true as const };
    return {
      id: result.id,
      name: result.name,
      next: await nextOf(userId, data),
    };
  },
};
