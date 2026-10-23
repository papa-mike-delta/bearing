import { spawnTask } from "./recurring-task.ts";
import assert from "node:assert/strict";
import { test } from "node:test";
import { maxTaskNameLength, maxTaskNoteLength, newTask } from "./task.ts";

test("a new task's name is trimmed and the note defaults to empty", () => {
  assert.deepEqual(newTask({ name: "  Buy milk " }), {
    name: "Buy milk",
    note: "",
  });
});

test("a blank name is refused", () => {
  assert.equal(newTask({ name: "" }), null);
  assert.equal(newTask({ name: " \t\n" }), null);
});

test("a name or note over the limit is refused", () => {
  assert.ok(newTask({ name: "x".repeat(maxTaskNameLength) }));
  assert.equal(newTask({ name: "x".repeat(maxTaskNameLength + 1) }), null);
  assert.equal(
    newTask({ name: "ok", note: "x".repeat(maxTaskNoteLength + 1) }),
    null,
  );
});

test("completing a recurring Task copies its fields and slips from completion day without links", () => {
  const task = { name: "Pay rent", note: "Bank", priority: -1, goalId: "home", areaId: "personal", rule: { every: 1, unit: "months" as const, on: 3 }, date: "2026-01-03", related: ["old"] };
  assert.deepEqual(spawnTask(task, "2026-02-20"), { name: "Pay rent", note: "Bank", priority: -1, goalId: "home", areaId: "personal", rule: task.rule, date: "2026-03-03" });
  assert.equal(spawnTask({ ...task, rule: null }, "2026-02-20"), null);
  assert.equal(spawnTask(task, "2026-03-03")?.date, "2026-04-03");
});
