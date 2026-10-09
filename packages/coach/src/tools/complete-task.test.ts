import assert from "node:assert/strict";
import { test } from "node:test";
import type { CoachData } from "../data.ts";
import { completeTask } from "./complete-task.ts";

const taskId = "550e8400-e29b-41d4-a716-446655440000";
const messageId = "11111111-1111-4111-8111-111111111111";

function fake(
  result: { id: string; name: string } | null,
  open: { id: string; name: string; priority: number; isNext: boolean }[] = [],
) {
  const calls: { userId: string; taskId: string }[] = [];
  const data: CoachData = {
    async listOpenTasks() {
      return open;
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
  messageId,
  data,
});

test("completeTask completes that Task for the session user", async () => {
  const open = [{ id: "other", name: "Next one", priority: 0, isNext: true }];
  const { data, calls } = fake({ id: taskId, name: "Call dentist" }, open);
  const result = await completeTask.run({ taskId }, ctx(data));
  assert.deepEqual(result, {
    id: taskId,
    name: "Call dentist",
    next: { id: "other", name: "Next one" },
  });
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

test("completeTask reports invalidId when the task id isn't a uuid", async () => {
  const { data, calls } = fake(null);
  for (const id of ["nope", "", "123", "task-1"]) {
    assert.deepEqual(
      await completeTask.run({ taskId: id }, ctx(data)),
      { invalidId: true },
      id,
    );
  }
  assert.equal(calls.length, 0);
});

test("completeTask input accepts a string task id", () => {
  assert.deepEqual(completeTask.inputSchema.parse({ taskId, userId: "x" }), {
    taskId,
  });
  assert.deepEqual(completeTask.inputSchema.parse({ taskId: "nope" }), {
    taskId: "nope",
  });
  assert.throws(() => completeTask.inputSchema.parse({}));
});
