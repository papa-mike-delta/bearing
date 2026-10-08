// The Coach's tools get the user id only from their typed context. No
// database, no Gateway, no key: a fake data interface and a scripted model.

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mock, test } from "node:test";
import type { CoachData } from "@repo/coach";
import { simulateReadableStream, streamText, type ToolSet } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import {
  coachToolNames,
  coachTools,
  coachToolsContext,
} from "./coach-tools.ts";

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
  const { asked, types } = await run(coachToolsContext(userId), someoneElse);
  assert.deepEqual(asked, [userId]);
  assert.ok(types.includes("tool-result"));
});

test("a tool call with no context, or no user id in it, fails and doesn't run", async () => {
  for (const context of [
    undefined,
    {},
    { listArea: {} },
    coachToolsContext("not-a-uuid"),
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
    toolsContext: coachToolsContext(userId) as never,
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
    coachTools({ listOpenTasks: async () => [] }),
  ).sort();
  assert.deepEqual([...coachToolNames].sort(), registered);
  assert.deepEqual(Object.keys(coachToolsContext(userId)).sort(), registered);
});
