import assert from "node:assert/strict";
import { test } from "node:test";
import {
  maxPriority,
  minPriority,
  nextTask,
  normalPriority,
  priorityList,
  stepPriority,
} from "./priority-list.ts";

const task = (name: string, day: number, priority = normalPriority) => ({
  id: name,
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

test("priority steps one at a time between lowest and highest", () => {
  assert.equal(stepPriority(normalPriority, 1), 1);
  assert.equal(stepPriority(normalPriority, -1), -1);
  assert.equal(stepPriority(1, 1), maxPriority);
  assert.equal(stepPriority(-1, -1), minPriority);
});

test("priority stops at the top and bottom of the scale", () => {
  assert.equal(stepPriority(maxPriority, 1), maxPriority);
  assert.equal(stepPriority(minPriority, -1), minPriority);
});

test("raising a task moves it up, lowering it moves it down", () => {
  const older = task("older", 1);
  const newer = task("newer", 2);
  const raised = { ...newer, priority: stepPriority(newer.priority, 1) };
  assert.deepEqual(names(priorityList([older, raised])), ["newer", "older"]);
  const lowered = { ...older, priority: stepPriority(older.priority, -1) };
  assert.deepEqual(names(priorityList([lowered, newer])), ["newer", "older"]);
});

test("completing the next task moves the mark to the new first task", () => {
  const first = task("first", 1, 1);
  const second = task("second", 2);
  assert.equal(nextTask([first, second])?.name, "first");
  const done = { ...first, completedAt: new Date(2026, 0, 3) };
  assert.equal(nextTask([done, second])?.name, "second");
  assert.equal(
    nextTask([done, { ...second, completedAt: done.completedAt }]),
    null,
  );
});

test("tasks with equal priority and age are ordered by id", () => {
  const list = priorityList([task("b", 1), task("c", 1), task("a", 1)]);
  assert.deepEqual(names(list), ["a", "b", "c"]);
});
