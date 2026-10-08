import {
  completeTask,
  createTask,
  listArea,
  type CoachData,
} from "@repo/coach";
import { db as defaultDb } from "@repo/db";
import { nextTask } from "@repo/domain";
import { tool, type ModelMessage, type TextStreamPart, type ToolSet } from "ai";
import { z } from "zod";
import type { Db } from "./db.ts";
import {
  addTask,
  completeTask as completeTaskRow,
  openTasks,
} from "./tasks.ts";

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
    createTask(userId, input, from) {
      return addTask(userId, { ...input, from }, db);
    },
    completeTask(userId, taskId) {
      return completeTaskRow(userId, taskId, db);
    },
  };
}

// The session user reaches each tool only through its typed context, checked
// on every call. A call without it fails before the tool runs.
const userContext = z.object({ userId: z.uuid() });

type ToolRun = {
  userId: string;
  toolCallId: string;
  data: CoachData;
};

// A thrown database error must not reach the model (it can carry SQL and the
// user id). Log the error name and SQLSTATE, then throw a fixed sentence.
function logToolError(toolName: string, toolCallId: string, error: unknown) {
  console.error(
    JSON.stringify({
      event: "coach.tool.error",
      tool: toolName,
      toolCallId,
      error: error instanceof Error ? error.name : "Error",
      code:
        error instanceof Error
          ? (error.cause as { code?: string } | undefined)?.code
          : undefined,
    }),
  );
}

async function runListArea(input: {}, { userId, toolCallId, data }: ToolRun) {
  try {
    return await listArea.run(input, { userId, toolCallId, data });
  } catch (error) {
    logToolError("listArea", toolCallId, error);
    throw new Error("The list couldn't be read.");
  }
}

async function runCreateTask(
  input: { name: string; note?: string },
  { userId, toolCallId, data }: ToolRun,
) {
  try {
    return await createTask.run(input, { userId, toolCallId, data });
  } catch (error) {
    logToolError("createTask", toolCallId, error);
    throw new Error("Couldn't create that task.");
  }
}

async function runCompleteTask(
  input: { taskId: string },
  { userId, toolCallId, data }: ToolRun,
) {
  try {
    return await completeTask.run(input, { userId, toolCallId, data });
  } catch (error) {
    logToolError("completeTask", toolCallId, error);
    throw new Error("Couldn't complete that task.");
  }
}

export function coachTools(data: CoachData) {
  // At most one completeTask per turn; a second call is refused before data.
  let completedThisTurn = false;
  return {
    listArea: tool({
      description: listArea.description,
      inputSchema: listArea.inputSchema,
      contextSchema: userContext,
      execute: (input, { context, toolCallId }) =>
        runListArea(input, {
          userId: context.userId,
          toolCallId,
          data,
        }),
    }),
    createTask: tool({
      description: createTask.description,
      inputSchema: createTask.inputSchema,
      contextSchema: userContext,
      execute: (input, { context, toolCallId }) =>
        runCreateTask(input, {
          userId: context.userId,
          toolCallId,
          data,
        }),
    }),
    completeTask: tool({
      description: completeTask.description,
      inputSchema: completeTask.inputSchema,
      contextSchema: userContext,
      execute: (input, { context, toolCallId }) => {
        if (completedThisTurn) {
          throw new Error("You can complete only one Task per reply.");
        }
        completedThisTurn = true;
        return runCompleteTask(input, {
          userId: context.userId,
          toolCallId,
          data,
        });
      },
    }),
  };
}

// The Coach's tools. coachToolsContext is built from this list; the test
// checks it matches the keys coachTools registers.
export const coachToolNames = [
  "listArea",
  "createTask",
  "completeTask",
] as const;

// The context for every Coach tool, from the session user.
export function coachToolsContext(userId: string) {
  return Object.fromEntries(
    coachToolNames.map((name) => [name, { userId }]),
  ) as { [Name in (typeof coachToolNames)[number]]: { userId: string } };
}

// The person's open Tasks, read by Bearing at the start of a turn instead of
// waiting for the model to ask: so every answer is about the list as it is
// now, and a turn reads it once. `messages` hands the read to the model as a
// listArea call and its result, noted as the list right now. `receipt` adds
// the same call to the streamed reply, so it shows, saves and reloads as a
// listArea receipt.
export async function freshRead(userId: string, data: CoachData) {
  // At most 40 characters: OpenAI refuses longer tool-call ids.
  const toolCallId = `read_${crypto.randomUUID().replaceAll("-", "")}`;
  const call = { toolCallId, toolName: "listArea" } as const;
  const output = await runListArea({}, { userId, toolCallId, data });
  const messages: ModelMessage[] = [
    { role: "assistant", content: [{ type: "tool-call", ...call, input: {} }] },
    {
      role: "tool",
      content: [
        {
          type: "tool-result",
          ...call,
          output: {
            type: "json",
            // note last so a field of the same name in output can't overwrite it
            value: { ...output, note: "The person's list right now." },
          },
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
