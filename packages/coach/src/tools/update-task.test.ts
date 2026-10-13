import assert from "node:assert/strict";
import { test } from "node:test";
import { maxAreaNameLength } from "@repo/domain";
import type { CoachData } from "../data.ts";
import { updateTask } from "./update-task.ts";

const taskId = "550e8400-e29b-41d4-a716-446655440000";
const messageId = "11111111-1111-4111-8111-111111111111";

function fake(result: { id: string; name: string } | null) {
  const calls: {
    userId: string;
    taskId: string;
    input: Record<string, unknown>;
  }[] = [];
  const data: CoachData = {
    async getMood() {
      return null;
    },
    async listOpenTasks() {
      return [];
    },
    async createTask() {
      throw new Error("createTask was not expected");
    },
    async completeTask() {
      throw new Error("completeTask was not expected");
    },
    async scheduleTask() {
      throw new Error("scheduleTask was not expected");
    },
    async updateTask(userId, id, input) {
      calls.push({ userId, taskId: id, input });
      return result;
    },
  };
  return { data, calls };
}

const ctx = (data: CoachData) => ({
  userId: "user-7",
  toolCallId: "call_5",
  messageId,
  data,
});

test("updateTask passes only the fields it was given", async () => {
  const { data, calls } = fake({ id: taskId, name: "Oat milk" });
  const result = await updateTask.run(
    { taskId, name: "Oat milk", goal: null, status: "started" },
    ctx(data),
  );
  assert.equal(result.name, "Oat milk");
  assert.deepEqual(calls, [
    {
      userId: "user-7",
      taskId,
      input: { name: "Oat milk", goal: null, status: "started" },
    },
  ]);
});

test("updateTask reports refused, and invalidId for a bad id", async () => {
  const { data, calls } = fake(null);
  assert.deepEqual(await updateTask.run({ taskId, goal: "Elsewhere" }, ctx(data)), {
    refused: true,
  });
  assert.deepEqual(await updateTask.run({ taskId: "nope", name: "X" }, ctx(data)), {
    invalidId: true,
  });
  assert.equal(calls.length, 1);
  assert.equal(updateTask.inputSchema.safeParse({ taskId, priority: 3 }).success, false);
  assert.equal(
    updateTask.inputSchema.safeParse({ taskId, area: "Work" }).success,
    false,
  );
  assert.equal(
    updateTask.inputSchema.safeParse({ taskId, date: "2026-10-20" }).success,
    false,
  );
  assert.equal(
    updateTask.inputSchema.safeParse({ taskId, status: "completed" }).success,
    false,
  );
  assert.equal(
    updateTask.inputSchema.safeParse({ taskId, status: "started" }).success,
    true,
  );
  assert.equal(
    updateTask.inputSchema.safeParse({
      taskId,
      goal: "g".repeat(maxAreaNameLength),
    }).success,
    true,
  );
  assert.equal(
    updateTask.inputSchema.safeParse({
      taskId,
      goal: "g".repeat(maxAreaNameLength + 1),
    }).success,
    false,
  );
  assert.equal(updateTask.description.includes("completes the Task"), false);
  assert.ok(
    updateTask.description.includes(
      "completeTask is the only way to complete a Task.",
    ),
  );
});
