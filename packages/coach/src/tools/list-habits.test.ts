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

test("weekly habits retain weekly progress and due; Bad habits have no streak, record or due state", async () => {
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
    { ...rows[0]!, period: "week", due: false },
    { ...rows[1]!, period: "week", bad: true, done: false, due: false, streak: null, record: null },
  ]);
});

test("a weekly once-habit is due only while its current week is empty", async () => {
  const weekly = { ...rows[0]!, period: "week" as const, streak: 3, record: 5 };
  for (const done of [false, true]) {
    const data = { listHabits: async () => [{ ...weekly, done, count: Number(done) }] } as unknown as CoachData;
    const result = await listHabits.run({}, { userId: "owner", today: "2026-10-18", messageId: "message", toolCallId: "weekly", data });
    assert.deepEqual(result.habits, [{ ...weekly, done, count: Number(done), due: !done }]);
  }
  assert.match(listHabits.description, /Monday to Sunday/);
});


test("weekly many-times exposes the requested week's count, goal and done with no streak or record", async () => {
  const calls: [string, string][] = [];
  for (const count of [199, 200, 201, 999]) {
    const weekly: ListedHabit = { id: "weekly-many", name: "Weekly pages", period: "week", trackMode: "many", goalCount: 200, bad: false, count, done: count >= 200, streak: null, record: null };
    const badOnce: ListedHabit = { ...rows[0]!, id: "weekly-bad-once", period: "week", bad: true };
    const badMany: ListedHabit = { ...weekly, id: "weekly-bad-many", bad: true, goalCount: null, done: false };
    const data = { listHabits: async (userId: string, day: string) => { calls.push([userId, day]); return [weekly, badOnce, badMany]; } } as unknown as CoachData;
    const result = await listHabits.run({}, { userId: "owner", today: "2026-10-11", messageId: "message", toolCallId: "read", data });
    assert.deepEqual(result.habits, [
      { ...weekly, due: count < 200 },
      { ...badOnce, done: false, due: false, streak: null, record: null },
      { ...badMany, done: false, due: false, streak: null, record: null },
    ]);
  }
  assert.deepEqual(calls, Array.from({ length: 4 }, () => ["owner", "2026-10-11"]));
  assert.match(listHabits.description, /Weekly many-times returns count, goal and done/);
});
