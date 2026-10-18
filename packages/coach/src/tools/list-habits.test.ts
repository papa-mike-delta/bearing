import assert from "node:assert/strict";
import { test } from "node:test";
import type { CoachData, ListedHabit } from "../data.ts";
import { listHabits } from "./list-habits.ts";

const rows: ListedHabit[] = [
  { id: "once", name: "Walk", period: "day", trackMode: "once", goalCount: null, bad: false, count: 1, done: true, streak: 2, record: 5 },
  { id: "many", name: "Water", period: "day", trackMode: "many", goalCount: 3, bad: false, count: 2, done: false, streak: null, record: null },
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

test("Bad habits are never due, including unfinished once and many-times habits", async () => {
  const bad = rows.map((row) => ({ ...row, bad: true, done: false, count: 0 }));
  const data = { listHabits: async () => bad } as unknown as CoachData;
  const result = await listHabits.run({}, { userId: "account", messageId: "message", toolCallId: "read", today: "2026-10-08", data });
  assert.deepEqual(result.habits.map(({ bad, done, due, streak, record }) => ({ bad, done, due, streak, record })), bad.map(() => ({ bad: true, done: false, due: false, streak: null, record: null })));
  assert.match(listHabits.description, /Bad habits have no streak or record, are never done or due/);
});

test("weekly habits are excluded and Bad daily habits have no streak, record or due state", async () => {
  const bad = { ...rows[0]!, id: "bad", bad: true };
  const data = { listHabits: async () => [
    ...rows, bad,
    { ...rows[0]!, period: "week" as const },
    { ...rows[1]!, period: "week" as const, bad: true },
  ] } as unknown as CoachData;
  const result = await listHabits.run({}, { userId: "account", messageId: "message", toolCallId: "read", today: "2026-10-08", data });
  assert.deepEqual(result.habits, [
    { ...rows[0]!, due: false },
    { ...rows[1]!, due: true },
    { ...bad, done: false, due: false, streak: null, record: null },
  ]);
});
