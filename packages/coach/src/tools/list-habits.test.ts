import assert from "node:assert/strict";
import { test } from "node:test";
import type { CoachData, ListedHabit } from "../data.ts";
import { listHabits } from "./list-habits.ts";

const rows: ListedHabit[] = [
  { id: "once", name: "Walk", period: "day", trackMode: "once", goalCount: null, bad: false, count: 1, done: true, streak: 2 },
  { id: "many", name: "Water", period: "day", trackMode: "many", goalCount: 3, bad: false, count: 2, done: false, streak: null },
];

test("listHabits reads this account's progress using the turn's browser today", async () => {
  const calls: [string, string][] = [];
  const data = { listHabits: async (userId: string, today: string) => { calls.push([userId, today]); return rows; } } as CoachData;
  const context = { userId: "account", messageId: "message", toolCallId: "read", today: "2026-10-08", data };
  assert.deepEqual(await listHabits.run({}, context), { habits: rows.map((row) => ({ ...row, due: !row.done })) });
  assert.deepEqual(calls, [["account", "2026-10-08"]]);
  for (const today of [undefined, "", "2026-02-31"]) await assert.rejects(listHabits.run({}, { ...context, today }), /browser's Today/);
  assert.equal(calls.length, 1);
});

test("a habit not yet done today is due", async () => {
  const data = { listHabits: async () => rows } as unknown as CoachData;
  const result = await listHabits.run({}, { userId: "account", messageId: "message", toolCallId: "read", today: "2026-10-08", data });
  assert.deepEqual(result.habits.map((habit) => [habit.name, habit.due]), [["Walk", false], ["Water", true]]);
  assert.match(listHabits.description, /due today/);
});
