import assert from "node:assert/strict";
import { test } from "node:test";
import { maxTaskNameLength, maxTaskNoteLength, taskHref } from "@repo/domain";
import type { CoachData } from "../data.ts";
import { coachCreateSourceId, createTask } from "./create-task.ts";

const messageId = "11111111-1111-4111-8111-111111111111";

function fake(
  result: { id: string; name: string } | null,
  open: {
    id: string;
    name: string;
    priority: number;
    area: string;
    isNext: boolean;
  }[] = [],
) {
  const calls: {
    userId: string;
    input: { name: string; note?: string; area?: string };
    from: { source: string; sourceId: string };
  }[] = [];
  const data: CoachData = {
    async getMood() {
      return null;
    },
    async listOpenTasks() {
      return open;
    },
    async createTask(userId, input, from) {
      calls.push({ userId, input, from });
      return result;
    },
    async completeTask() {
      throw new Error("completeTask was not expected");
    },
    async scheduleTask() {
      throw new Error("scheduleTask was not expected");
    },
    async updateTask() {
      throw new Error("updateTask was not expected");
    },
  };
  return { data, calls };
}

const ctx = (
  data: CoachData,
  userId = "user-7",
  toolCallId = "call_9",
  msgId = messageId,
) => ({ userId, toolCallId, messageId: msgId, data });

test("createTask adds a Task for the session user, tagged with a resend-safe source id", async () => {
  const open = [
    {
      id: "task-9",
      name: "Stored name",
      priority: 0,
      area: "Tasks",
      isNext: true,
    },
  ];
  const { data, calls } = fake({ id: "task-9", name: "Stored name" }, open);
  const result = await createTask.run(
    { name: "Buy milk", note: "2%" },
    ctx(data),
  );
  assert.deepEqual(result, {
    id: "task-9",
    name: "Stored name",
    next: { id: "task-9", name: "Stored name" },
  });
  assert.deepEqual(calls, [
    {
      userId: "user-7",
      input: { name: "Buy milk", note: "2%" },
      from: {
        source: "coach",
        sourceId: coachCreateSourceId(messageId, "Buy milk"),
      },
    },
  ]);
});

test("createTask passes an omitted note through as omitted", async () => {
  const { data, calls } = fake({ id: "task-1", name: "Buy milk" });
  await createTask.run({ name: "Buy milk" }, ctx(data, "user-1", "call_1"));
  assert.equal(calls[0]?.input.note, undefined);
  assert.equal(
    calls[0]?.from.sourceId,
    coachCreateSourceId(messageId, "Buy milk"),
  );
});

test("createTask links a real Task id to its page", async () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const { data } = fake({ id, name: "Call dentist" });
  const result = await createTask.run({ name: "Call dentist" }, ctx(data));
  assert.equal("href" in result ? result.href : null, taskHref(id));
});

test("createTask returns refused when the data interface refuses the Task", async () => {
  const { data, calls } = fake(null);
  assert.deepEqual(await createTask.run({ name: "Buy milk" }, ctx(data)), {
    refused: true,
  });
  assert.equal(calls.length, 1);
});

test("createTask refuses a blank or overlong name, and an overlong note", () => {
  const ok = "x".repeat(maxTaskNameLength);
  assert.deepEqual(createTask.inputSchema.parse({ name: `  ${ok}  ` }), {
    name: ok,
  });
  assert.equal(
    createTask.inputSchema.parse({
      name: "ok",
      note: "n".repeat(maxTaskNoteLength),
    }).note?.length,
    maxTaskNoteLength,
  );
  assert.deepEqual(
    createTask.inputSchema.parse({ name: "Buy milk", area: " Work " }),
    { name: "Buy milk", area: "Work" },
  );
  for (const name of ["", "   ", "\n", "x".repeat(maxTaskNameLength + 1)]) {
    assert.throws(() => createTask.inputSchema.parse({ name }), name);
  }
  assert.throws(() =>
    createTask.inputSchema.parse({
      name: "ok",
      note: "n".repeat(maxTaskNoteLength + 1),
    }),
  );
});
