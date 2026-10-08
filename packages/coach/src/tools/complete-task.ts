import { z } from "zod";
import type { ToolRunContext } from "../data.ts";

const inputSchema = z.object({ taskId: z.uuid() });

export const completeTask = {
  description:
    "Complete exactly one open Task by its id. The result is that Task's id and name, or notFound when it isn't an open Task.",
  inputSchema,
  async run(
    { taskId }: z.infer<typeof inputSchema>,
    { userId, data }: ToolRunContext,
  ) {
    const result = await data.completeTask(userId, taskId);
    if (result === null) return { notFound: true as const };
    return { id: result.id, name: result.name };
  },
};
