import assert from "node:assert/strict";
import { test } from "node:test";
import type { CoachData } from "../data.ts";
import { completeTask } from "./complete-task.ts";

const taskId = "550e8400-e29b-41d4-a716-446655440000";

// A fake data interface that records the completion and returns `result`.
function fake(result: { id: string; name: string } | null) {
  const calls: { userId: string; taskId: string }[] = [];
  const data: CoachData = {
    async listOpenTasks() {
      throw new Error("listOpenTasks was not expected");
    },
    async createTask() {
      throw new Error("createTask was not expected");
    },
    async completeTask(userId, id) {
      calls.push({ userId, taskId: id });
      return result;
    },
  };
  return { data, calls };
}

const ctx = (data: CoachData) => ({
  userId: "user-7",
  toolCallId: "call_3",
  data,
});

test("completeTask completes that Task for the session user", async () => {
  const { data, calls } = fake({ id: taskId, name: "Call dentist" });
  const result = await completeTask.run({ taskId }, ctx(data));
  assert.deepEqual(result, { id: taskId, name: "Call dentist" });
  assert.equal("notFound" in result, false);
  assert.deepEqual(calls, [{ userId: "user-7", taskId }]);
});

test("completeTask reports not found when the data interface returns null", async () => {
  const { data, calls } = fake(null);
  assert.deepEqual(await completeTask.run({ taskId }, ctx(data)), {
    notFound: true,
  });
  assert.deepEqual(calls, [{ userId: "user-7", taskId }]);
});

test("completeTask refuses a task id that isn't a uuid", () => {
  assert.deepEqual(completeTask.inputSchema.parse({ taskId, userId: "x" }), {
    taskId,
  });
  for (const id of ["nope", "", "123", "task-1"]) {
    assert.throws(() => completeTask.inputSchema.parse({ taskId: id }), id);
  }
  assert.throws(() => completeTask.inputSchema.parse({}));
});
