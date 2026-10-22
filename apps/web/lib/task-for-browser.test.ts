import assert from "node:assert/strict";
import { test } from "node:test";
import { taskForBrowser } from "./task-for-browser.ts";

test("Task row and page browser fields preserve the repeat rule and date in every workflow", () => {
  const task = {
    id: "task",
    areaId: "area",
    name: "Pay rent",
    note: "",
    priority: 0,
    status: "later" as const,
    previousStatus: null,
    age: "2026-02-20",
    date: "2026-03-03",
    goalId: null,
    createdAt: new Date("2026-02-20T12:00:00Z"),
    completedAt: null,
    rule: { every: 1, unit: "months" as const, on: 3 },
  };
  assert.deepEqual(taskForBrowser(task), {
    ...task,
    createdAt: "2026-02-20T12:00:00.000Z",
  });
});
