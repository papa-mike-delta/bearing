import { listArea, type CoachData } from "@repo/coach";
import { db as defaultDb } from "@repo/db";
import { nextTask } from "@repo/domain";
import { tool, type ModelMessage, type TextStreamPart, type ToolSet } from "ai";
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

// The person's open Tasks, read by Bearing at the start of a turn instead of
// waiting for the model to ask: so every answer is about the list as it is
// now, and a turn reads it once. `messages` hands the read to the model as a
// listArea call and its result. `receipt` adds the same call to the streamed
// reply, so it shows, saves and reloads as a listArea receipt.
export async function freshRead(userId: string, data: CoachData) {
  // At most 40 characters: OpenAI refuses longer tool-call ids.
  const toolCallId = `read_${crypto.randomUUID().replaceAll("-", "")}`;
  const call = { toolCallId, toolName: "listArea" } as const;
  const output = await listArea.run({}, { userId, toolCallId, data });
  const messages: ModelMessage[] = [
    { role: "assistant", content: [{ type: "tool-call", ...call, input: {} }] },
    {
      role: "tool",
      content: [
        {
          type: "tool-result",
          ...call,
          output: { type: "json", value: output },
        },
      ],
    },
  ];
  const receipt = new TransformStream<
    TextStreamPart<ToolSet>,
    TextStreamPart<ToolSet>
  >({
    transform(part, controller) {
      controller.enqueue(part);
      if (part.type !== "start") return;
      controller.enqueue({ type: "tool-call", ...call, input: {} });
      controller.enqueue({ type: "tool-result", ...call, input: {}, output });
    },
  });
  return { messages, receipt };
}
