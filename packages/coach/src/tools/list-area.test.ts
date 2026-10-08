import assert from "node:assert/strict";
import { test } from "node:test";
import type { CoachData, ListedTask } from "../data.ts";
import { receipt } from "../receipts.ts";
import { listArea, maxListedTasks } from "./list-area.ts";

// A fake data interface that returns `tasks` and records who asked.
function fake(tasks: ListedTask[]) {
  const asked: string[] = [];
  const data: CoachData = {
    async listOpenTasks(userId) {
      asked.push(userId);
      return tasks;
    },
  };
  return { data, asked };
}

const run = (data: CoachData, userId = "user-1") =>
  listArea.run({}, { userId, toolCallId: "call_1", data });

const task = (id: string, priority: number, isNext = false) => ({
  id,
  name: `Task ${id}`,
  priority,
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

test("listArea lists the first Tasks only, but counts them all", async () => {
  const tasks = Array.from({ length: maxListedTasks + 5 }, (_, i) =>
    task(String(i), 0, i === 0),
  );
  const result = await run(fake(tasks).data);
  assert.equal(result.open, maxListedTasks + 5);
  assert.deepEqual(result.tasks, tasks.slice(0, maxListedTasks));
});

test("listArea takes no input, so the model can't pass a user id", () => {
  assert.deepEqual(listArea.inputSchema.parse({ userId: "someone" }), {});
  assert.throws(() => listArea.inputSchema.parse("all users"));
});

test("a listArea call reads as a one-line receipt", () => {
  const part = { type: "tool-listArea" };
  assert.equal(
    receipt({ ...part, state: "output-available", output: { open: 4 } }),
    "Read your list (4 open)",
  );
  assert.equal(
    receipt({ ...part, state: "output-available", output: { open: 0 } }),
    "Read your list (0 open)",
  );
  assert.equal(
    receipt({ ...part, state: "input-available" }),
    "Reading your list…",
  );
  assert.equal(
    receipt({ ...part, state: "output-error" }),
    "Couldn't read your list",
  );
  assert.equal(receipt({ type: "text" }), null);
  assert.equal(
    receipt({ type: "tool-somethingElse", state: "output-available" }),
    null,
  );
});
