import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";
import { randomUUID } from "node:crypto";
import { afterEach, mock, test } from "node:test";
import {
  appendJournal,
  CloseRefusal,
  receipt,
  type CoachData,
} from "@repo/coach";
import { simulateReadableStream, streamText, type ToolSet } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import {
  coachToolNames,
  coachTools,
  coachToolsContext,
  freshRead,
  maxCreatesPerTurn,
} from "./coach-execution.ts";
import { DraftError } from "./draft-filing/index.ts";
import { JournalError } from "./journal.ts";
import { MoodError } from "./mood.ts";
import { NoteError } from "./notes.ts";
import { closeTools } from "./daily-close/tools.ts";

const userId = randomUUID();
const messageId = randomUUID();
const entityId = randomUUID();
const today = "2026-10-09";
const capMessage =
  "You can make only 3 Task, Note, Journal or Mood writes per reply.";

function data(overrides: Partial<CoachData> = {}): CoachData {
  return {
    getMood: async () => null,
    listOpenTasks: async () => [],
    createTask: async () => null,
    completeTask: async () => null,
    scheduleTask: async () => null,
    updateTask: async () => null,
    ...overrides,
  };
}

function call(toolCallId = "call", browserToday = today) {
  return {
    toolCallId,
    messages: [],
    context: coachToolsContext(userId, messageId, browserToday, 123)
      .appendJournal,
  };
}

function pendingData() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

afterEach(() => mock.restoreAll());

const settled = (value: unknown) => Promise.resolve(value);

test("registration and context retain their distinct original key orders", () => {
  const names = [
    "listInboxDrafts",
    "fileDraft",
    "appendJournal",
    "setMood",
    "listNotebooks",
    "searchKnowledge",
    "createNote",
    "listArea",
    "createTask",
    "completeTask",
    "scheduleTask",
    "updateTask",
  ];
  assert.deepEqual(Object.keys(coachTools(data())), names);
  const contextNames = ["fileDraft", "listInboxDrafts", ...names.slice(2)];
  assert.deepEqual(coachToolNames, contextNames);
  assert.deepEqual(
    Object.keys(coachToolsContext(userId, messageId)),
    contextNames,
  );
});

test("successful execution binds context to the core and preserves Journal provenance and result", async () => {
  const append = mock.fn<NonNullable<CoachData["appendJournal"]>>(
    async (_user, input) => ({ id: entityId, day: input.day }),
  );
  const adapter = data({ appendJournal: append });
  const coreRun = mock.method(appendJournal, "run");
  const output = await coachTools(adapter).appendJournal.execute!(
    { text: "Keep this reflection" },
    call("append_1"),
  );
  assert.ok(
    coreRun.mock.calls.some((call) =>
      isDeepStrictEqual(call.arguments, [
        { text: "Keep this reflection" },
        {
          userId,
          messageId,
          today,
          messageCreatedAt: 123,
          toolCallId: "append_1",
          data: adapter,
          appendOrdinal: 1,
        },
      ]),
    ),
  );
  assert.ok(
    append.mock.calls.some((call) =>
      isDeepStrictEqual(call.arguments, [
        userId,
        {
          day: today,
          today,
          text: "Keep this reflection",
          source: "coach",
          operationId: `${messageId}:${today}:1`,
        },
      ]),
    ),
  );
  assert.deepEqual(output, {
    id: entityId,
    day: today,
    href: `/journal/${today}`,
  });
});

test("parallel mixed writes reserve the shared cap before any awaited data returns", async () => {
  const gate = pendingData();
  const reached: string[] = [];
  const tools = coachTools(
    data({
      createTask: async () => {
        reached.push("task");
        await gate.promise;
        return null;
      },
      appendJournal: async (_user, input) => {
        reached.push("journal");
        await gate.promise;
        return { id: entityId, day: input.day };
      },
      setMood: async (_user, input) => {
        reached.push("mood");
        await gate.promise;
        return { day: input.day, mood: input.mood };
      },
    }),
  );
  const admitted = [
    tools.createTask.execute!({ name: "Task" }, call("task")),
    tools.appendJournal.execute!({ text: "Reflection" }, call("journal")),
    tools.setMood.execute!({ mood: "Good" }, call("mood")),
  ];
  try {
    assert.deepEqual(reached, ["task", "journal", "mood"]);
    await assert.rejects(
      settled(tools.fileDraft.execute!(
        { draftId: entityId, destination: { kind: "journal" } },
        call("file"),
      )),
      (error: unknown) => error instanceof Error && error.message.includes(capMessage),
    );
    await assert.rejects(
      settled(tools.createNote.execute!(
        { notebook: "Book", title: "Title", body: "Body" },
        call("note"),
      )),
      (error: unknown) => error instanceof Error && error.message.includes(capMessage),
    );
  } finally {
    gate.resolve();
    await Promise.all(admitted);
  }
});

const writeAttempts = {
  fileDraft: (tools: ReturnType<typeof coachTools>) =>
    tools.fileDraft.execute!(
      { draftId: entityId, destination: { kind: "journal" } },
      call(),
    ),
  appendJournal: (tools: ReturnType<typeof coachTools>) =>
    tools.appendJournal.execute!({ text: "Reflection" }, call()),
  setMood: (tools: ReturnType<typeof coachTools>) =>
    tools.setMood.execute!({ mood: "Good" }, call()),
  createNote: (tools: ReturnType<typeof coachTools>) =>
    tools.createNote.execute!(
      { notebook: "Book", title: "Title", body: "Body" },
      call(),
    ),
  createTask: (tools: ReturnType<typeof coachTools>) =>
    tools.createTask.execute!({ name: "Task" }, call()),
};

for (const [name, attempt] of Object.entries(writeAttempts)) {
  test(`${name} shares the write cap and caps reset for a new reply`, async () => {
    const tools = coachTools(data());
    for (let i = 0; i < maxCreatesPerTurn; i++)
      await tools.createTask.execute!({ name: "Task" }, call());
    await assert.rejects(
      settled(attempt(tools)),
      (error: unknown) => error instanceof Error && error.message.includes(capMessage),
    );
    assert.deepEqual(
      await coachTools(data()).createTask.execute!({ name: "Task" }, call()),
      { refused: true },
    );
  });
}

test("day failures consume attempts and append ordinals before validation, without logging", async () => {
  const log = mock.method(console, "error", () => {});
  const append = mock.fn<NonNullable<CoachData["appendJournal"]>>(
    async (_user, input) => ({ id: entityId, day: input.day }),
  );
  const tools = coachTools(data({ appendJournal: append }));
  await assert.rejects(
    settled(tools.appendJournal.execute!(
      { text: "Missing Today" },
      call("missing", ""),
    )),
    (error: unknown) =>
      error instanceof Error &&
      error.message.includes(
        "Supply the browser's Today as a real YYYY-MM-DD calendar day, then retry.",
      ),
  );
  await assert.rejects(
    settled(tools.fileDraft.execute!(
      {
        draftId: entityId,
        destination: { kind: "journal", day: "2026-10-10" },
      },
      call(),
    )),
    (error: unknown) =>
      error instanceof Error &&
      error.message.includes("This day is not open yet."),
  );
  await tools.appendJournal.execute!({ text: "Saved" }, call());
  assert.equal(
    append.mock.calls[0]!.arguments[1].operationId,
    `${messageId}:${today}:2`,
  );
  await assert.rejects(
    settled(tools.setMood.execute!({ mood: "Good" }, call("capped", ""))),
    (error: unknown) => error instanceof Error && error.message.includes(capMessage),
  );
  assert.equal(log.mock.callCount(), 0);
});

test("parallel Journal calls get distinct ordinals while the first append is still pending", async () => {
  const gate = pendingData();
  const operations: string[] = [];
  const tools = coachTools(
    data({
      appendJournal: async (_user, input) => {
        operations.push(input.operationId);
        await gate.promise;
        return { id: entityId, day: input.day };
      },
    }),
  );
  const pending = [
    tools.appendJournal.execute!({ text: "First" }, call("first")),
    tools.appendJournal.execute!({ text: "Second" }, call("second")),
  ];
  try {
    assert.deepEqual(operations, [
      `${messageId}:${today}:1`,
      `${messageId}:${today}:2`,
    ]);
  } finally {
    gate.resolve();
    await Promise.all(pending);
  }
});

for (const [name, max, message] of [
  ["completeTask", 1, "You can complete only one Task per reply."],
  ["scheduleTask", 3, "You can schedule only 3 Tasks per reply."],
  ["updateTask", 3, "You can update only 3 Tasks per reply."],
] as const) {
  test(`${name} has an independent attempt cap`, async () => {
    const tools = coachTools(data());
    for (let i = 0; i < maxCreatesPerTurn; i++)
      await tools.createTask.execute!({ name: "Task" }, call());
    for (let i = 0; i < max; i++)
      await tools[name].execute!(
        { taskId: entityId, date: "2026-10-20" },
        call(),
      );
    await assert.rejects(
      settled(tools[name].execute!({ taskId: entityId, date: "2026-10-20" }, call())),
      (error: unknown) => error instanceof Error && error.message.includes(message),
    );
  });
}

test("database failures are logged with the same shape and masked without private text", async () => {
  const secret = "PRIVATE REFLECTION, SQL AND USER ID";
  const log = mock.method(console, "error", () => {});
  const tools = coachTools(
    data({
      appendJournal: async () => {
        throw new Error(secret, { cause: { code: "42P01" } });
      },
    }),
  );
  await assert.rejects(
    settled(tools.appendJournal.execute!({ text: secret }, call("failed_append"))),
    (error: unknown) =>
      error instanceof Error &&
      error.message.includes("Couldn't append to that Journal day."),
  );
  assert.deepEqual(
    log.mock.calls.map((call) => call.arguments),
    [
      [
        JSON.stringify({
          event: "coach.tool.error",
          tool: "appendJournal",
          toolCallId: "failed_append",
          error: "Error",
          code: "42P01",
        }),
      ],
    ],
  );
  assert.ok(
    !JSON.stringify(log.mock.calls.map((call) => call.arguments)).includes(
      secret,
    ),
  );
  assert.ok(
    !JSON.stringify(log.mock.calls.map((call) => call.arguments)).includes(
      userId,
    ),
  );
  assert.equal(
    receipt({
      type: "tool-appendJournal",
      state: "output-error",
      errorText: "Couldn't append to that Journal day.",
    }),
    "Couldn't append to that Journal day",
  );
});

for (const name of ["fileDraft", "appendJournal", "setMood"] as const) {
  test(`${name} passes CloseRefusal through unchanged and unlogged`, async () => {
    const refusal = new CloseRefusal("only the selected day is allowed");
    const log = mock.method(console, "error", () => {});
    const refuse = async () => {
      throw refusal;
    };
    const tools = coachTools(
      data({ fileDraft: refuse, appendJournal: refuse, setMood: refuse }),
    );
    await assert.rejects(
      settled(writeAttempts[name](tools)),
      (error: unknown) => error === refusal,
    );
    assert.equal(log.mock.callCount(), 0);
    assert.equal(
      receipt({
        type: `tool-${name}`,
        state: "output-error",
        errorText: refusal.message,
      }),
      null,
    );
  });
}

for (const [name, ErrorType] of [
  ["fileDraft", DraftError],
  ["fileDraft", JournalError],
  ["fileDraft", NoteError],
  ["appendJournal", JournalError],
  ["setMood", MoodError],
] as const) {
  test(`${name} preserves the safe ${ErrorType.name} message and logs the failure`, async () => {
    const safe = new ErrorType("Safe domain failure");
    const log = mock.method(console, "error", () => {});
    const fail = async () => {
      throw safe;
    };
    const tools = coachTools(
      data({ fileDraft: fail, appendJournal: fail, setMood: fail }),
    );
    await assert.rejects(
      settled(writeAttempts[name](tools)),
      (error: unknown) => error instanceof Error && error.message.includes(safe.message),
    );
    assert.equal(log.mock.callCount(), 1);
  });
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

for (const context of [
  undefined,
  {},
  { listArea: { userId: "bad", messageId } },
  { listArea: { userId, messageId: "bad" } },
  { listArea: { userId, messageId, today: 123 } },
  { listArea: { userId, messageId, messageCreatedAt: -1 } },
  { listArea: { userId, messageId, messageCreatedAt: 0.5 } },
]) {
  test(`invalid SDK context is rejected before the data adapter runs (${JSON.stringify(context)})`, async () => {
    const read = mock.fn<CoachData["listOpenTasks"]>(async () => []);
    const model = new MockLanguageModelV4({
      doStream: async () => ({
        stream: simulateReadableStream({
          chunks: [
            {
              type: "tool-call",
              toolCallId: "read",
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
      }),
    });
    const result = streamText({
      model,
      prompt: "Read",
      tools: coachTools(data({ listOpenTasks: read })) as ToolSet,
      toolsContext: context as never,
      onError: () => {},
    });
    const types: string[] = [];
    for await (const part of result.stream) types.push(part.type);
    assert.ok(types.includes("error"));
    assert.ok(!types.includes("tool-result"));
    assert.equal(read.mock.callCount(), 0);
  });
}

test("knowledge and finishDailyClose stay uncapped after exhausting writes, and finish writes nothing", async () => {
  const write = mock.fn<CoachData["createTask"]>(async () => null);
  const adapter = data({ createTask: write });
  const tools = coachTools(adapter);
  const close = closeTools(tools, adapter, userId, today);
  for (let i = 0; i < maxCreatesPerTurn; i++)
    await tools.createTask.execute!({ name: "Task" }, call());
  for (let i = 0; i < 5; i++) {
    assert.deepEqual(
      await tools.searchKnowledge.execute!(
        { query: "no matching heading" },
        call(),
      ),
      { match: false },
    );
    assert.deepEqual(await close.finishDailyClose.execute!({}, call()), {
      finished: true,
      day: today,
    });
  }
  assert.equal(write.mock.callCount(), maxCreatesPerTurn);
});

test("freshRead uses the same masked list execution and preserves its message and receipt shapes", async () => {
  const read = mock.fn<CoachData["listOpenTasks"]>(async () => []);
  const fresh = await freshRead(userId, data({ listOpenTasks: read }));
  const callPart = fresh.messages[0]!.content as { toolCallId: string }[];
  const toolCallId = callPart[0]!.toolCallId;
  assert.match(toolCallId, /^read_[0-9a-f]{32}$/);
  assert.ok(
    read.mock.calls.some((call) => isDeepStrictEqual(call.arguments, [userId])),
  );
  assert.deepEqual(fresh.messages, [
    {
      role: "assistant",
      content: [
        { type: "tool-call", toolCallId, toolName: "listArea", input: {} },
      ],
    },
    {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId,
          toolName: "listArea",
          output: {
            type: "json",
            value: { open: 0, tasks: [], note: "The person's list right now." },
          },
        },
      ],
    },
  ]);
  const parts = [];
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue({ type: "start" as const });
      controller.close();
    },
  }).pipeThrough(fresh.receipt);
  for await (const part of stream) parts.push(part);
  assert.deepEqual(parts, [
    { type: "start" },
    { type: "tool-call", toolCallId, toolName: "listArea", input: {} },
    {
      type: "tool-result",
      toolCallId,
      toolName: "listArea",
      input: {},
      output: { open: 0, tasks: [] },
    },
  ]);
  const log = mock.method(console, "error", () => {});
  await assert.rejects(
    settled(freshRead(
      userId,
      data({
        listOpenTasks: async () => {
          throw new Error("PRIVATE SQL");
        },
      }),
    )),
    (error: unknown) =>
      error instanceof Error &&
      error.message.includes("The list couldn't be read."),
  );
  assert.equal(log.mock.callCount(), 1);
  assert.ok(
    !JSON.stringify(log.mock.calls.map((call) => call.arguments)).includes(
      "PRIVATE SQL",
    ),
  );
});
