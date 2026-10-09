import {
  completeTask,
  createTask,
  listArea,
  maxCreatesPerTurn,
  scheduleTask,
  updateTask,
  type CoachData,
} from "@repo/coach";
import { db as defaultDb } from "@repo/db";
import { tool, type ModelMessage, type TextStreamPart, type ToolSet } from "ai";
import { z } from "zod";
import type { Db } from "./db.ts";
import { addTask, completeTask as completeTaskRow, listForCoach, scheduleOn, updateOpenTask } from "./tasks.ts";

export { maxCreatesPerTurn };

// The Coach's data, through the same functions the screens use.
export function coachData(db: Db = defaultDb, today = ""): CoachData {
  return {
    async listOpenTasks(userId) {
      return listForCoach(userId, today, db);
    },
    createTask(userId, input, from) {
      return addTask(userId, { ...input, from, today }, db);
    },
    completeTask(userId, taskId) {
      return completeTaskRow(userId, taskId, db);
    },
    scheduleTask(userId, taskId, date) {
      return scheduleOn(userId, taskId, date, today, db);
    },
    updateTask(userId, taskId, input) {
      return updateOpenTask(userId, taskId, input, db);
    },
  };
}

// Session user + the person's message id (stable across resends) reach each
// tool only through typed context, checked on every call.
const toolContext = z.object({ userId: z.uuid(), messageId: z.uuid() });

type ToolRun = {
  userId: string;
  toolCallId: string;
  messageId: string;
  data: CoachData;
};

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

async function runListArea(input: {}, ctx: ToolRun) {
  try {
    return await listArea.run(input, ctx);
  } catch (error) {
    logToolError("listArea", ctx.toolCallId, error);
    throw new Error("The list couldn't be read.");
  }
}

async function runCreateTask(
  input: { name: string; note?: string; area?: string },
  ctx: ToolRun,
) {
  try {
    return await createTask.run(input, ctx);
  } catch (error) {
    logToolError("createTask", ctx.toolCallId, error);
    throw new Error("Couldn't create that task.");
  }
}

async function runCompleteTask(input: { taskId: string }, ctx: ToolRun) {
  try {
    return await completeTask.run(input, ctx);
  } catch (error) {
    logToolError("completeTask", ctx.toolCallId, error);
    throw new Error("Couldn't complete that task.");
  }
}

async function runScheduleTask(
  input: { taskId: string; date: string },
  ctx: ToolRun,
) {
  try {
    return await scheduleTask.run(input, ctx);
  } catch (error) {
    logToolError("scheduleTask", ctx.toolCallId, error);
    throw new Error("Couldn't schedule that task.");
  }
}

async function runUpdateTask(
  input: {
    taskId: string;
    name?: string;
    note?: string;
    priority?: number;
    status?: "later" | "next" | "started" | "waiting" | "completed";
    goal?: string | null;
  },
  ctx: ToolRun,
) {
  try {
    return await updateTask.run(input, ctx);
  } catch (error) {
    logToolError("updateTask", ctx.toolCallId, error);
    throw new Error("Couldn't update that task.");
  }
}

export function coachTools(data: CoachData) {
  let completedThisTurn = false;
  let createdThisTurn = 0;
  return {
    listArea: tool({
      description: listArea.description,
      inputSchema: listArea.inputSchema,
      contextSchema: toolContext,
      execute: (input, { context, toolCallId }) =>
        runListArea(input, {
          userId: context.userId,
          toolCallId,
          messageId: context.messageId,
          data,
        }),
    }),
    createTask: tool({
      description: createTask.description,
      inputSchema: createTask.inputSchema,
      contextSchema: toolContext,
      execute: (input, { context, toolCallId }) => {
        // Count before awaiting so parallel calls in one step share the cap.
        if (createdThisTurn >= maxCreatesPerTurn) {
          throw new Error(
            `You can add only ${maxCreatesPerTurn} Tasks per reply.`,
          );
        }
        createdThisTurn += 1;
        return runCreateTask(input, {
          userId: context.userId,
          toolCallId,
          messageId: context.messageId,
          data,
        });
      },
    }),
    completeTask: tool({
      description: completeTask.description,
      inputSchema: completeTask.inputSchema,
      contextSchema: toolContext,
      execute: (input, { context, toolCallId }) => {
        if (completedThisTurn) {
          throw new Error("You can complete only one Task per reply.");
        }
        completedThisTurn = true;
        return runCompleteTask(input, {
          userId: context.userId,
          toolCallId,
          messageId: context.messageId,
          data,
        });
      },
    }),
    scheduleTask: tool({
      description: scheduleTask.description,
      inputSchema: scheduleTask.inputSchema,
      contextSchema: toolContext,
      execute: (input, { context, toolCallId }) =>
        runScheduleTask(input, {
          userId: context.userId,
          toolCallId,
          messageId: context.messageId,
          data,
        }),
    }),
    updateTask: tool({
      description: updateTask.description,
      inputSchema: updateTask.inputSchema,
      contextSchema: toolContext,
      execute: (input, { context, toolCallId }) =>
        runUpdateTask(input, {
          userId: context.userId,
          toolCallId,
          messageId: context.messageId,
          data,
        }),
    }),
  };
}

export const coachToolNames = [
  "listArea",
  "createTask",
  "completeTask",
  "scheduleTask",
  "updateTask",
] as const;

export function coachToolsContext(userId: string, messageId: string) {
  return Object.fromEntries(
    coachToolNames.map((name) => [name, { userId, messageId }]),
  ) as {
    [Name in (typeof coachToolNames)[number]]: {
      userId: string;
      messageId: string;
    };
  };
}

export async function freshRead(userId: string, data: CoachData) {
  const toolCallId = `read_${crypto.randomUUID().replaceAll("-", "")}`;
  const call = { toolCallId, toolName: "listArea" } as const;
  // freshRead has no user message; a placeholder uuid keeps the context shape.
  const messageId = "00000000-0000-4000-8000-000000000000";
  const output = await runListArea({}, { userId, toolCallId, messageId, data });
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
