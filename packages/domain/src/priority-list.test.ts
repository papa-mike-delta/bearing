import assert from "node:assert/strict";
import { test } from "node:test";
import { nextTask, normalPriority, priorityList } from "./priority-list.ts";

const task = (name: string, day: number, priority = normalPriority) => ({
  name,
  priority,
  createdAt: new Date(2026, 0, day),
  completedAt: null as Date | null,
});
const names = (tasks: { name: string }[]) => tasks.map((t) => t.name);

test("completed tasks leave the open list", () => {
  const done = { ...task("done", 1), completedAt: new Date(2026, 0, 5) };
  assert.deepEqual(names(priorityList([done, task("open", 2)])), ["open"]);
});

test("equal priority lists the oldest task first", () => {
  const list = priorityList([
    task("newer", 3),
    task("oldest", 1),
    task("older", 2),
  ]);
  assert.deepEqual(names(list), ["oldest", "older", "newer"]);
});

test("higher priority comes before older tasks", () => {
  const list = priorityList([task("old normal", 1), task("new high", 9, 2)]);
  assert.deepEqual(names(list), ["new high", "old normal"]);
});

test("next is the first open task, or nothing when the list is empty", () => {
  const done = { ...task("done", 1), completedAt: new Date(2026, 0, 5) };
  assert.equal(
    nextTask([task("newer", 3), done, task("older", 2)])?.name,
    "older",
  );
  assert.equal(nextTask([done]), null);
  assert.equal(nextTask([]), null);
});
