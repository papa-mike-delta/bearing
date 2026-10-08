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
