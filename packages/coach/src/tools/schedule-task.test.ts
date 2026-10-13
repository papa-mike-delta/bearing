import assert from "node:assert/strict";
import { test } from "node:test";
import type { CoachData } from "../data.ts";
import { scheduleTask } from "./schedule-task.ts";

const taskId = "550e8400-e29b-41d4-a716-446655440000";
const messageId = "11111111-1111-4111-8111-111111111111";

function fake(result: { id: string; name: string } | null) {
  const calls: { userId: string; taskId: string; date: string }[] = [];
  const data: CoachData = {
    async getMood() {
      return null;
    },
    async listOpenTasks() {
      return [
        {
          id: taskId,
          name: "Call dentist",
          priority: 0,
          area: "Personal",
          isNext: true,
        },
      ];
    },
    async createTask() {
      throw new Error("createTask was not expected");
    },
    async completeTask() {
      throw new Error("completeTask was not expected");
    },
    async scheduleTask(userId, id, date) {
      calls.push({ userId, taskId: id, date });
      return result;
    },
    async updateTask() {
      throw new Error("updateTask was not expected");
    },
  };
  return { data, calls };
}

const ctx = (data: CoachData) => ({
  userId: "user-7",
  toolCallId: "call_4",
  messageId,
  data,
});

test("scheduleTask passes the Task and the date, and does not take an Area", async () => {
  const { data, calls } = fake({ id: taskId, name: "Call dentist" });
  const result = await scheduleTask.run(
    { taskId, date: "2026-10-20" },
    ctx(data),
  );
  assert.equal(result.id, taskId);
  assert.deepEqual(calls, [
    { userId: "user-7", taskId, date: "2026-10-20" },
  ]);
});

test("scheduleTask reports refused for today, and invalidId for a bad id", async () => {
  const { data, calls } = fake(null);
  assert.deepEqual(
    await scheduleTask.run({ taskId, date: "2026-10-09" }, ctx(data)),
    { refused: true },
  );
  assert.deepEqual(await scheduleTask.run({ taskId: "nope", date: "2026-10-20" }, ctx(data)), {
    invalidId: true,
  });
  assert.equal(calls.length, 1);
});
