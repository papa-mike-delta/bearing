// Coach turns against a real Postgres with a scripted model: no Gateway, no
// key. Same guard as the isolation suite: needs TEST_POSTGRES_URL, fails in CI
// without it, and is skipped with a warning everywhere else.

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, test } from "node:test";
import { coachMessages, createDb, users } from "@repo/db";
import { simulateReadableStream, type UIMessage } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { eq, inArray } from "drizzle-orm";
import { coachThread, threadMessages } from "./coach-threads.ts";
import { coachModel, coachTurn } from "./coach-turn.ts";
import { createArea } from "./tasks.ts";

const url = process.env.TEST_POSTGRES_URL;

test("the model comes from COACH_MODEL, defaulting to spacexai/grok-4.7", () => {
  const before = process.env.COACH_MODEL;
  try {
    delete process.env.COACH_MODEL;
    assert.equal(coachModel(), "spacexai/grok-4.7");
    process.env.COACH_MODEL = "openai/gpt-6-astra";
    assert.equal(coachModel(), "openai/gpt-6-astra");
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
function replying(reply: string) {
  return new MockLanguageModelV4({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunkDelayInMs: 5,
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
  // browser that stays open. Returns the chunks the browser got.
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
    for (let r = await reader.read(); !r.done; r = await reader.read()) {
      chunks.push(r.value);
    }
    await result.saved;
    return { chunks };
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
      models: ["openai/gpt-6-astra"],
      user: a,
      tags: ["coach"],
    });
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
    await turn(c, thread, message, replying("Yes."));
    assert.deepEqual(textOf(await threadMessages(c, thread, db)), [
      ["user", "Are you there?"],
      ["assistant", "Yes."],
    ]);
  });
});
