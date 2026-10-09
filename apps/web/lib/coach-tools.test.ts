// The Coach's tools get the user id only from their typed context. No
// database, no Gateway, no key: a fake data interface and a scripted model.

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mock, test } from "node:test";
import { coachCreateSourceId, type CoachData } from "@repo/coach";
import { simulateReadableStream, streamText, type ToolSet } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import {
  coachToolNames,
  coachTools,
  coachToolsContext,
} from "./coach-tools.ts";

const unusedWrites = {
  async createTask() {
    throw new Error("createTask should not run");
  },
  async completeTask() {
    throw new Error("completeTask should not run");
  },
} satisfies Pick<CoachData, "createTask" | "completeTask">;

const messageId = "11111111-1111-4111-8111-111111111111";

const usage = {
  inputTokens: {
    total: 1,
    noCache: 1,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};

// One model step that calls listArea, passing a user id of its own.
const callsListArea = (input = "{}") =>
  new MockLanguageModelV4({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          {
            type: "tool-call",
            toolCallId: "call_1",
            toolName: "listArea",
            input,
          },
          {
            type: "finish",
            finishReason: { unified: "tool-calls", raw: undefined },
            usage,
          },
        ],
      }),
    }),
  });

// Runs one step with the tools and `toolsContext`, and returns the users the
// data interface was asked about and what the step produced.
async function run(toolsContext: unknown, input?: string) {
  const asked: string[] = [];
  const data: CoachData = {
    async listOpenTasks(userId) {
      asked.push(userId);
      return [];
    },
    ...unusedWrites,
  };
  const result = streamText({
    model: callsListArea(input),
    prompt: "What's on my list?",
    tools: coachTools(data) as ToolSet,
    toolsContext: toolsContext as never,
    onError: () => {},
  });
  const parts: { type: string }[] = [];
  for await (const part of result.stream) parts.push(part);
  return { asked, types: parts.map((p) => p.type) };
}

test("a tool reads the user id from its context, not from the model", async () => {
  const userId = randomUUID();
  const someoneElse = JSON.stringify({ userId: randomUUID() });
  const { asked, types } = await run(
    coachToolsContext(userId, messageId),
    someoneElse,
  );
  assert.deepEqual(asked, [userId]);
  assert.ok(types.includes("tool-result"));
});

test("a tool call with no context, or no user id in it, fails and doesn't run", async () => {
  for (const context of [
    undefined,
    {},
    { listArea: {} },
    coachToolsContext("not-a-uuid", messageId),
  ]) {
    const { asked, types } = await run(context);
    assert.deepEqual(asked, [], JSON.stringify(context));
    assert.ok(!types.includes("tool-result"), JSON.stringify(context));
    assert.ok(types.includes("error"), JSON.stringify(context));
  }
});

test("a tool error reaches the model as a fixed sentence, not the database text", async () => {
  const userId = randomUUID();
  const data: CoachData = {
    async listOpenTasks() {
      throw new Error(`Failed query: select … params: ${userId}`, {
        cause: { code: "42P01" },
      });
    },
    ...unusedWrites,
  };
  let step = 0;
  let secondPrompt = "";
  const model = new MockLanguageModelV4({
    doStream: async (options) => {
      step += 1;
      if (step === 1) {
        return {
          stream: simulateReadableStream({
            chunks: [
              {
                type: "tool-call",
                toolCallId: "call_1",
                toolName: "listArea",
                input: "{}",
              },
              {
                type: "finish",
                finishReason: { unified: "tool-calls", raw: undefined },
                usage,
              },
            ],
          }),
        };
      }
      secondPrompt = JSON.stringify(options.prompt);
      return {
        stream: simulateReadableStream({
          chunks: [
            { type: "text-start", id: "t" },
            { type: "text-delta", id: "t", delta: "ok" },
            { type: "text-end", id: "t" },
            {
              type: "finish",
              finishReason: { unified: "stop", raw: undefined },
              usage,
            },
          ],
        }),
      };
    },
  });
  const error = mock.method(console, "error", () => {});
  const result = streamText({
    model,
    prompt: "What's on my list?",
    tools: coachTools(data) as ToolSet,
    toolsContext: coachToolsContext(userId, messageId) as never,
    stopWhen: ({ steps }) => steps.length >= 2,
    onError: () => {},
  });
  try {
    for await (const _ of result.stream);
  } finally {
    error.mock.restore();
  }
  assert.ok(secondPrompt.includes("The list couldn't be read."));
  assert.ok(!secondPrompt.includes(userId));
  assert.ok(!secondPrompt.includes("Failed query"));
  const logged = error.mock.calls.map((call) =>
    call.arguments.map(String).join(" "),
  );
  const toolError = logged.find((line) => line.includes("coach.tool.error"));
  assert.ok(toolError, logged.join("\n"));
  const entry = JSON.parse(toolError);
  assert.equal(entry.event, "coach.tool.error");
  assert.equal(entry.error, "Error");
  assert.equal(entry.code, "42P01");
  for (const secret of ["params", "select", "Failed query", userId]) {
    assert.ok(!toolError.includes(secret), secret);
  }
});

test("coachToolsContext lists every tool coachTools registers", () => {
  const userId = randomUUID();
  const registered = Object.keys(
    coachTools({ listOpenTasks: async () => [], ...unusedWrites }),
  ).sort();
  assert.deepEqual([...coachToolNames].sort(), registered);
  assert.deepEqual(
    Object.keys(coachToolsContext(userId, messageId)).sort(),
    registered,
  );
});

test("createTask passes Coach provenance with a resend-safe source id", async () => {
  const userId = randomUUID();
  const calls: unknown[] = [];
  const data: CoachData = {
    async listOpenTasks() {
      return [];
    },
    async createTask(uid, input, from) {
      calls.push({ uid, input, from });
      return { id: "task-1", name: input.name };
    },
    async completeTask() {
      throw new Error("completeTask should not run");
    },
  };
  const model = new MockLanguageModelV4({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          {
            type: "tool-call",
            toolCallId: "call_create",
            toolName: "createTask",
            input: JSON.stringify({ name: "Call dentist" }),
          },
          {
            type: "finish",
            finishReason: { unified: "tool-calls", raw: undefined },
            usage,
          },
        ],
      }),
    }),
  });
  const result = streamText({
    model,
    prompt: "Add call dentist",
    tools: coachTools(data) as ToolSet,
    toolsContext: coachToolsContext(userId, messageId) as never,
    onError: () => {},
  });
  const parts: { type: string; output?: unknown }[] = [];
  for await (const part of result.stream) parts.push(part as never);
  assert.deepEqual(calls, [
    {
      uid: userId,
      input: { name: "Call dentist" },
      from: {
        source: "coach",
        sourceId: coachCreateSourceId(messageId, "Call dentist"),
      },
    },
  ]);
  assert.ok(parts.some((p) => p.type === "tool-result"));
});

test("a createTask database error reaches the model as a fixed sentence", async () => {
  const userId = randomUUID();
  const data: CoachData = {
    async listOpenTasks() {
      return [];
    },
    async createTask() {
      throw new Error(`Failed query: insert … params: ${userId}`, {
        cause: { code: "23505" },
      });
    },
    async completeTask() {
      throw new Error("completeTask should not run");
    },
  };
  let step = 0;
  let secondPrompt = "";
  const model = new MockLanguageModelV4({
    doStream: async (options) => {
      step += 1;
      if (step === 1) {
        return {
          stream: simulateReadableStream({
            chunks: [
              {
                type: "tool-call",
                toolCallId: "call_1",
                toolName: "createTask",
                input: JSON.stringify({ name: "X" }),
              },
              {
                type: "finish",
                finishReason: { unified: "tool-calls", raw: undefined },
                usage,
              },
            ],
          }),
        };
      }
      secondPrompt = JSON.stringify(options.prompt);
      return {
        stream: simulateReadableStream({
          chunks: [
            { type: "text-start", id: "t" },
            { type: "text-delta", id: "t", delta: "ok" },
            { type: "text-end", id: "t" },
            {
              type: "finish",
              finishReason: { unified: "stop", raw: undefined },
              usage,
            },
          ],
        }),
      };
    },
  });
  const error = mock.method(console, "error", () => {});
  const result = streamText({
    model,
    prompt: "Add X",
    tools: coachTools(data) as ToolSet,
    toolsContext: coachToolsContext(userId, messageId) as never,
    stopWhen: ({ steps }) => steps.length >= 2,
    onError: () => {},
  });
  try {
    for await (const _ of result.stream);
  } finally {
    error.mock.restore();
  }
  assert.ok(secondPrompt.includes("Couldn't create that task."));
  assert.ok(!secondPrompt.includes(userId));
  assert.ok(!secondPrompt.includes("Failed query"));
  const logged = error.mock.calls.map((call) =>
    call.arguments.map(String).join(" "),
  );
  const toolError = logged.find((line) => line.includes("coach.tool.error"));
  assert.ok(toolError, logged.join("\n"));
  const entry = JSON.parse(toolError);
  assert.equal(entry.event, "coach.tool.error");
  assert.equal(entry.tool, "createTask");
  assert.equal(entry.error, "Error");
  assert.equal(entry.code, "23505");
  for (const secret of ["params", "insert", "Failed query", userId]) {
    assert.ok(!toolError.includes(secret), secret);
  }
});

test("a second completeTask in one tools instance is refused before data", async () => {
  const userId = randomUUID();
  const taskId = randomUUID();
  let completes = 0;
  const data: CoachData = {
    async listOpenTasks() {
      return [];
    },
    async createTask() {
      throw new Error("createTask should not run");
    },
    async completeTask() {
      completes += 1;
      return { id: taskId, name: "Done" };
    },
  };
  const tools = coachTools(data);
  const ctx = { context: { userId }, toolCallId: "c1" };
  const first = await tools.completeTask.execute!({ taskId }, ctx as never);
  assert.deepEqual(first, { id: taskId, name: "Done", next: null });
  let refused: unknown;
  try {
    await tools.completeTask.execute!({ taskId }, {
      context: { userId },
      toolCallId: "c2",
    } as never);
  } catch (error) {
    refused = error;
  }
  assert.match(String(refused), /only one Task per reply/);
  assert.equal(completes, 1);
});

test("a completeTask database error reaches the model as a fixed sentence", async () => {
  const userId = randomUUID();
  const data: CoachData = {
    async listOpenTasks() {
      return [];
    },
    async createTask() {
      throw new Error("createTask should not run");
    },
    async completeTask() {
      throw new Error(`Failed query: update … params: ${userId}`, {
        cause: { code: "57014" },
      });
    },
  };
  let step = 0;
  let secondPrompt = "";
  const taskId = randomUUID();
  const model = new MockLanguageModelV4({
    doStream: async (options) => {
      step += 1;
      if (step === 1) {
        return {
          stream: simulateReadableStream({
            chunks: [
              {
                type: "tool-call",
                toolCallId: "call_1",
                toolName: "completeTask",
                input: JSON.stringify({ taskId }),
              },
              {
                type: "finish",
                finishReason: { unified: "tool-calls", raw: undefined },
                usage,
              },
            ],
          }),
        };
      }
      secondPrompt = JSON.stringify(options.prompt);
      return {
        stream: simulateReadableStream({
          chunks: [
            { type: "text-start", id: "t" },
            { type: "text-delta", id: "t", delta: "ok" },
            { type: "text-end", id: "t" },
            {
              type: "finish",
              finishReason: { unified: "stop", raw: undefined },
              usage,
            },
          ],
        }),
      };
    },
  });
  const error = mock.method(console, "error", () => {});
  const result = streamText({
    model,
    prompt: "Complete it",
    tools: coachTools(data) as ToolSet,
    toolsContext: coachToolsContext(userId, messageId) as never,
    stopWhen: ({ steps }) => steps.length >= 2,
    onError: () => {},
  });
  try {
    for await (const _ of result.stream);
  } finally {
    error.mock.restore();
  }
  assert.ok(secondPrompt.includes("Couldn't complete that task."));
  assert.ok(!secondPrompt.includes(userId));
  assert.ok(!secondPrompt.includes("Failed query"));
  const logged = error.mock.calls.map((call) =>
    call.arguments.map(String).join(" "),
  );
  const toolError = logged.find((line) => line.includes("coach.tool.error"));
  assert.ok(toolError, logged.join("\n"));
  const entry = JSON.parse(toolError);
  assert.equal(entry.event, "coach.tool.error");
  assert.equal(entry.tool, "completeTask");
  assert.equal(entry.error, "Error");
  assert.equal(entry.code, "57014");
});
