import { listArea, type CoachData } from "@repo/coach";
import { db as defaultDb } from "@repo/db";
import { nextTask } from "@repo/domain";
import { tool } from "ai";
import { z } from "zod";
import type { Db } from "./db.ts";
import { openTasks } from "./tasks.ts";

// The Coach's data, through the same functions the screens use.
export function coachData(db: Db = defaultDb): CoachData {
  return {
    async listOpenTasks(userId) {
      const tasks = await openTasks(userId, db);
      const next = nextTask(tasks);
      return tasks.map(({ id, name, priority }) => ({
        id,
        name,
        priority,
        isNext: id === next?.id,
      }));
    },
  };
}

// The session user reaches each tool only through its typed context, checked
// on every call. A call without it fails before the tool runs.
const userContext = z.object({ userId: z.uuid() });

export function coachTools(data: CoachData) {
  return {
    listArea: tool({
      description: listArea.description,
      inputSchema: listArea.inputSchema,
      contextSchema: userContext,
      execute: (input, { context, toolCallId }) =>
        listArea.run(input, { userId: context.userId, toolCallId, data }),
    }),
  };
}

// The context for every Coach tool, from the session user.
export function coachToolsContext(userId: string) {
  return { listArea: { userId } };
}
