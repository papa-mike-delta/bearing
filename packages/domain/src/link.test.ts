import assert from "node:assert/strict";
import { test } from "node:test";
import { isSelfLink, linkEnd, linkPageSize, taskHref } from "./link.ts";

const taskId = "11111111-1111-4111-8111-111111111111";

test("the home list name opens /tasks/item/:id", () => {
  assert.equal(taskHref(taskId), `/tasks/item/${taskId}`);
});

test("a link end is an owned task, note, or calendar day", () => {
  assert.deepEqual(linkEnd("task", taskId), { kind: "task", id: taskId });
  assert.deepEqual(linkEnd("note", taskId), { kind: "note", id: taskId });
  assert.deepEqual(linkEnd("journal", "2024-02-29"), {
    kind: "journal",
    id: "2024-02-29",
  });
  assert.equal(linkEnd("task", "t1"), null);
  assert.equal(linkEnd("journal", "2023-02-29"), null);
  assert.equal(linkEnd("area", taskId), null);
  assert.equal(linkEnd("journal", "10/09/2026"), null);
  assert.equal(linkPageSize, 20);
});

test("a self-link is the same kind and id", () => {
  const task = linkEnd("task", taskId)!;
  const note = linkEnd("note", taskId)!;
  assert.equal(isSelfLink(task, { ...task }), true);
  assert.equal(isSelfLink(task, note), false);
  assert.equal(
    isSelfLink(
      { kind: "journal", id: "2026-10-09" },
      { kind: "journal", id: "2026-10-10" },
    ),
    false,
  );
});
