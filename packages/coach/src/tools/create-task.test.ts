import assert from "node:assert/strict";
import { test } from "node:test";
import { maxTaskNameLength, maxTaskNoteLength } from "@repo/domain";
import type { CoachData } from "../data.ts";
import { createTask } from "./create-task.ts";

// A fake data interface that records the add and returns `result`.
function fake(result: { id: string; name: string } | null) {
  const calls: {
    userId: string;
    input: { name: string; note?: string };
    from: { source: string; sourceId: string };
  }[] = [];
  const data: CoachData = {
    async listOpenTasks() {
      throw new Error("listOpenTasks was not expected");
    },
    async createTask(userId, input, from) {
      calls.push({ userId, input, from });
      return result;
    },
    async completeTask() {
      throw new Error("completeTask was not expected");
    },
  };
  return { data, calls };
}

const ctx = (data: CoachData, userId = "user-7", toolCallId = "call_9") => ({
  userId,
  toolCallId,
  data,
});

test("createTask adds a Task for the session user, tagged with the tool-call id", async () => {
  const { data, calls } = fake({ id: "task-9", name: "Stored name" });
  const result = await createTask.run(
    { name: "Buy milk", note: "2%" },
    ctx(data),
  );
  assert.deepEqual(result, { id: "task-9", name: "Stored name" });
  assert.deepEqual(calls, [
    {
      userId: "user-7",
      input: { name: "Buy milk", note: "2%" },
      from: { source: "coach", sourceId: "call_9" },
    },
  ]);
});

test("createTask passes an omitted note through as omitted", async () => {
  const { data, calls } = fake({ id: "task-1", name: "Buy milk" });
  await createTask.run({ name: "Buy milk" }, ctx(data, "user-1", "call_1"));
  assert.equal(calls[0]?.input.note, undefined);
  assert.equal(calls[0]?.from.sourceId, "call_1");
});

test("createTask throws when the data interface refuses the Task", async () => {
  const { data, calls } = fake(null);
  await assert.rejects(() => createTask.run({ name: "Buy milk" }, ctx(data)), {
    message: "Couldn't create that task",
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
  // A user id on the input is not a field, so it can't choose the account.
  assert.deepEqual(
    createTask.inputSchema.parse({ name: "Buy milk", userId: "someone" }),
    { name: "Buy milk" },
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
