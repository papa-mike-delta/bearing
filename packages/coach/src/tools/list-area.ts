import { z } from "zod";
import type { ToolRunContext } from "../data.ts";

// At most this many Tasks go into the prompt; `open` still counts them all.
export const maxListedTasks = 50;

export const listArea = {
  description: `Read the person's open Tasks in Priority List order, highest priority first. The Task with isNext true is the one marked Next on their list. \`open\` is how many open Tasks they have; only the first ${maxListedTasks} are listed.`,
  inputSchema: z.object({}),
  async run(_input: object, { userId, data }: ToolRunContext) {
    const tasks = await data.listOpenTasks(userId);
    return { open: tasks.length, tasks: tasks.slice(0, maxListedTasks) };
  },
};
