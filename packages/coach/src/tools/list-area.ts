import { z } from "zod";
import type { ToolRunContext } from "../data.ts";

// At most this many Tasks go into the prompt; `open` still counts them all.
export const maxListedTasks = 50;

export const listArea = {
  description: `Read the person's open Tasks from every Area, including hidden ones. Areas are in creation order, and each Area keeps its own order. Each Task names its Area. A repeating Task also has its rule and derived repeat phrase. A Task with isNext true is the bold Next of its own Area, so more than one can be Next. \`open\` is how many open Tasks they have; only the first ${maxListedTasks} are listed. Bearing reads it for you at the start of every reply.`,
  inputSchema: z.object({}),
  async run(_input: object, { userId, data }: ToolRunContext) {
    const tasks = await data.listOpenTasks(userId);
    return { open: tasks.length, tasks: tasks.slice(0, maxListedTasks) };
  },
};
