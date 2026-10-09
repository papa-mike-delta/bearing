// Coach turns against a real Postgres with a scripted model: no Gateway, no
// key. Same guard as the isolation suite: needs TEST_POSTGRES_URL, fails in CI
// without it, and is skipped with a warning everywhere else.

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, mock, test } from "node:test";
import { coachMessages, createDb, tasks, users } from "@repo/db";
import {
  APICallError,
  convertToModelMessages,
  simulateReadableStream,
  type UIMessage,
} from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { eq, inArray } from "drizzle-orm";
import {
  coachCreateSourceId,
  maxCoachMessageLength,
  receipt,
} from "@repo/coach";
import { coachThread, saveMessage, threadMessages } from "./coach-threads.ts";
import {
  coachModel,
  coachTurn,
  historyWindow,
  maxReplyTokens,
} from "./coach-turn.ts";
import { coachTools } from "./coach-tools.ts";
import {
  addTask,
  changePriority,
  completeTask,
  createArea,
  openTasks,
} from "./tasks.ts";

function writeToolsOffered(
  call: {
    tools?: { name?: string }[];
    toolChoice?: unknown;
  },
  { last = false }: { last?: boolean } = {},
) {
  if (last) {
    assert.deepEqual(call.toolChoice, { type: "none" });
    return;
  }
  const names = (call.tools ?? []).map((t) => t.name);
  for (const name of ["createTask", "completeTask", "listArea"]) {
    assert.ok(names.includes(name), name);
  }
  assert.deepEqual(call.toolChoice, { type: "auto" });
}

const unusedWrites = {
  async createTask() {
    throw new Error("createTask should not run");
  },
  async completeTask() {
    throw new Error("completeTask should not run");
  },
};

const url = process.env.TEST_POSTGRES_URL;

test("the model comes from COACH_MODEL, defaulting to anthropic/claude-haiku-5.5", () => {
  const before = process.env.COACH_MODEL;
  try {
    delete process.env.COACH_MODEL;
    assert.equal(coachModel(), "anthropic/claude-haiku-5.5");
    process.env.COACH_MODEL = "openai/gpt-6-luna";
    assert.equal(coachModel(), "openai/gpt-6-luna");
  } finally {
    if (before === undefined) delete process.env.COACH_MODEL;
    else process.env.COACH_MODEL = before;
  }
});

if (!url && process.env.CI) {
  test("Coach turns run in CI", () => {
    assert.fail(
      "TEST_POSTGRES_URL is not set, so the Coach turn suite can't run",
    );
  });
} else if (!url) {
  console.warn(
    "\n!!! WARNING: Coach turn tests SKIPPED. Set TEST_POSTGRES_URL to run them (see README). !!!\n",
  );
}

const usage = {
  inputTokens: {
    total: 1,
    noCache: 1,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};

// A model that streams `reply` in words, slowly enough to stop mid-reply.
function replying(reply: string, chunkDelayInMs = 5) {
  return new MockLanguageModelV4({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunkDelayInMs,
        chunks: [
          { type: "text-start", id: "t" },
          ...reply.split(/(?= )/).map((delta) => ({
            type: "text-delta" as const,
            id: "t",
            delta,
          })),
          { type: "text-end", id: "t" },
          {
            type: "finish",
            finishReason: { unified: "stop", raw: undefined },
            usage,
          },
        ],
      }),
    }),
  });
}

const finish = {
  type: "finish" as const,
  finishReason: { unified: "stop" as const, raw: undefined },
  usage,
};

// A model that streams some text and then fails, either with an error part
// (the provider reports it) or with the stream itself erroring (a dropped
// connection).
function failingMidway(how: "error part" | "stream error") {
  return new MockLanguageModelV4({
    doStream: async () => ({
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue({ type: "text-start", id: "t" });
          controller.enqueue({ type: "text-delta", id: "t", delta: "Half a" });
          if (how === "stream error") {
            controller.error(new Error("Connection dropped"));
            return;
          }
          controller.enqueue({ type: "error", error: new Error("Failed") });
          controller.enqueue({ type: "text-end", id: "t" });
          controller.enqueue(finish);
          controller.close();
        },
      }),
    }),
  });
}

// A reasoning model that hits the token cap: some reasoning and maybe some
// text, then finishReason "length".
function cutOff(text?: string) {
  return new MockLanguageModelV4({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: "reasoning-start", id: "r" },
          { type: "reasoning-delta", id: "r", delta: "Thinking it over" },
          { type: "reasoning-end", id: "r" },
          ...(text
            ? [
                { type: "text-start" as const, id: "t" },
                { type: "text-delta" as const, id: "t", delta: text },
                { type: "text-end" as const, id: "t" },
              ]
            : []),
          {
            type: "finish",
            finishReason: { unified: "length", raw: undefined },
            usage,
          },
        ],
      }),
    }),
  });
}

// Everything the model was sent on its first step, as text: the
// instructions as they are, every other message as JSON.
const promptText = (model: MockLanguageModelV4) =>
  model.doStreamCalls[0]!.prompt.map((m) =>
    typeof m.content === "string" ? m.content : JSON.stringify(m.content),
  ).join("\n");

// How many times the prompt holds the person's messages.
const userTurnsIn = (model: MockLanguageModelV4) =>
  model.doStreamCalls[0]!.prompt.filter((m) => m.role === "user").length;

// A model that runs one scripted step per call: a tool call with `input`,
// or a text reply. Past the end of the script it repeats the last step.
type Step =
  | { listArea: string; toolCallId?: string }
  | { createTask: string; toolCallId?: string }
  | { completeTask: string; toolCallId?: string }
  | { text: string };
function scripted(...steps: Step[]) {
  let calls = 0;
  return new MockLanguageModelV4({
    doStream: async () => {
      const step = steps[Math.min(calls++, steps.length - 1)]!;
      const tool =
        "listArea" in step
          ? {
              name: "listArea" as const,
              input: step.listArea,
              id: step.toolCallId,
            }
          : "createTask" in step
            ? {
                name: "createTask" as const,
                input: step.createTask,
                id: step.toolCallId,
              }
            : "completeTask" in step
              ? {
                  name: "completeTask" as const,
                  input: step.completeTask,
                  id: step.toolCallId,
                }
              : null;
      const chunks = [
        ...(tool
          ? [
              {
                type: "tool-call" as const,
                toolCallId: tool.id ?? `call_${calls}`,
                toolName: tool.name,
                input: tool.input,
              },
            ]
          : [
              { type: "text-start" as const, id: "t" },
              {
                type: "text-delta" as const,
                id: "t",
                delta: (step as { text: string }).text,
              },
              { type: "text-end" as const, id: "t" },
            ]),
        {
          type: "finish" as const,
          finishReason: {
            unified: (tool ? "tool-calls" : "stop") as "tool-calls" | "stop",
            raw: undefined,
          },
          usage,
        },
      ];
      return { stream: simulateReadableStream({ chunks }) };
    },
  });
}

// The receipts a reloaded thread shows, in order.
const receiptsOf = (messages: UIMessage[] | null) =>
  messages?.flatMap((m) => m.parts.flatMap((p) => receipt(p) ?? []));

// The first listArea part saved on a reloaded thread: its turn's read.
const readIn = (messages: UIMessage[] | null) =>
  messages?.flatMap((m) => m.parts).find((p) => p.type === "tool-listArea") as
    | {
        toolCallId: string;
        output?: { open: number; tasks: { name: string; isNext: boolean }[] };
      }
    | undefined;
const listedIn = (messages: UIMessage[] | null) => readIn(messages)?.output;

const failing = () =>
  new MockLanguageModelV4({
    doStream: async () => {
      throw new Error("Gateway unavailable");
    },
  });

const userMessage = (text: string, id: string = randomUUID()): UIMessage => ({
  id,
  role: "user",
  parts: [{ type: "text", text }],
});

const textOf = (messages: UIMessage[] | null) =>
  messages?.map((m) => [
    m.role,
    m.parts.flatMap((p) => (p.type === "text" ? [p.text] : [])).join(""),
  ]);

describe("Coach turns", { skip: !url && "TEST_POSTGRES_URL not set" }, () => {
  const db = createDb(url!);
  const ids: string[] = [];
  let a = "";
  let b = "";

  async function account() {
    const [user] = await db
      .insert(users)
      .values({ email: `${randomUUID()}@test.invalid`, passwordHash: "-" })
      .returning({ id: users.id });
    ids.push(user!.id);
    await createArea(user!.id, db);
    return user!.id;
  }

  // Runs a turn the way the route does and reads the whole stream, like a
  // browser that stays open. Returns the chunks the browser got, and whether
  // the stream broke off with an error instead of ending.
  async function turn(
    userId: string,
    threadId: unknown,
    message: unknown,
    model: MockLanguageModelV4,
  ) {
    const result = await coachTurn({ userId, threadId, message, model, db });
    if ("refused" in result) return result;
    const chunks: { type: string }[] = [];
    const reader = result.stream.getReader();
    let broke = false;
    try {
      for (let r = await reader.read(); !r.done; r = await reader.read()) {
        chunks.push(r.value);
      }
    } catch {
      broke = true;
    }
    // The route hands this to after(), which logs a rejection.
    if (broke) await result.saved.catch(() => {});
    else await result.saved;
    return { chunks, broke };
  }

  // Adds Tasks as [name, priority] pairs, oldest first, the way the list
  // does, and returns their ids by name.
  async function addTasks(userId: string, list: [string, number][]) {
    const ids: Record<string, string> = {};
    for (const [name, priority] of list) {
      const { id } = (await addTask(userId, { name }, db))!;
      for (let i = 0; i < Math.abs(priority); i++) {
        await changePriority(userId, id, priority > 0 ? 1 : -1, db);
      }
      ids[name] = id;
    }
    return ids;
  }

  const rowOf = async (id: string) =>
    (await db.select().from(coachMessages).where(eq(coachMessages.id, id)))[0];

  before(async () => {
    a = await account();
    b = await account();
  });
  after(async () => {
    if (ids.length) await db.delete(users).where(inArray(users.id, ids));
    await db.$client.end();
  });

  test("a saved turn reloads, and the next turn sees the earlier ones", async () => {
    const c = await account();
    const thread = await coachThread(c, db);
    assert.deepEqual(await threadMessages(c, thread, db), []);
    await turn(c, thread, userMessage("Hi"), replying("Hello there."));
    assert.equal(await coachThread(c, db), thread);
    assert.deepEqual(textOf(await threadMessages(c, thread, db)), [
      ["user", "Hi"],
      ["assistant", "Hello there."],
    ]);
    const model = replying("Try the dentist first.");
    await turn(c, thread, userMessage("What next?"), model);
    assert.deepEqual(textOf(await threadMessages(c, thread, db)), [
      ["user", "Hi"],
      ["assistant", "Hello there."],
      ["user", "What next?"],
      ["assistant", "Try the dentist first."],
    ]);
    const prompt = JSON.stringify(model.doStreamCalls[0]!.prompt);
    assert.ok(prompt.includes("Hi") && prompt.includes("Hello there."));
  });

  test("the reply is saved even when the browser stops reading", async () => {
    const thread = await coachThread(a, db);
    const before = (await threadMessages(a, thread, db))!.length;
    const result = await coachTurn({
      userId: a,
      threadId: thread,
      message: userMessage("Closing the tab"),
      model: replying("This reply keeps going after the tab closes."),
      db,
    });
    assert.ok(!("refused" in result));
    const reader = result.stream.getReader();
    await reader.read();
    await reader.cancel();
    await result.saved;
    const saved = textOf(await threadMessages(a, thread, db))!.slice(before);
    assert.deepEqual(saved, [
      ["user", "Closing the tab"],
      ["assistant", "This reply keeps going after the tab closes."],
    ]);
  });

  test("the Gateway gets the fallback model, the user id, and the coach tag", async () => {
    const model = replying("Ok.");
    await turn(a, await coachThread(a, db), userMessage("Tagged"), model);
    assert.deepEqual(model.doStreamCalls[0]!.providerOptions?.gateway, {
      models: ["openai/gpt-6-luna"],
      user: a,
      tags: ["coach"],
    });
    assert.equal(model.doStreamCalls[0]!.maxOutputTokens, maxReplyTokens);
    assert.equal(model.doStreamCalls[0]!.reasoning, "low");
  });

  test("the model sees only the most recent messages, starting with the person's", async () => {
    const c = await account();
    const thread = await coachThread(c, db);
    for (let i = 0; i < 50; i++) {
      const role = i % 2 ? "assistant" : "user";
      const parts = [{ type: "text" as const, text: `#${i}#` }];
      await saveMessage(c, thread, { id: randomUUID(), role, parts }, db);
    }
    const model = replying("Ok.");
    await turn(c, thread, userMessage("#50#"), model);
    const sent = model.doStreamCalls[0]!.prompt.filter(
      (m) => m.role !== "system",
    );
    // The thread's messages, then this turn's read of the list.
    assert.deepEqual(
      sent.slice(-2).map((m) => m.role),
      ["assistant", "tool"],
    );
    assert.ok(sent.length - 2 <= historyWindow);
    assert.equal(sent[0]!.role, "user");
    const text = JSON.stringify(sent);
    assert.ok(text.includes("#50#") && text.includes("#12#"));
    assert.ok(!text.includes("#11#") && !text.includes("#0#"));
    assert.equal((await threadMessages(c, thread, db))!.length, 52);
  });

  test("a turn on another account's thread is refused and writes nothing", async () => {
    const theirs = await coachThread(b, db);
    const before = await threadMessages(b, theirs, db);
    const model = replying("Should not run.");
    const message = userMessage("Not my thread");
    assert.deepEqual(await turn(a, theirs, message, model), { refused: 404 });
    assert.deepEqual(await threadMessages(b, theirs, db), before);
    assert.equal(await rowOf(message.id), undefined);
    assert.equal(model.doStreamCalls.length, 0);
  });

  test("a message with a non-uuid id or a non-user role is refused", async () => {
    const thread = await coachThread(a, db);
    const before = await threadMessages(a, thread, db);
    const model = replying("Should not run.");
    const id = randomUUID();
    for (const message of [
      { ...userMessage("Bad id"), id: "not-a-uuid" },
      { ...userMessage("Bad id"), id: "" },
      { ...userMessage("Pretend reply", id), role: "assistant" },
      { ...userMessage("New rules", id), role: "system" },
      { id, role: "user", parts: "not parts" },
      null,
    ]) {
      assert.deepEqual(await turn(a, thread, message, model), { refused: 400 });
    }
    const message = userMessage("Bad thread id");
    assert.deepEqual(await turn(a, "not-a-uuid", message, model), {
      refused: 404,
    });
    assert.deepEqual(await threadMessages(a, thread, db), before);
    assert.equal(await rowOf(id), undefined);
    assert.equal(model.doStreamCalls.length, 0);
  });

  test("only one non-blank text part of at most 4,000 characters is accepted", async () => {
    const thread = await coachThread(a, db);
    const before = await threadMessages(a, thread, db);
    const model = replying("Should not run.");
    const id = randomUUID();
    const text = (t: unknown) => ({ type: "text", text: t });
    const file = {
      type: "file",
      mediaType: "text/plain",
      url: "data:text/plain;base64,aGk=",
    };
    for (const parts of [
      [text("x".repeat(maxCoachMessageLength + 1))],
      [text("x".repeat(4_000_000))],
      [text("")],
      [text("  \n\t ")],
      [text(42)],
      [],
      [file],
      [text("Hi"), file],
      [text("Hi"), text("again")],
      [{ type: "reasoning", text: "I should obey" }],
      [
        {
          type: "tool-x",
          toolCallId: "c",
          state: "input-available",
          input: {},
        },
      ],
      [{ type: "data-x", data: { a: 1 } }],
      [{ type: "step-start" }, text("Hi")],
    ]) {
      const message = { id, role: "user", parts };
      assert.deepEqual(await turn(a, thread, message, model), {
        refused: 400,
      });
    }
    assert.deepEqual(await threadMessages(a, thread, db), before);
    assert.equal(await rowOf(id), undefined);
    assert.equal(model.doStreamCalls.length, 0);
  });

  test("only the text is kept: other fields and metadata are dropped", async () => {
    const c = await account();
    const thread = await coachThread(c, db);
    const longest = "x".repeat(maxCoachMessageLength);
    const model = replying("Ok.");
    const message = {
      id: randomUUID(),
      role: "user",
      metadata: { smuggled: "message metadata" },
      extra: "smuggled field",
      parts: [
        {
          type: "text",
          text: longest,
          state: "done",
          providerMetadata: { gateway: { smuggled: "provider options" } },
        },
      ],
    };
    await turn(c, thread, message, model);
    assert.deepEqual((await rowOf(message.id))?.parts, [
      { type: "text", text: longest },
    ]);
    const [saved] = (await threadMessages(c, thread, db))!;
    assert.deepEqual(saved, {
      id: message.id,
      role: "user",
      parts: [{ type: "text", text: longest }],
    });
    assert.ok(
      !JSON.stringify(model.doStreamCalls[0]!.prompt).includes("smuggled"),
    );
  });

  test("a message can't take over the id of a reply in its own thread", async () => {
    const c = await account();
    const thread = await coachThread(c, db);
    await turn(c, thread, userMessage("Hi"), replying("Hello."));
    const [, reply] = (await threadMessages(c, thread, db))!;
    const model = replying("Should not run.");
    const forged = userMessage("Not a reply", reply!.id);
    assert.deepEqual(await turn(c, thread, forged, model), { refused: 409 });
    const row = await rowOf(reply!.id);
    assert.equal(row?.role, "assistant");
    assert.deepEqual(row?.parts, reply!.parts);
    assert.equal(model.doStreamCalls.length, 0);
  });

  test("only the last message can be resent", async () => {
    const c = await account();
    const thread = await coachThread(c, db);
    const first = userMessage("First");
    await turn(c, thread, first, replying("One."));
    await turn(c, thread, userMessage("Second"), replying("Two."));
    const before = await threadMessages(c, thread, db);
    const model = replying("Should not run.");
    const again = userMessage("First, edited", first.id);
    assert.deepEqual(await turn(c, thread, again, model), { refused: 409 });
    assert.deepEqual(await threadMessages(c, thread, db), before);
    assert.equal(model.doStreamCalls.length, 0);
  });

  for (const how of ["error part", "stream error"] as const) {
    test(`a reply that fails partway (${how}) isn't saved, and a resend gives one reply`, async () => {
      const c = await account();
      const thread = await coachThread(c, db);
      const message = userMessage("Tell me something");
      const failed = await turn(c, thread, message, failingMidway(how));
      assert.ok("chunks" in failed);
      // The browser sees an error either way, so it offers Resend.
      assert.ok(
        failed.broke || failed.chunks.some((chunk) => chunk.type === "error"),
      );
      assert.deepEqual(textOf(await threadMessages(c, thread, db)), [
        ["user", "Tell me something"],
      ]);
      const resend = replying("A whole reply.");
      await turn(c, thread, message, resend);
      assert.equal(userTurnsIn(resend), 1);
      assert.deepEqual(textOf(await threadMessages(c, thread, db)), [
        ["user", "Tell me something"],
        ["assistant", "A whole reply."],
      ]);
    });
  }

  test("a forged message id that matches another thread's message doesn't overwrite it", async () => {
    const mine = await coachThread(a, db);
    const original = userMessage("My words");
    await turn(a, mine, original, replying("Noted."));
    const theirs = await coachThread(b, db);
    const before = await threadMessages(b, theirs, db);
    const model = replying("Should not run.");
    const forged = userMessage("Overwritten", original.id);
    assert.deepEqual(await turn(b, theirs, forged, model), { refused: 409 });
    assert.deepEqual((await rowOf(original.id))?.parts, original.parts);
    assert.equal((await rowOf(original.id))?.threadId, mine);
    assert.deepEqual(await threadMessages(b, theirs, db), before);
    assert.equal(model.doStreamCalls.length, 0);
  });

  test("a failed turn keeps the message, saves no reply, and can be resent", async () => {
    const c = await account();
    const thread = await coachThread(c, db);
    const message = userMessage("Are you there?");
    const failed = await turn(c, thread, message, failing());
    assert.ok("chunks" in failed);
    assert.ok(failed.chunks.some((chunk) => chunk.type === "error"));
    assert.deepEqual(textOf(await threadMessages(c, thread, db)), [
      ["user", "Are you there?"],
    ]);
    const resend = replying("Yes.");
    await turn(c, thread, message, resend);
    assert.equal(userTurnsIn(resend), 1);
    assert.deepEqual(textOf(await threadMessages(c, thread, db)), [
      ["user", "Are you there?"],
      ["assistant", "Yes."],
    ]);
  });

  test("a reply stopped before the first token is still saved in full", async () => {
    const c = await account();
    const thread = await coachThread(c, db);
    const result = await coachTurn({
      userId: c,
      threadId: thread,
      message: userMessage("Stop now"),
      model: replying("The whole reply, written after Stop."),
      db,
    });
    assert.ok(!("refused" in result));
    const reader = result.stream.getReader();
    // Before any token. Not awaited: a tee branch's cancel waits for the
    // source to end, and the other branch is what saves the reply.
    void reader.cancel();
    await result.saved;
    assert.deepEqual(textOf(await threadMessages(c, thread, db)), [
      ["user", "Stop now"],
      ["assistant", "The whole reply, written after Stop."],
    ]);
  });

  test("a reply stopped in the browser still reloads before the next message", async () => {
    const c = await account();
    const thread = await coachThread(c, db);
    const first = await coachTurn({
      userId: c,
      threadId: thread,
      message: userMessage("First"),
      model: replying("Slow first answer that keeps going", 60),
      db,
    });
    assert.ok(!("refused" in first));
    const reader = first.stream.getReader();
    await reader.read();
    // Stop. Not awaited: a tee branch's cancel waits for the source to end.
    void reader.cancel();
    await turn(c, thread, userMessage("Second"), replying("Second answer."));
    await first.saved;
    assert.deepEqual(textOf(await threadMessages(c, thread, db)), [
      ["user", "First"],
      ["assistant", "Slow first answer that keeps going"],
      ["user", "Second"],
      ["assistant", "Second answer."],
    ]);
  });

  test("a reply can't borrow the place of a message in another thread", async () => {
    const theirs = await coachThread(b, db);
    const early = userMessage("Their early message");
    await saveMessage(b, theirs, early, db);
    await new Promise((resolve) => setTimeout(resolve, 20));
    const c = await account();
    const mine = await coachThread(c, db);
    await turn(c, mine, userMessage("Mine"), replying("Reply."));
    const reply = { id: randomUUID(), role: "assistant" as const, parts: [] };
    await saveMessage(c, mine, reply, db, early.id);
    // Saved at now(), not just after their message.
    assert.deepEqual(textOf(await threadMessages(c, mine, db)), [
      ["user", "Mine"],
      ["assistant", "Reply."],
      ["assistant", ""],
    ]);
  });

  test("a reply cut off by the token cap before any text isn't saved, and can be resent", async () => {
    const c = await account();
    const thread = await coachThread(c, db);
    const message = userMessage("Plan my week");
    const failed = await turn(c, thread, message, cutOff());
    assert.ok("chunks" in failed);
    assert.ok(failed.chunks.some((chunk) => chunk.type === "error"));
    assert.ok(
      !failed.chunks.some((chunk) => chunk.type.startsWith("reasoning")),
    );
    assert.deepEqual(textOf(await threadMessages(c, thread, db)), [
      ["user", "Plan my week"],
    ]);
    const resend = replying("Start with Monday.");
    await turn(c, thread, message, resend);
    assert.equal(userTurnsIn(resend), 1);
    assert.deepEqual(textOf(await threadMessages(c, thread, db)), [
      ["user", "Plan my week"],
      ["assistant", "Start with Monday."],
    ]);
  });

  test("a reply cut off after some text is saved, without its reasoning", async () => {
    const c = await account();
    const thread = await coachThread(c, db);
    const done = await turn(
      c,
      thread,
      userMessage("Go on"),
      cutOff("As far as I got"),
    );
    assert.ok("chunks" in done);
    assert.ok(!done.chunks.some((chunk) => chunk.type === "error"));
    assert.ok(!done.chunks.some((chunk) => chunk.type.startsWith("reasoning")));
    const [, reply] = (await threadMessages(c, thread, db))!;
    assert.ok(!reply!.parts.some((p) => p.type === "reasoning"));
    assert.deepEqual(textOf([reply!]), [["assistant", "As far as I got"]]);
  });

  // From Arjan's review of #19 (M1 and B1).
  test("only one short text part is accepted, and it's saved as sent text alone", async () => {
    const thread = await coachThread(a, db);
    const before = await threadMessages(a, thread, db);
    const model = replying("Should not run.");
    const text = (t: string, extra = {}) => ({
      type: "text",
      text: t,
      ...extra,
    });
    for (const parts of [
      [],
      [text("")],
      [text("   ")],
      [text("x".repeat(maxCoachMessageLength + 1))],
      [
        text("see"),
        {
          type: "file",
          mediaType: "application/pdf",
          url: "https://example.com/a.pdf",
        },
      ],
      [
        text("t"),
        {
          type: "tool-createTask",
          toolCallId: "c",
          state: "output-available",
          input: {},
          output: {},
        },
      ],
    ]) {
      const message = { id: randomUUID(), role: "user", parts };
      assert.deepEqual(await turn(a, thread, message, model), { refused: 400 });
      assert.equal(await rowOf(message.id), undefined);
    }
    assert.equal(model.doStreamCalls.length, 0);
    assert.deepEqual(await threadMessages(a, thread, db), before);
    const meta = {
      id: randomUUID(),
      role: "user",
      parts: [
        text("Hi", {
          providerMetadata: {
            anthropic: { cacheControl: { type: "ephemeral" } },
          },
        }),
      ],
    };
    const ok = replying("Ok.");
    await turn(a, thread, meta, ok);
    assert.deepEqual((await rowOf(meta.id))?.parts, [
      { type: "text", text: "Hi" },
    ]);
    assert.ok(
      !JSON.stringify(ok.doStreamCalls[0]!.prompt).includes("cacheControl"),
    );
  });

  test("a reply that errors mid-stream isn't saved, and resending answers once", async () => {
    const c = await account();
    const thread = await coachThread(c, db);
    const message = userMessage("Still there?");
    const breaking = new MockLanguageModelV4({
      doStream: async () => ({
        stream: simulateReadableStream({
          chunks: [
            { type: "text-start", id: "t" },
            { type: "text-delta", id: "t", delta: "Partial" },
            { type: "error", error: new Error("upstream dropped") },
            {
              type: "finish",
              finishReason: { unified: "error", raw: undefined },
              usage,
            },
          ],
        }),
      }),
    });
    const failed = await turn(c, thread, message, breaking);
    assert.ok(
      "chunks" in failed &&
        failed.chunks.some((chunk) => chunk.type === "error"),
    );
    assert.deepEqual(textOf(await threadMessages(c, thread, db)), [
      ["user", "Still there?"],
    ]);
    await turn(c, thread, message, replying("Yes."));
    assert.deepEqual(textOf(await threadMessages(c, thread, db)), [
      ["user", "Still there?"],
      ["assistant", "Yes."],
    ]);
  });
  test("every turn reads the list once before the model answers, in Priority List order with Next marked", async () => {
    const c = await account();
    const d = await account();
    const ids = await addTasks(c, [
      ["Old normal", 0],
      ["Low", -1],
      ["Done", 2],
      ["High", 1],
      ["New normal", 0],
    ]);
    await completeTask(c, ids.Done!, db);
    await addTasks(d, [["Someone else's", 2]]);
    const thread = await coachThread(c, db);
    // The model never calls the tool itself.
    const model = replying("Do High first.");
    await turn(c, thread, userMessage("What should I do next?"), model);
    const reloaded = await threadMessages(c, thread, db);
    assert.deepEqual(
      listedIn(reloaded)?.tasks.map((t) => [t.name, t.isNext]),
      [
        ["High", true],
        ["Old normal", false],
        ["New normal", false],
        ["Low", false],
      ],
    );
    assert.deepEqual(receiptsOf(reloaded), ["Read your list (4 open)"]);
    // OpenAI (the fallback) refuses tool-call ids over 40 characters.
    const { toolCallId } = readIn(reloaded)!;
    assert.ok(toolCallId.length <= 40, toolCallId);
    assert.deepEqual(textOf(reloaded), [
      ["user", "What should I do next?"],
      ["assistant", "Do High first."],
    ]);
    // The model's one step already had the list, and nothing of d's.
    assert.equal(model.doStreamCalls.length, 1);
    const prompt = promptText(model);
    assert.ok(prompt.includes('"open":4') && prompt.includes("High"));
    assert.ok(!prompt.includes("Someone else"));
  });

  test("an old thread reaches the model as alternating text, then this turn's read", async () => {
    const c = await account();
    const thread = await coachThread(c, db);
    const listed = (open: number) => ({
      open,
      tasks: open
        ? [{ id: randomUUID(), name: "Alpha", priority: 0, isNext: true }]
        : [],
    });
    const read = (toolCallId: string, open: number) => ({
      type: "tool-listArea" as const,
      toolCallId,
      state: "output-available" as const,
      input: {},
      output: listed(open),
    });
    const step = { type: "step-start" as const };
    const text = (t: string) => ({
      type: "text" as const,
      text: t,
      state: "done" as const,
    });
    // Saved as earlier heads saved them.
    const old: UIMessage["parts"][] = [
      // Before #20: text only.
      [text("Hi")],
      [step, text("Hello. What's on your mind?")],
      // 80210aa: the model read the list, then answered.
      [text("What should I do next?")],
      [step, read("toolu_a", 1), step, text("Do Alpha first.")],
      // 7caee41: two reads in one reply, and an empty text part.
      [text("What's on my list?")],
      [step, read("toolu_b", 1), step, read("toolu_c", 1), step, text("")],
      // Receipts only: a refused read.
      [text("Again?")],
      [
        step,
        {
          type: "tool-listArea",
          toolCallId: "toolu_d",
          state: "output-error",
          input: ["not", "an", "object"],
          errorText: "Invalid input",
        },
      ],
      // Text around a read in one reply.
      [text("And then?")],
      [step, text("Let me look."), read("toolu_e", 1), step, text("Alpha.")],
      // Two assistant replies in a row (the user message between them never
      // saved): textOnly must join them, not leave consecutive assistants.
      [text("Say more")],
      [step, text("First answer.")],
      [step, text("Second answer.")],
      // A message whose reply failed, so the next one follows it.
      [text("Lost reply")],
    ];
    for (const parts of old) {
      const role = parts.some((p) => p.type === "step-start")
        ? "assistant"
        : "user";
      await saveMessage(c, thread, { id: randomUUID(), role, parts }, db);
    }
    const model = replying("Your list is empty.");
    const done = await turn(
      c,
      thread,
      userMessage("What's on my list now?"),
      model,
    );
    assert.ok("chunks" in done && !done.broke);

    const sent = model.doStreamCalls[0]!.prompt.filter(
      (m) => m.role !== "system",
    );
    const history = sent.slice(0, -2);
    // Alternating, from the person, ending with the person.
    assert.deepEqual(
      history.map((m) => m.role),
      [
        "user",
        "assistant",
        "user",
        "assistant",
        "user",
        "assistant",
        "user",
        "assistant",
        "user",
      ],
    );
    for (const m of history) {
      assert.ok(
        Array.isArray(m.content) && m.content.length,
        JSON.stringify(m),
      );
      for (const part of m.content as { type: string; text?: string }[]) {
        assert.equal(part.type, "text", JSON.stringify(m));
        assert.ok(part.text?.trim(), JSON.stringify(m));
      }
    }
    // Consecutive assistant replies were joined into one turn.
    assert.deepEqual(
      (history.at(-2)!.content as { text: string }[]).map((p) => p.text),
      ["First answer.", "Second answer."],
    );
    // The failed reply's message and the new one are one turn of the person's.
    assert.deepEqual(
      (history.at(-1)!.content as { text: string }[]).map((p) => p.text),
      ["Lost reply", "What's on my list now?"],
    );
    // Then this turn's read: one listArea call and its result, nothing older.
    const [call, result] = sent.slice(-2);
    assert.equal(call!.role, "assistant");
    assert.equal(result!.role, "tool");
    const tail = JSON.stringify([call, result]);
    // The model is told what the read is; the saved receipt isn't (see "an
    // empty list is read as empty").
    assert.ok(tail.includes(`"note":"The person's list right now."`), tail);
    assert.ok(
      tail.includes('"toolCallId":"read_') && tail.includes('"open":0'),
    );
    assert.ok(!JSON.stringify(history).includes("toolu_"));
    writeToolsOffered(model.doStreamCalls[0]!);
  });

  test("a failed turn logs one coach.turn.error line with the provider's message and status, and nothing private", async () => {
    const c = await account();
    const thread = await coachThread(c, db);
    const model = new MockLanguageModelV4({
      doStream: async () => {
        throw new APICallError({
          message: `${"x".repeat(350)}: Expected thinking`,
          url: "https://ai-gateway.vercel.sh/v3/ai/language-model",
          requestBodyValues: { secret: "What's on my list?" },
          statusCode: 400,
          isRetryable: false,
        });
      },
    });
    const error = mock.method(console, "error", () => {});
    try {
      await turn(c, thread, userMessage("What's on my list?"), model);
    } finally {
      error.mock.restore();
    }
    const lines = error.mock.calls.map((call) =>
      call.arguments.map(String).join(" "),
    );
    assert.deepEqual(
      lines.map((line) => JSON.parse(line)),
      [
        {
          event: "coach.turn.error",
          threadId: thread,
          model: "mock-model-id",
          error: "AI_APICallError",
          message: `${"x".repeat(350)}: Expected thinking`.slice(0, 300),
          status: 400,
        },
      ],
    );
    assert.equal(JSON.parse(lines[0]!).message.length, 300);
    for (const secret of [c, "What's on my list?"]) {
      assert.ok(!lines[0]!.includes(secret), secret);
    }
  });

  test("a failed read writes nothing and doesn't run the model", async () => {
    const c = await account();
    const thread = await coachThread(c, db);
    const model = replying("Should not run.");
    const message = userMessage("What's on my list?");
    const data = {
      listOpenTasks: () => Promise.reject(new Error("database down")),
      ...unusedWrites,
    };
    const error = mock.method(console, "error", () => {});
    try {
      await assert.rejects(
        coachTurn({ userId: c, threadId: thread, message, model, db, data }),
        /The list couldn't be read\./,
      );
    } finally {
      error.mock.restore();
    }
    const logged = error.mock.calls.map((call) =>
      call.arguments.map(String).join(" "),
    );
    assert.ok(
      logged.some((line) => {
        try {
          const entry = JSON.parse(line);
          return entry.event === "coach.tool.error" && entry.error === "Error";
        } catch {
          return false;
        }
      }),
      logged.join("\n"),
    );
    assert.ok(!logged.join("\n").includes("database down"));
    assert.equal(model.doStreamCalls.length, 0);
    assert.equal(await rowOf(message.id), undefined);
  });

  test("an empty list is read as empty", async () => {
    const c = await account();
    const thread = await coachThread(c, db);
    await turn(
      c,
      thread,
      userMessage("What's on my list?"),
      replying("Your list is empty."),
    );
    const reloaded = await threadMessages(c, thread, db);
    assert.deepEqual(listedIn(reloaded), { open: 0, tasks: [] });
    assert.deepEqual(receiptsOf(reloaded), ["Read your list (0 open)"]);
  });

  test("after the list is emptied, the next turn answers from a fresh read, not the earlier one", async () => {
    const c = await account();
    const ids = await addTasks(c, [
      ["Alpha", 0],
      ["Beta", 0],
      ["Gamma", 0],
    ]);
    const thread = await coachThread(c, db);
    await turn(
      c,
      thread,
      userMessage("What's on my list?"),
      replying("Three."),
    );
    for (const id of Object.values(ids)) await completeTask(c, id, db);
    for (let i = 0; i < 3; i++) {
      const model = replying("It's empty.");
      await turn(c, thread, userMessage("What's on my list?"), model);
      const prompt = promptText(model);
      assert.ok(prompt.includes('"open":0'), "the fresh read");
      assert.ok(!prompt.includes('"open":3'), "no earlier read");
      assert.ok(!prompt.includes("Alpha"), "no completed Task");
    }
    assert.deepEqual(receiptsOf(await threadMessages(c, thread, db)), [
      "Read your list (3 open)",
      "Read your list (0 open)",
      "Read your list (0 open)",
      "Read your list (0 open)",
    ]);
  });

  test("write tools stay offered, and the loop still stops after 8 model steps", async () => {
    const c = await account();
    await addTasks(c, [["One", 0]]);
    const thread = await coachThread(c, db);
    // A model that calls the tool anyway, every step.
    const model = scripted({ listArea: "{}" });
    await turn(c, thread, userMessage("Keep reading my list"), model);
    assert.equal(model.doStreamCalls.length, 8);
    const calls = model.doStreamCalls;
    for (const [i, call] of calls.entries()) {
      writeToolsOffered(call, { last: i === calls.length - 1 });
    }
    assert.deepEqual(
      receiptsOf(await threadMessages(c, thread, db)),
      Array(9).fill("Read your list (1 open)"),
    );
  });

  test("a tool call the model gets wrong is saved as a refused receipt", async () => {
    const c = await account();
    const thread = await coachThread(c, db);
    const model = scripted(
      { listArea: JSON.stringify(["not", "an", "object"]) },
      { text: "I couldn't read that." },
    );
    const done = await turn(c, thread, userMessage("What's next?"), model);
    assert.ok("chunks" in done && !done.broke);
    const reloaded = await threadMessages(c, thread, db);
    assert.deepEqual(receiptsOf(reloaded), [
      "Read your list (0 open)",
      "Couldn't read your list",
    ]);
    assert.deepEqual(textOf(reloaded)?.at(-1), [
      "assistant",
      "I couldn't read that.",
    ]);
    // The thread still takes the next turn.
    await turn(c, thread, userMessage("Try again"), replying("Ok."));
    assert.equal((await threadMessages(c, thread, db))!.length, 4);
  });

  test("a saved tool part that doesn't fit its tool still gets a reply", async () => {
    const c = await account();
    const thread = await coachThread(c, db);
    await saveMessage(c, thread, userMessage("Earlier"), db);
    await saveMessage(
      c,
      thread,
      {
        id: randomUUID(),
        role: "assistant",
        parts: [
          {
            type: "tool-listArea",
            toolCallId: "call_x",
            state: "output-available",
            // listArea's input is {}, so a string fails validation.
            input: "everyone's tasks",
            output: { open: 0, tasks: [] },
          },
          {
            type: "text",
            text: "I looked.",
            state: "done",
          },
        ],
      },
      db,
    );
    const model = replying("Still here.");
    const error = mock.method(console, "error", () => {});
    let done;
    try {
      done = await turn(c, thread, userMessage("Next?"), model);
    } finally {
      error.mock.restore();
    }
    assert.ok("chunks" in done && !done.broke);
    assert.equal(model.doStreamCalls.length, 1);
    const logged = error.mock.calls.map((call) =>
      call.arguments.map(String).join(" "),
    );
    const invalid = logged.flatMap((line) => {
      try {
        const entry = JSON.parse(line);
        return entry.event === "coach.history.invalid" ? [entry] : [];
      } catch {
        return [];
      }
    });
    assert.equal(invalid.length, 1, logged.join("\n"));
    assert.equal(invalid[0].error, "AI_TypeValidationError");
    assert.match(invalid[0].message, /messages\[/);
    assert.ok(!invalid[0].message.includes("Value:"));
    assert.ok(!logged.join("\n").includes("everyone's tasks"));
    // The bad tool part is out of the model's view; the earlier text remains.
    const history = model.doStreamCalls[0]!.prompt.filter(
      (m) => m.role !== "system",
    );
    assert.ok(!JSON.stringify(history).includes("everyone's tasks"));
    assert.ok(JSON.stringify(history).includes("I looked."));
    assert.deepEqual(textOf(await threadMessages(c, thread, db))?.at(-1), [
      "assistant",
      "Still here.",
    ]);
  });

  test("createTask adds a Task with Coach provenance from the message id", async () => {
    const c = await account();
    const thread = await coachThread(c, db);
    const message = userMessage("Add call dentist");
    const model = scripted(
      {
        createTask: JSON.stringify({ name: "Call dentist" }),
        toolCallId: "call_create_1",
      },
      { text: "Added." },
    );
    await turn(c, thread, message, model);
    const open = await openTasks(c, db);
    assert.equal(open.length, 1);
    assert.equal(open[0]!.name, "Call dentist");
    const [row] = await db
      .select({ source: tasks.source, sourceId: tasks.sourceId })
      .from(tasks)
      .where(eq(tasks.id, open[0]!.id));
    assert.deepEqual(row, {
      source: "coach",
      sourceId: coachCreateSourceId(message.id, "Call dentist"),
    });
    const reloaded = await threadMessages(c, thread, db);
    assert.deepEqual(receiptsOf(reloaded), [
      "Read your list (0 open)",
      "Created task 'Call dentist'",
    ]);
    const createPart = reloaded!
      .flatMap((m) => m.parts)
      .find((p) => p.type === "tool-createTask") as {
      output?: { id?: string; name?: string };
    };
    assert.equal(createPart?.output?.id, open[0]!.id);
    assert.equal(createPart?.output?.name, "Call dentist");
  });

  test("two messages that create the same name each add a Task", async () => {
    // Provenance is message id + name, not the tool-call id: a second ask
    // is a new Task. Same-message resend is covered separately.
    const c = await account();
    const thread = await coachThread(c, db);
    const input = {
      createTask: JSON.stringify({ name: "Same" }),
      toolCallId: "call_same",
    };
    await turn(
      c,
      thread,
      userMessage("Add same"),
      scripted(input, { text: "Ok." }),
    );
    await turn(
      c,
      thread,
      userMessage("Add same again"),
      scripted(input, { text: "Still ok." }),
    );
    assert.equal((await openTasks(c, db)).length, 2);
    assert.deepEqual(receiptsOf(await threadMessages(c, thread, db)), [
      "Read your list (0 open)",
      "Created task 'Same'",
      "Read your list (1 open)",
      "Created task 'Same'",
    ]);
  });

  test("a refused createTask name adds nothing and shows a refused receipt", async () => {
    const c = await account();
    const thread = await coachThread(c, db);
    await turn(
      c,
      thread,
      userMessage("Add blank"),
      scripted(
        { createTask: JSON.stringify({ name: "   " }), toolCallId: "call_bad" },
        { text: "Couldn't." },
      ),
    );
    assert.equal((await openTasks(c, db)).length, 0);
    assert.deepEqual(receiptsOf(await threadMessages(c, thread, db)), [
      "Read your list (0 open)",
      "Couldn't create that task",
    ]);
  });

  test("a fourth parallel createTask in one step is refused by the per-turn cap", async () => {
    const c = await account();
    const thread = await coachThread(c, db);
    const names = ["One", "Two", "Three", "Four"];
    // Local step counter: MockLanguageModelV4 records doStreamCalls before
    // doStream runs, so length === 0 is never true inside the handler.
    let step = 0;
    const model = new MockLanguageModelV4({
      doStream: async () => {
        step += 1;
        // First call: four createTask tool calls in one step.
        if (step === 1) {
          return {
            stream: simulateReadableStream({
              chunks: [
                ...names.map((name, i) => ({
                  type: "tool-call" as const,
                  toolCallId: `call_${i}`,
                  toolName: "createTask",
                  input: JSON.stringify({ name }),
                })),
                {
                  type: "finish" as const,
                  finishReason: {
                    unified: "tool-calls" as const,
                    raw: undefined,
                  },
                  usage,
                },
              ],
            }),
          };
        }
        return {
          stream: simulateReadableStream({
            chunks: [
              { type: "text-start" as const, id: "t" },
              { type: "text-delta" as const, id: "t", delta: "Capped." },
              { type: "text-end" as const, id: "t" },
              {
                type: "finish" as const,
                finishReason: { unified: "stop" as const, raw: undefined },
                usage,
              },
            ],
          }),
        };
      },
    });
    await turn(c, thread, userMessage("Add four"), model);
    const open = (await openTasks(c, db)).map((t) => t.name).sort();
    assert.deepEqual(open, ["One", "Three", "Two"]);
    const receipts = receiptsOf(await threadMessages(c, thread, db))!;
    assert.equal(
      receipts.filter((r) => r.startsWith("Created task")).length,
      3,
    );
    assert.ok(receipts.includes("Couldn't create that task"));
  });

  test("completeTask completes the person's Task and moves Next when needed", async () => {
    const c = await account();
    const ids = await addTasks(c, [
      ["First", 2],
      ["Second", 0],
    ]);
    // Highest priority is Next.
    const thread = await coachThread(c, db);
    await turn(
      c,
      thread,
      userMessage("Complete first"),
      scripted(
        {
          completeTask: JSON.stringify({ taskId: ids.First }),
          toolCallId: "call_done",
        },
        { text: "Done." },
      ),
    );
    const open = await openTasks(c, db);
    assert.deepEqual(
      open.map((t) => t.name),
      ["Second"],
    );
    assert.deepEqual(receiptsOf(await threadMessages(c, thread, db)), [
      "Read your list (2 open)",
      "Completed 'First'",
    ]);
  });

  test("completeTask returns not found for another account, completed, or missing id", async () => {
    const c = await account();
    const d = await account();
    const mine = await addTasks(c, [["Mine", 0]]);
    const theirs = await addTasks(d, [["Theirs", 0]]);
    await completeTask(c, mine.Mine!, db);
    const thread = await coachThread(c, db);
    for (const [label, taskId] of [
      ["theirs", theirs.Theirs!],
      ["done", mine.Mine!],
      ["missing", randomUUID()],
    ] as const) {
      await turn(
        c,
        thread,
        userMessage(`Complete ${label}`),
        scripted(
          {
            completeTask: JSON.stringify({ taskId }),
            toolCallId: `call_${label}`,
          },
          { text: "Not found." },
        ),
      );
    }
    assert.equal((await openTasks(c, db)).length, 0);
    assert.equal((await openTasks(d, db)).length, 1);
    const receipts = receiptsOf(await threadMessages(c, thread, db))!;
    assert.equal(
      receipts.filter((r) => r === "Couldn't find that task").length,
      3,
    );
  });

  test("a second completeTask in one turn completes nothing on the second call", async () => {
    const c = await account();
    const ids = await addTasks(c, [
      ["A", 2],
      ["B", 0],
    ]);
    const thread = await coachThread(c, db);
    await turn(
      c,
      thread,
      userMessage("Complete everything"),
      scripted(
        {
          completeTask: JSON.stringify({ taskId: ids.A }),
          toolCallId: "call_1",
        },
        {
          completeTask: JSON.stringify({ taskId: ids.B }),
          toolCallId: "call_2",
        },
        { text: "Only one." },
      ),
    );
    const open = await openTasks(c, db);
    assert.deepEqual(
      open.map((t) => t.name),
      ["B"],
    );
    const receipts = receiptsOf(await threadMessages(c, thread, db))!;
    assert.ok(receipts.includes("Completed 'A'"));
    assert.ok(
      receipts.includes("Couldn't complete that task") ||
        receipts.includes("Couldn't find that task"),
    );
  });

  test("a resend after a failed turn does not duplicate a Coach-created Task", async () => {
    const c = await account();
    const thread = await coachThread(c, db);
    const message = userMessage("Add Call dentist");
    // Create, then fail the reply so nothing is saved and the person resends.
    let step = 0;
    const failingAfterCreate = new MockLanguageModelV4({
      doStream: async () => {
        step += 1;
        if (step === 1) {
          return {
            stream: simulateReadableStream({
              chunks: [
                {
                  type: "tool-call",
                  toolCallId: "call_first",
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
          };
        }
        throw new Error("Gateway unavailable");
      },
    });
    await turn(c, thread, message, failingAfterCreate);
    assert.equal((await openTasks(c, db)).length, 1);
    // Resend the same message id with another create of the same name.
    await turn(
      c,
      thread,
      message,
      scripted(
        {
          createTask: JSON.stringify({ name: "Call dentist" }),
          toolCallId: "call_resend",
        },
        { text: "Already there." },
      ),
    );
    assert.equal((await openTasks(c, db)).length, 1);
    assert.ok(
      receiptsOf(await threadMessages(c, thread, db))!.includes(
        "Created task 'Call dentist'",
      ),
    );
  });

  test("the last model step is not offered tools", async () => {
    const c = await account();
    const thread = await coachThread(c, db);
    const model = scripted({ listArea: "{}" });
    await turn(c, thread, userMessage("Keep going"), model);
    assert.equal(model.doStreamCalls.length, 8);
    writeToolsOffered(model.doStreamCalls.at(-1)!, { last: true });
    writeToolsOffered(model.doStreamCalls[0]!);
  });

  test("convertToModelMessages needs the tools to keep a listArea part", async () => {
    const tools = coachTools({
      listOpenTasks: async () => [],
      ...unusedWrites,
    });
    const messages: UIMessage[] = [
      {
        id: randomUUID(),
        role: "assistant",
        parts: [
          {
            type: "tool-listArea",
            toolCallId: "call_keep",
            state: "output-available",
            input: {},
            output: { open: 0, tasks: [] },
          },
        ],
      },
    ];
    const withTools = await convertToModelMessages(messages, { tools });
    assert.deepEqual(
      withTools.map((m) => m.role),
      ["assistant", "tool"],
    );
    const call = withTools[0]!.content as { type: string; toolName: string }[];
    assert.equal(call[0]!.type, "tool-call");
    assert.equal(call[0]!.toolName, "listArea");
  });

  test("a finished turn logs one coach.turn line with its listArea reads, and nothing private", async () => {
    const c = await account();
    const thread = await coachThread(c, db);
    const info = mock.method(console, "info", () => {});
    try {
      await turn(c, thread, userMessage("Is my list empty?"), replying("Yes."));
      // A model that reads the list again anyway shows up as a second read.
      await turn(
        c,
        thread,
        userMessage("Sure?"),
        scripted({ listArea: "{}" }, { text: "It's empty." }),
      );
    } finally {
      info.mock.restore();
    }
    const lines = info.mock.calls
      .map((call) => String(call.arguments[0]))
      .filter((line) => line.includes("coach.turn"));
    assert.deepEqual(
      lines.map((line) => JSON.parse(line)),
      [
        { listArea: 1, steps: 1 },
        { listArea: 2, steps: 2 },
      ].map(({ listArea, steps }) => ({
        event: "coach.turn",
        threadId: thread,
        model: "mock-model-id",
        steps,
        toolCalls: { listArea, createTask: 0, completeTask: 0 },
        finishReason: "stop",
      })),
    );
    for (const secret of [
      c,
      "Is my list empty?",
      "Yes.",
      "It's empty.",
      '"open"',
    ]) {
      assert.ok(!lines.join("\n").includes(secret), secret);
    }
  });
});
