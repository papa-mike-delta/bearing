import {
  appendJournal,
  fileDraft,
  listInboxDrafts,
  completeTask,
  createNote,
  listNotebooks,
  createTask,
  listArea,
  maxCreatesPerTurn,
  setMood,
  scheduleTask,
  updateTask,
  type CoachData,
} from "@repo/coach";
import { db as defaultDb } from "@repo/db";
import { tool, type ModelMessage, type TextStreamPart, type ToolSet } from "ai";
import { z } from "zod";
import { setMood as setMoodRow, MoodError } from "./mood.ts";
import { isJournalDay } from "./journal-day.ts";
import { appendJournal as appendJournalRow, JournalError } from "./journal.ts";
import { fileDraft as fileDraftRow, listInboxDrafts as inboxRows, DraftError } from "./drafts.ts";
import type { Db } from "./db.ts";
import { addTask, completeTask as completeTaskRow, listForCoach, scheduleOn, updateOpenTask } from "./tasks.ts";

import { createNote as createNoteRow, NoteError, listNotebooks as notebookRows } from "./notes.ts";

export { maxCreatesPerTurn };

const maxSchedulesPerTurn = 3;
const maxUpdatesPerTurn = 3;

// The Coach's data, through the same functions the screens use.
export function coachData(db: Db = defaultDb, today = ""): CoachData {
  return {
    listInboxDrafts(userId) { return inboxRows(userId, db); },
    fileDraft(userId, input) { return fileDraftRow(userId, input, db); },
    setMood(userId, input) { return setMoodRow(userId, input, db); },
    appendJournal(userId, input) { return appendJournalRow(userId, input, db); },
    listNotebooks(userId) { return notebookRows(userId, db); },
    async createNote(userId, input, from) {
      const note = await createNoteRow(userId, input, from, db);
      if (note.notebookId !== input.notebookId) throw new Error("Invalid Note result.");
      return { id: note.id, notebookId: note.notebookId, title: note.title };
    },
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
const toolContext = z.object({ userId: z.uuid(), messageId: z.uuid(), today: z.string().optional(), messageCreatedAt: z.number().int().nonnegative().optional() });

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
    status?: "started" | "next" | "waiting" | "later";
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
  let scheduledThisTurn = 0;
  let updatedThisTurn = 0;
  return {
    listInboxDrafts: tool({
      description: listInboxDrafts.description,
      inputSchema: listInboxDrafts.inputSchema,
      contextSchema: toolContext,
      execute: async (input, { context, toolCallId }) => {
        try { return await listInboxDrafts.run(input, { ...context, toolCallId, data }); }
        catch (error) { logToolError("listInboxDrafts", toolCallId, error); throw new Error("Couldn't read your Inbox drafts."); }
      },
    }),
    fileDraft: tool({
      description: fileDraft.description,
      inputSchema: fileDraft.inputSchema,
      contextSchema: toolContext,
      execute: async (input, { context, toolCallId }) => {
        if (createdThisTurn >= maxCreatesPerTurn) throw new Error(`You can make only ${maxCreatesPerTurn} Task, Note, Journal or Mood writes per reply.`);
        createdThisTurn += 1;
        if (input.destination.kind === "journal") {
          const day = input.destination.day === undefined || input.destination.day === "today" ? context.today : input.destination.day;
          if (!context.today || !isJournalDay(context.today)) throw new Error("Supply the browser's Today as a real YYYY-MM-DD calendar day, then retry.");
          if (!isJournalDay(day) || day > context.today) throw new Error("This day is not open yet.");
        }
        try { return await fileDraft.run(input, { ...context, toolCallId, data }); }
        catch (error) {
          logToolError("fileDraft", toolCallId, error);
          throw new Error(error instanceof DraftError || error instanceof JournalError || error instanceof NoteError ? error.message : "Couldn't file that draft.");
        }
      },
    }),
    appendJournal: tool({
      description: appendJournal.description,
      inputSchema: appendJournal.inputSchema,
      contextSchema: toolContext,
      execute: async (input, { context, toolCallId }) => {
        if (createdThisTurn >= maxCreatesPerTurn) throw new Error(`You can make only ${maxCreatesPerTurn} Task, Note, Journal or Mood writes per reply.`);
        createdThisTurn += 1;
        // Validation errors are safe and recoverable; never expose database errors.
        const day = input.day === undefined || input.day === "today" ? context.today : input.day;
        if (!context.today || !isJournalDay(context.today)) throw new Error("Supply the browser's Today as a real YYYY-MM-DD calendar day, then retry.");
        if (!isJournalDay(day) || day > context.today) throw new Error("This day is not open yet.");
        try { return await appendJournal.run(input, { ...context, toolCallId, data }); }
        catch (error) {
          logToolError("appendJournal", toolCallId, error);
          throw new Error(error instanceof JournalError ? error.message : "Couldn't append to that Journal day.");
        }
      },
    }),
    setMood: tool({
      description: setMood.description,
      inputSchema: setMood.inputSchema,
      contextSchema: toolContext,
      execute: async (input, { context, toolCallId }) => {
        if (createdThisTurn >= maxCreatesPerTurn) throw new Error(`You can make only ${maxCreatesPerTurn} Task, Note, Journal or Mood writes per reply.`);
        createdThisTurn += 1;
        const day = input.day === undefined || input.day === "today" ? context.today : input.day;
        if (!context.today || !isJournalDay(context.today)) throw new Error("Supply the browser's Today as a real YYYY-MM-DD calendar day, then retry.");
        if (!isJournalDay(day) || day > context.today) throw new Error("This day is not open yet.");
        try { return await setMood.run(input, { ...context, toolCallId, data }); }
        catch (error) {
          logToolError("setMood", toolCallId, error);
          throw new Error(error instanceof MoodError ? error.message : "Couldn't set that mood.");
        }
      },
    }),
    listNotebooks: tool({
      description: listNotebooks.description,
      inputSchema: listNotebooks.inputSchema,
      contextSchema: toolContext,
      execute: async (input, { context, toolCallId }) => {
        try { return await listNotebooks.run(input, { ...context, toolCallId, data }); }
        catch (error) { logToolError("listNotebooks", toolCallId, error); throw new Error("Couldn't read your notebooks."); }
      },
    }),
    createNote: tool({
      description: createNote.description,
      inputSchema: createNote.inputSchema,
      contextSchema: toolContext,
      execute: async (input, { context, toolCallId }) => {
        // Count before awaiting so parallel calls in one step share the cap.
        if (createdThisTurn >= maxCreatesPerTurn) {
          throw new Error(
            `You can make only ${maxCreatesPerTurn} Task, Note, Journal or Mood writes per reply.`,
          );
        }
        createdThisTurn += 1;
        try {
          return await createNote.run(input, { ...context, toolCallId, data });
        } catch (error) {
          logToolError("createNote", toolCallId, error);
          throw new Error("Couldn't create that Note.");
        }
      },
    }),
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
            `You can make only ${maxCreatesPerTurn} Task, Note, Journal or Mood writes per reply.`,
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
      execute: (input, { context, toolCallId }) => {
        // Count before awaiting so parallel calls in one step share the cap.
        if (scheduledThisTurn >= maxSchedulesPerTurn) {
          throw new Error(
            `You can schedule only ${maxSchedulesPerTurn} Tasks per reply.`,
          );
        }
        scheduledThisTurn += 1;
        return runScheduleTask(input, {
          userId: context.userId,
          toolCallId,
          messageId: context.messageId,
          data,
        });
      },
    }),
    updateTask: tool({
      description: updateTask.description,
      inputSchema: updateTask.inputSchema,
      contextSchema: toolContext,
      execute: (input, { context, toolCallId }) => {
        // Count before awaiting so parallel calls in one step share the cap.
        if (updatedThisTurn >= maxUpdatesPerTurn) {
          throw new Error(
            `You can update only ${maxUpdatesPerTurn} Tasks per reply.`,
          );
        }
        updatedThisTurn += 1;
        return runUpdateTask(input, {
          userId: context.userId,
          toolCallId,
          messageId: context.messageId,
          data,
        });
      },
    }),
  };
}

export const coachToolNames = [
  "fileDraft",
  "listInboxDrafts",
  "appendJournal",
  "setMood",
  "listNotebooks",
  "createNote",
  "listArea",
  "createTask",
  "completeTask",
  "scheduleTask",
  "updateTask",
] as const;

export function coachToolsContext(userId: string, messageId: string, today = "", messageCreatedAt?: number) {
  return Object.fromEntries(
    coachToolNames.map((name) => [name, { userId, messageId, today, messageCreatedAt }]),
  ) as {
    [Name in (typeof coachToolNames)[number]]: {
      userId: string;
      messageId: string;
      today: string;
      messageCreatedAt?: number;
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
