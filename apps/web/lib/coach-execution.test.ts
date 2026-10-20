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
import { HabitError } from "./habits.ts";
import { NoteError } from "./notes.ts";
import { normalTurnToolNames } from "./coach-normal-turn.ts";
import { closeTools } from "./daily-close/tools.ts";

const userId = randomUUID();
const messageId = randomUUID();
const entityId = randomUUID();
const today = "2026-10-09";
const capMessage =
  "You can make only 3 Task, Note, Journal, Mood, filing or Habit writes per reply.";

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
    "createHabit",
    "trackHabit",
    "listHabits",
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
  createHabit: (tools: ReturnType<typeof coachTools>) => tools.createHabit.execute!({ name: "Walk" }, call()),
  trackHabit: (tools: ReturnType<typeof coachTools>) => tools.trackHabit.execute!({ habitId: entityId, action: "did" }, call()),
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
    const tools = coachTools(data({ createTask: async () => ({ id: entityId, name: "Task" }), completeTask: async () => ({ id: entityId, name: "Task" }), scheduleTask: async () => ({ id: entityId, name: "Task" }), updateTask: async () => ({ id: entityId, name: "Task" }) }));
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

test("day failures release attempts but consume append ordinals before validation, without logging", async () => {
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
  await assert.rejects(settled(tools.setMood.execute!({ mood: "Good" }, call("missing", ""))), /browser's Today/);
  await tools.appendJournal.execute!({ text: "Second saved" }, call());
  await tools.appendJournal.execute!({ text: "Third saved" }, call());
  await assert.rejects(settled(tools.appendJournal.execute!({ text: "Fourth" }, call())), /only 3/);
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
    const tools = coachTools(data({ createTask: async () => ({ id: entityId, name: "Task" }), completeTask: async () => ({ id: entityId, name: "Task" }), scheduleTask: async () => ({ id: entityId, name: "Task" }), updateTask: async () => ({ id: entityId, name: "Task" }) }));
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
  ["createHabit", HabitError],
  ["trackHabit", HabitError],
] as const) {
  test(`${name} preserves the safe ${ErrorType.name} message and logs the failure`, async () => {
    const safe = new ErrorType("Safe domain failure");
    const log = mock.method(console, "error", () => {});
    const fail = async () => {
      throw safe;
    };
    const tools = coachTools(
      data({ fileDraft: fail, appendJournal: fail, setMood: fail, createHabit: fail, trackHabit: fail }),
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


test("habit reads are uncapped and use the account and browser today from context", async () => {
  const asked: [string, string][] = [];
  const tools = coachTools(data({ listHabits: async (account, day) => { asked.push([account, day]); return []; } }));
  for (let index = 0; index < 8; index++) {
    assert.deepEqual(await tools.listHabits.execute!({}, call(`habit_${index}`)), { habits: [] });
  }
  assert.deepEqual(asked, Array.from({ length: 8 }, () => [userId, today]));
  await assert.rejects(Promise.resolve().then(() => tools.listHabits.execute!({}, call("invalid", "2026-02-31"))), /browser's Today/);
  assert.equal(asked.length, 8);
  assert.ok(normalTurnToolNames.includes("listHabits"));
  assert.equal("listHabits" in closeTools(tools, data(), userId, today), true);
});

const habitState = { id: entityId, name: "Walk", period: "day" as const, trackMode: "once" as const, goalCount: null, bad: false, count: 0, done: false, due: true, streak: 0, record: 0 };

test("habit writes reserve the shared cap alongside Note and Journal; a fourth write leaves earlier results", async () => {
  const committed: string[] = [];
  const operations: string[] = [];
  const adapter = data({
    createHabit: async (_user, input) => { committed.push("habit"); operations.push(input.operationId); return habitState; },
    trackHabit: async (_user, input) => { committed.push("track"); operations.push(input.operationId); return { ...habitState, count: 1, done: true, due: false, day: input.day, action: input.action, changed: true }; },
    listNotebooks: async () => [{ id: entityId, name: "Book" }],
    createNote: async () => { committed.push("note"); return { id: entityId, notebookId: entityId, title: "Title" }; },
    appendJournal: async (_user, input) => { committed.push("journal"); return { id: entityId, day: input.day }; },
  });
  for (const first of ["createHabit", "trackHabit"] as const) {
    committed.length = 0;
    operations.length = 0;
    const tools = coachTools(adapter);
    await writeAttempts[first](tools);
    await writeAttempts.createNote(tools);
    await writeAttempts.appendJournal(tools);
    for (const attempt of Object.values(writeAttempts)) await assert.rejects(settled(attempt(tools)), /only 3 .*Habit writes/);
    assert.deepEqual(committed, [first === "createHabit" ? "habit" : "track", "note", "journal"]);
    assert.deepEqual(operations, [`${messageId}:${first}:1`]);
  }
});

test("habit replay positions are stable when provider call ids change and distinct for multiple calls", async () => {
  const operations: string[] = [];
  const adapter = data({
    createHabit: async (_user, input) => { operations.push(input.operationId); return habitState; },
    trackHabit: async (_user, input) => { operations.push(input.operationId); return { ...habitState, day: input.day, action: input.action, changed: true }; },
  });
  for (const providerId of ["original", "resent"]) {
    const tools = coachTools(adapter);
    await tools.createHabit.execute!({ name: "Walk" }, call(`${providerId}_create`));
    await tools.trackHabit.execute!({ habitId: entityId, action: "did" }, call(`${providerId}_did`));
    await tools.trackHabit.execute!({ habitId: entityId, action: "did" }, call(`${providerId}_again`));
  }
  assert.deepEqual(operations, Array(2).fill([`${messageId}:createHabit:1`, `${messageId}:trackHabit:2`, `${messageId}:trackHabit:3`]).flat());
});

for (const name of ["createHabit", "trackHabit"] as const) {
  test(`${name} masks private failures and emits no successful receipt`, async () => {
    const log = mock.method(console, "error", () => {});
    const fail = async () => { throw new Error("PRIVATE HABIT SQL", { cause: { code: "42P01" } }); };
    const tools = coachTools(data({ createHabit: fail, trackHabit: fail }));
    const failure = name === "createHabit" ? "Couldn't create that habit" : "Couldn't track that habit";
    await assert.rejects(settled(writeAttempts[name](tools)), new RegExp(failure));
    assert.equal(log.mock.callCount(), 1);
    assert.ok(!JSON.stringify(log.mock.calls).includes("PRIVATE HABIT SQL"));
    assert.equal(receipt({ type: `tool-${name}`, state: "output-error", errorText: failure }), failure);
  });
}

for (const refusal of ["throw", "unchanged", "task", "clarification", "future", "empty", "goal", "cap", "range", "markDone", "replay-unchanged"] as const) {
  test(`${refusal} releases a slot before three applied setCount writes, including replay results`, async () => {
    mock.method(console, "error", () => {});
    let refuse = true;
    const adapter = data({
      createTask: async () => null,
      trackHabit: async (_user, input) => {
        if (refuse && ["throw", "cap", "range", "markDone"].includes(refusal)) throw new HabitError("Refused");
        return { ...habitState, trackMode: "many", count: input.count ?? 0, day: input.day, action: input.action, changed: !refuse };
      },
    });
    const tools = coachTools(adapter);
    const set = () => tools.trackHabit.execute!({ habitId: entityId, action: "setCount", count: 8 }, call());
    const refusedTrack = () => tools.trackHabit.execute!({ habitId: entityId, action: refusal === "cap" ? "did" : refusal === "empty" ? "didnt" : ["goal", "markDone"].includes(refusal) ? "markDone" : "setCount", count: refusal === "range" ? 100 : 8 }, call());
    if (["throw", "cap", "range", "markDone"].includes(refusal)) await assert.rejects(settled(refusedTrack()));
    else if (refusal === "task") assert.deepEqual(await tools.createTask.execute!({ name: "Refused" }, call()), { refused: true });
    else if (refusal === "clarification") await tools.createHabit.execute!({ name: "Water", trackMode: "many" }, call());
    else if (refusal === "future") await assert.rejects(settled(tools.appendJournal.execute!({ text: "Future", day: "2026-10-10" }, call())), /not open/);
    else await refusedTrack();
    refuse = false;
    for (let i = 0; i < 3; i++) await set();
    await assert.rejects(settled(set()), /only 3/);
  });
}

for (const [name, max] of [["completeTask", 1], ["scheduleTask", 3], ["updateTask", 3]] as const) {
  test(`${name} releases refused, invalid and throwing calls, then retains applied slots`, async () => {
    mock.method(console, "error", () => {});
    let mode = "refuse";
    const adapter = data({ [name]: async () => {
      if (mode === "throw") throw new Error("Failure");
      return mode === "refuse" ? null : { id: entityId, name: "Applied" };
    } });
    const tools = coachTools(adapter);
    const run = (taskId: string = entityId) => tools[name].execute!({ taskId, date: "2026-10-20" }, call());
    await run("invalid");
    await run();
    mode = "throw";
    await assert.rejects(settled(run()));
    mode = "apply";
    for (let i = 0; i < max; i++) await run();
    await assert.rejects(settled(run()), /only/);
  });
}

test("three in-flight reservations block a fourth; a settled refusal admits a later write", async () => {
  const gate = pendingData();
  const tools = coachTools(data({ createTask: async () => { await gate.promise; return null; }, appendJournal: async (_u, input) => ({ id: entityId, day: input.day }) }));
  const pending = Array.from({ length: 3 }, () => tools.createTask.execute!({ name: "Refused" }, call()));
  await assert.rejects(settled(tools.appendJournal.execute!({ text: "Blocked" }, call())), /only 3/);
  gate.resolve();
  await Promise.all(pending);
  for (let i = 0; i < 3; i++) await tools.appendJournal.execute!({ text: "Applied or replay" }, call());
  await assert.rejects(settled(tools.appendJournal.execute!({ text: "Fourth" }, call())), /only 3/);
});

test("resending three applied writes retains all slots; unchanged operation replays release theirs and ordinals still advance", async () => {
  const operations = new Map<string, object>();
  const seen: string[] = [];
  let applied = 0;
  const adapter = data({ trackHabit: async (_user, input) => {
    seen.push(input.operationId);
    const previous = operations.get(input.operationId);
    if (previous) return previous as Awaited<ReturnType<NonNullable<CoachData["trackHabit"]>>>;
    const changed = input.count !== 0;
    if (changed) applied++;
    const result = { ...habitState, count: input.count ?? 0, day: input.day, action: input.action, changed };
    operations.set(input.operationId, result);
    return result;
  } });
  for (const resend of [false, true]) {
    const tools = coachTools(adapter);
    for (const count of [0, 4, 5, 6]) await tools.trackHabit.execute!({ habitId: entityId, action: "setCount", count }, call(resend ? "new-provider" : "original"));
    await assert.rejects(settled(tools.trackHabit.execute!({ habitId: entityId, action: "setCount", count: 7 }, call())), /only 3/);
  }
  assert.equal(applied, 3);
  assert.equal(operations.size, 4);
  assert.deepEqual(seen, Array(2).fill([1, 2, 3, 4].map((n) => `${messageId}:trackHabit:${n}`)).flat());
});
