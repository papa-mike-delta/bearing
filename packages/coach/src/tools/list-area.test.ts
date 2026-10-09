import assert from "node:assert/strict";
import { test } from "node:test";
import type { CoachData, ListedTask } from "../data.ts";
import { listArea } from "./list-area.ts";

// A fake data interface that returns `tasks` and records who asked.
function fake(tasks: ListedTask[]) {
  const asked: string[] = [];
  const data: CoachData = {
    async listOpenTasks(userId) {
      asked.push(userId);
      return tasks;
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
    async updateTask() {
      throw new Error("updateTask was not expected");
    },
  };
  return { data, asked };
}

const run = (data: CoachData, userId = "user-1") =>
  listArea.run(
    {},
    {
      userId,
      toolCallId: "call_1",
      messageId: "11111111-1111-4111-8111-111111111111",
      data,
    },
  );

const task = (id: string, priority: number, isNext = false) => ({
  id,
  name: `Task ${id}`,
  priority,
  area: "Tasks",
  isNext,
});

test("listArea returns the Tasks in the order given, with Next marked", async () => {
  const tasks = [task("b", 2, true), task("a", 0), task("c", -1)];
  const { data, asked } = fake(tasks);
  assert.deepEqual(await run(data, "user-7"), { open: 3, tasks });
  assert.deepEqual(asked, ["user-7"]);
});

test("listArea returns an empty list when there are no open Tasks", async () => {
  assert.deepEqual(await run(fake([]).data), { open: 0, tasks: [] });
});

test("listArea lists the first 50 Tasks only, but counts them all", async () => {
  const tasks = Array.from({ length: 55 }, (_, i) =>
    task(String(i), 0, i === 0),
  );
  const result = await run(fake(tasks).data);
  assert.equal(result.open, 55);
  assert.equal(result.tasks.length, 50);
  assert.deepEqual(
    [result.tasks[0]?.name, result.tasks[49]?.name],
    ["Task 0", "Task 49"],
  );
});

test("listArea takes no input, so the model can't pass a user id", () => {
  assert.deepEqual(listArea.inputSchema.parse({ userId: "someone" }), {});
  assert.throws(() => listArea.inputSchema.parse("all users"));
});
