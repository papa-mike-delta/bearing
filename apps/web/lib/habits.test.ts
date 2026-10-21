import type { HabitTrackResult } from "@repo/coach";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, test } from "node:test";
import { createDb, habitMarks, habitOperations, habits, users } from "@repo/db";
import { listHabits as coachListHabits, receipt } from "@repo/coach";
import { sql, eq, inArray } from "drizzle-orm";
import { coachData, coachTools } from "./coach-tools.ts";
import { closeTools } from "./daily-close/tools.ts";
import type { HabitEdit } from "@repo/domain";
import { setHabitCount, createCoachHabit, trackCoachHabit as trackCoachHabitResult, changeHabitDayCount, countUnfinishedHabits, createHabit, deleteHabit, editHabit, moveHabit, listHabits, setHabitDay } from "./habits.ts";

const url = process.env.TEST_POSTGRES_URL;
if (!url && process.env.CI) test("Habit database tests require Postgres in CI", () => assert.fail("TEST_POSTGRES_URL missing"));

const today = "2026-10-08";
const week = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"];

// Tests read both shapes: a tracked state or an undo refusal.
const trackCoachHabit = (...args: Parameters<typeof trackCoachHabitResult>) =>
  trackCoachHabitResult(...args) as Promise<HabitTrackResult & { refused?: true; reason?: string; question?: string }>;

describe("Habit persistence", { skip: !url && "TEST_POSTGRES_URL missing", concurrency: 1 }, () => {
  const db = createDb(url!);
  const a = randomUUID(), b = randomUUID();
  before(async () => {
    await db.insert(users).values([a, b].map((id) => ({ id, email: `${id}@test.invalid`, passwordHash: "-" })));
  });
  after(async () => {
    await db.delete(habits).where(inArray(habits.userId, [a, b]));
    await db.delete(users).where(inArray(users.id, [a, b]));
    await db.$client.end();
  });

  test("set Habit counts preserves ownership, caps, periods, unchanged rows and progress", async () => {
    const created: string[] = [];
    for (const period of ["day", "week"] as const) for (const bad of [false, true]) {
      const cap = period === "day" ? 99 : 999;
      const habit = await createHabit(a, { name: "Typed count", period, trackMode: "many", goalCount: 3, bad }, db);
      created.push(habit.id);
      const set = (count: number) => setHabitCount(a, habit.id, today, count, today, db);
      const marks = () => db.select({ day: habitMarks.day, count: habitMarks.count, version: sql<string>`xmin::text` }).from(habitMarks).where(eq(habitMarks.habitId, habit.id));
      assert.deepEqual(await set(8), { count: 8, done: !bad, changed: true });
      const before = await marks();
      assert.equal(before[0]?.day, period === "week" ? "2026-10-05" : today);
      assert.deepEqual(await set(8), { count: 8, done: !bad, changed: false });
      assert.deepEqual(await marks(), before); // xmin catches even an equal-value UPDATE.
      for (const count of [cap + 1, -1, 2.5, NaN]) await assert.rejects(set(count), new RegExp(`Up to ${cap}`));
      await assert.rejects(setHabitCount(b, habit.id, today, 7, today, db), /unavailable/);
      await assert.rejects(setHabitCount(a, habit.id, "2026-10-12", 7, today, db), /not open yet/);
      assert.deepEqual(await marks(), before);
      assert.equal((await set(cap)).count, cap);
      const listed = (await listHabits(a, today, week, db)).find((row) => row.id === habit.id)!;
      assert.equal(listed.count, cap);
      assert.equal(listed.done, !bad);
      assert.deepEqual(await set(0), { count: 0, done: false, changed: true });
      assert.deepEqual(await marks(), []);
      assert.deepEqual(await set(0), { count: 0, done: false, changed: false });
    }
    const once = await createHabit(a, "Once", db);
    created.push(once.id);
    await assert.rejects(setHabitCount(a, once.id, today, 8, today, db), /unavailable/);
    await db.delete(habits).where(inArray(habits.id, created));
  });

  test("a new habit is first, duplicates are kept, and a bad name stores nothing", async () => {
    const first = await createHabit(a, "  Floss  ", db);
    const second = await createHabit(a, "Floss", db);
    assert.deepEqual((await listHabits(a, today, week, db)).map((habit) => habit.name), ["Floss", "Floss"]);
    assert.equal((await listHabits(a, today, week, db))[0]?.id, second.id);
    assert.notEqual(first.id, second.id);
    await assert.rejects(createHabit(a, "", db), /Enter a habit name/);
    await assert.rejects(createHabit(a, " \t\n ", db), /Enter a habit name/);
    await assert.rejects(createHabit(a, "a".repeat(201), db), /at most 200 characters; this one has 201/);
    assert.equal((await createHabit(a, ` ${"b".repeat(200)} `, db)).name.length, 200);
    await assert.rejects(db.insert(habits).values({ userId: a, name: "", position: 0 }));
    await assert.rejects(db.insert(habits).values({ userId: a, name: "a".repeat(201), position: 0 }));
    assert.equal((await listHabits(a, today, week, db)).length, 3);
    assert.equal(await countUnfinishedHabits(a, today, db), 3);
  });

  test("today and a past day save, a future day does not, and unchecking removes the mark", async () => {
    const habit = await createHabit(a, "Walk", db);
    assert.deepEqual(await setHabitDay(a, habit.id, "2026-10-05", true, today, db), { done: false, streak: 0, record: 1 });
    await setHabitDay(a, habit.id, "2026-10-06", true, today, db);
    await setHabitDay(a, habit.id, "2026-10-07", true, today, db);
    const open = (await listHabits(a, today, week, db)).find((row) => row.id === habit.id)!;
    assert.equal(open.done, false);
    assert.equal(open.streak, 3);
    assert.equal(open.record, 3);
    assert.deepEqual(await setHabitDay(a, habit.id, today, true, today, db), { done: true, streak: 4, record: 4 });
    await setHabitDay(a, habit.id, today, true, today, db);
    assert.equal((await db.select().from(habitMarks).where(eq(habitMarks.habitId, habit.id))).length, 4);
    await assert.rejects(setHabitDay(a, habit.id, "2026-10-09", true, today, db), /not open yet/);
    assert.equal((await db.select().from(habitMarks).where(eq(habitMarks.habitId, habit.id))).length, 4);
    assert.deepEqual(await setHabitDay(a, habit.id, "2026-10-07", false, today, db), { done: true, streak: 1, record: 2 });
    assert.equal((await listHabits(a, today, week, db)).find((row) => row.id === habit.id)?.marked.includes("2026-10-07"), false);
    await setHabitDay(a, habit.id, "2026-09-28", true, today, db);
    assert.equal((await listHabits(a, today, week, db)).find((row) => row.id === habit.id)?.marked.includes("2026-09-28"), false);
  });

  test("another account cannot read, check, or delete, and delete removes the marks", async () => {
    const habit = await createHabit(a, "Private", db);
    await setHabitDay(a, habit.id, today, true, today, db);
    assert.equal((await listHabits(b, today, week, db)).some((row) => row.id === habit.id), false);
    await assert.rejects(setHabitDay(b, habit.id, today, false, today, db), /unavailable/);
    await assert.rejects(setHabitDay(a, "not-a-uuid", today, true, today, db), /unavailable/);
    assert.equal(await deleteHabit(b, habit.id, db), false);
    assert.equal(await deleteHabit(a, "not-a-uuid", db), false);
    assert.equal((await listHabits(a, today, week, db)).some((row) => row.id === habit.id), true);
    assert.equal(await deleteHabit(a, habit.id, db), true);
    assert.equal((await db.select().from(habitMarks).where(eq(habitMarks.habitId, habit.id))).length, 0);
    assert.equal(await deleteHabit(a, habit.id, db), false);
    const owned = await createHabit(b, "Gone with the account", db);
    await setHabitDay(b, owned.id, today, true, today, db);
    await db.delete(users).where(eq(users.id, b));
    assert.equal((await db.select().from(habits).where(eq(habits.id, owned.id))).length, 0);
    assert.equal((await db.select().from(habitMarks).where(eq(habitMarks.habitId, owned.id))).length, 0);
    await db.insert(users).values({ id: b, email: `${b}@test.invalid`, passwordHash: "-" });
  });

  test("schema defaults preserve once-habits and enforce the habits epic's bounds", async () => {
    const [once] = await db.insert(habits).values({ userId: a, name: "Defaults", position: 0 }).returning();
    assert.equal(once!.period, "day");
    assert.equal(once!.trackMode, "once");
    assert.equal(once!.goalCount, null);
    assert.equal(once!.bad, false);
    for (const options of [
      { trackMode: "once" as const, goalCount: 1 },
      { trackMode: "many" as const, goalCount: null },
      { trackMode: "many" as const, goalCount: 0 },
      { trackMode: "many" as const, goalCount: 100 },
      { period: "week" as const, trackMode: "many" as const, goalCount: 1000 },
    ]) await assert.rejects(db.insert(habits).values({ userId: a, name: "Invalid", position: 0, ...options }));
    const [weekly] = await db.insert(habits).values({ userId: a, name: "Weekly", position: 0, period: "week", trackMode: "many", goalCount: 999 }).returning();
    const [bad] = await db.insert(habits).values({ userId: a, name: "Bad", position: 0, trackMode: "many", bad: true }).returning();
    for (const count of [0, 1000]) await assert.rejects(db.insert(habitMarks).values({ habitId: weekly!.id, day: "2026-10-05", count }));
    await db.insert(habitMarks).values({ habitId: weekly!.id, day: "2026-10-05", count: 999 });
    await db.insert(habitMarks).values({ habitId: once!.id, day: today });
    assert.equal((await db.select().from(habitMarks).where(eq(habitMarks.habitId, once!.id)))[0]!.count, 1);
    await db.delete(habits).where(inArray(habits.id, [once!.id, weekly!.id, bad!.id]));
  });

  test("many-times creation requires a whole-number daily goal and stores nothing on refusal", async () => {
    const before = (await listHabits(a, today, week, db)).length;
    for (const goalCount of [undefined, null, 0, 100, 1.5]) {
      await assert.rejects(createHabit(a, { name: "Water", trackMode: "many", goalCount }, db), /whole-number daily goal between 1 and 99/);
    }
    assert.equal((await listHabits(a, today, week, db)).length, before);
    const habit = await createHabit(a, { name: "Water", trackMode: "many", goalCount: 3 }, db);
    const row = (await listHabits(a, today, week, db)).find((row) => row.id === habit.id)!;
    assert.equal(row.trackMode, "many");
    assert.equal(row.goalCount, 3);
    assert.equal(row.count, 0);
    assert.equal(row.done, false);
    assert.equal(row.streak, null);
    assert.equal(row.record, null);
  });

  test("counts reach the goal, exceed it, refuse 100, and delete at the floor", async () => {
    const habit = await createHabit(a, { name: "Count", trackMode: "many", goalCount: 3 }, db);
    const before = await countUnfinishedHabits(a, today, db);
    for (let count = 1; count <= 99; count++) {
      assert.deepEqual(await changeHabitDayCount(a, habit.id, today, 1, today, db), { count, done: count >= 3 });
      if (count <= 4) assert.equal(await countUnfinishedHabits(a, today, db), before - (count >= 3 ? 1 : 0));
    }
    await assert.rejects(changeHabitDayCount(a, habit.id, today, 1, today, db), /daily count can be at most 99/);
    assert.equal((await listHabits(a, today, week, db)).find((row) => row.id === habit.id)?.count, 99);
    for (let count = 98; count >= 0; count--) {
      assert.deepEqual(await changeHabitDayCount(a, habit.id, today, -1, today, db), { count, done: count >= 3 });
    }
    assert.equal((await db.select().from(habitMarks).where(eq(habitMarks.habitId, habit.id))).length, 0);
    await assert.rejects(changeHabitDayCount(a, habit.id, today, -1, today, db), /already 0/);
    assert.equal(await countUnfinishedHabits(a, today, db), before);
  });

  test("count changes allow past days, refuse future days and another account, and preserve once-habits", async () => {
    const habit = await createHabit(a, { name: "Past count", trackMode: "many", goalCount: 3 }, db);
    await changeHabitDayCount(a, habit.id, "2026-10-05", 1, today, db);
    await changeHabitDayCount(a, habit.id, "2026-10-05", 1, today, db);
    assert.deepEqual(await changeHabitDayCount(a, habit.id, "2026-10-05", -1, today, db), { count: 1, done: false });
    for (const delta of [1, -1] as const) {
      await assert.rejects(changeHabitDayCount(a, habit.id, "2026-10-09", delta, today, db), /not open yet/);
      await assert.rejects(changeHabitDayCount(b, habit.id, "2026-10-05", delta, today, db), /unavailable/);
    }
    await assert.rejects(setHabitDay(a, habit.id, today, true, today, db), /unavailable/);
    const row = (await listHabits(a, today, week, db)).find((row) => row.id === habit.id)!;
    assert.equal(row.counts["2026-10-05"], 1);
    assert.equal(row.counts["2026-10-09"], 0);
    assert.equal(row.count, 0);
    const once = await createHabit(a, "Still once", db);
    await assert.rejects(changeHabitDayCount(a, once.id, today, 1, today, db), /unavailable/);
    assert.equal((await setHabitDay(a, once.id, today, true, today, db)).done, true);
  });

  test("concurrent counts preserve each increment and refuse at the cap", async () => {
    const habit = await createHabit(a, { name: "Concurrent", trackMode: "many", goalCount: 3 }, db);
    await Promise.all(Array.from({ length: 5 }, () => changeHabitDayCount(a, habit.id, today, 1, today, db)));
    assert.equal((await listHabits(a, today, week, db)).find((row) => row.id === habit.id)?.count, 5);
    await db.update(habitMarks).set({ count: 98 }).where(eq(habitMarks.habitId, habit.id));
    const results = await Promise.allSettled([1, 2].map(() => changeHabitDayCount(a, habit.id, today, 1, today, db)));
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(results.filter((result) => result.status === "rejected").length, 1);
    assert.equal((await listHabits(a, today, week, db)).find((row) => row.id === habit.id)?.count, 99);
  });

  test("concurrent minus at count 1 succeeds once and deletes the mark once", async () => {
    const habit = await createHabit(a, { name: "Minus race", trackMode: "many", goalCount: 2 }, db);
    await changeHabitDayCount(a, habit.id, today, 1, today, db);
    const results = await Promise.allSettled([1, 2].map(() => changeHabitDayCount(a, habit.id, today, -1, today, db)));
    assert.deepEqual(results.filter((result) => result.status === "fulfilled").map((result) => result.value), [{ count: 0, done: false }]);
    const rejected = results.filter((result) => result.status === "rejected");
    assert.equal(rejected.length, 1);
    assert.match(String(rejected[0]!.reason), /already 0/);
    assert.equal((await db.select().from(habitMarks).where(eq(habitMarks.habitId, habit.id))).length, 0);
    await db.delete(habits).where(eq(habits.id, habit.id));
  });

  test("the Coach adapter reads all habits for this account and the requested browser day", async () => {
    const many = await createHabit(b, { name: "Coach water", trackMode: "many", goalCount: 3 }, db);
    const once = await createHabit(b, "Coach walk", db);
    await changeHabitDayCount(b, many.id, today, 1, today, db);
    await setHabitDay(b, once.id, today, true, today, db);
    await db.insert(habits).values(Array.from({ length: 25 }, (_, i) => ({ userId: b, name: `Extra ${i}`, position: i })));
    const adapter = coachData(db, "2026-10-07");
    const rows = await adapter.listHabits!(b, today);
    assert.equal(rows.length, 27);
    assert.deepEqual(rows.find((row) => row.id === many.id), { id: many.id, name: "Coach water", period: "day", trackMode: "many", goalCount: 3, bad: false, count: 1, done: false, streak: null, record: null });
    assert.equal(rows.find((row) => row.id === once.id)?.streak, 1);
    assert.equal(rows.find((row) => row.id === once.id)?.done, true);
    assert.equal((await adapter.listHabits!(b, "2026-10-07")).find((row) => row.id === many.id)?.count, 0);
    assert.equal((await adapter.listHabits!(a, today)).some((row) => row.id === many.id), false);
    await db.delete(habits).where(eq(habits.userId, b));
  });

  test("Bad once-habits check and uncheck without completion, streaks, records or unfinished counts", async () => {
    const before = await countUnfinishedHabits(a, today, db);
    const habit = await createHabit(a, { name: "Late scrolling", bad: true }, db);
    for (const checked of [false, true, false]) {
      assert.deepEqual(await setHabitDay(a, habit.id, today, checked, today, db), { done: false, streak: null, record: null });
      const row = (await listHabits(a, today, week, db)).find((row) => row.id === habit.id)!;
      assert.equal(row.bad, true);
      assert.equal(row.done, false);
      assert.equal(row.streak, null);
      assert.equal(row.record, null);
      assert.equal(row.marked.includes(today), checked);
      assert.equal(await countUnfinishedHabits(a, today, db), before);
    }
  });

  test("Bad many-times may omit a goal and counts to 99; a supplied goal is a limit, never completion", async () => {
    const before = await countUnfinishedHabits(a, today, db);
    for (const goalCount of [undefined, null, 3]) {
      const habit = await createHabit(a, { name: "Occurrences", trackMode: "many", goalCount, bad: true }, db);
      const read = async () => (await listHabits(a, today, week, db)).find((row) => row.id === habit.id)!;
      assert.equal((await read()).goalCount, goalCount ?? null);
      assert.equal((await read()).bad, true);
      assert.deepEqual(await changeHabitDayCount(a, habit.id, today, 1, today, db), { count: 1, done: false });
      await db.update(habitMarks).set({ count: 98 }).where(eq(habitMarks.habitId, habit.id));
      assert.deepEqual(await changeHabitDayCount(a, habit.id, today, 1, today, db), { count: 99, done: false });
      await assert.rejects(changeHabitDayCount(a, habit.id, today, 1, today, db), /at most 99/);
      assert.equal((await read()).count, 99);
      assert.equal((await read()).done, false);
      assert.equal((await read()).streak, null);
      assert.equal((await read()).record, null);
      assert.equal(await countUnfinishedHabits(a, today, db), before);
      assert.deepEqual(await changeHabitDayCount(a, habit.id, today, -1, today, db), { count: 98, done: false });
    }
    const stored = (await listHabits(a, today, week, db)).length;
    for (const goalCount of [0, 100, 1.5]) await assert.rejects(createHabit(a, { name: "Invalid limit", trackMode: "many", goalCount, bad: true }, db), /whole-number limit/);
    assert.equal((await listHabits(a, today, week, db)).length, stored);
  });

  test("another account cannot flip, log or count Bad habits", async () => {
    const once = await createHabit(a, { name: "Private lapse", bad: true }, db);
    const many = await createHabit(a, { name: "Private count", bad: true, trackMode: "many" }, db);
    await setHabitDay(a, once.id, today, true, today, db);
    await changeHabitDayCount(a, many.id, today, 1, today, db);
    for (const checked of [true, false]) {
      for (const day of [today, "2026-10-07"]) await assert.rejects(setHabitDay(b, once.id, day, checked, today, db), /unavailable/);
    }
    for (const delta of [1, -1] as const) await assert.rejects(changeHabitDayCount(b, many.id, today, delta, today, db), /unavailable/);
    const rows = await listHabits(a, today, week, db);
    assert.equal(rows.find((row) => row.id === once.id)?.marked.includes(today), true);
    assert.equal(rows.find((row) => row.id === many.id)?.count, 1);
    assert.equal((await listHabits(b, today, week, db)).some((row) => [once.id, many.id].includes(row.id)), false);
  });

  test("minus decrements a stored daily count above 99 normally", async () => {
    const habit = await createHabit(a, { name: "High stored count", trackMode: "many", goalCount: 3 }, db);
    await db.insert(habitMarks).values({ habitId: habit.id, day: today, count: 101 });
    assert.equal((await listHabits(a, today, week, db)).find((row) => row.id === habit.id)?.done, true);
    assert.deepEqual(await changeHabitDayCount(a, habit.id, today, -1, today, db), { count: 100, done: true });
    assert.deepEqual(await changeHabitDayCount(a, habit.id, today, -1, today, db), { count: 99, done: true });
  });

  test("the Coach includes daily and weekly habits and receipts count every listed habit", async () => {
    const once = await createHabit(b, { name: "Bad once", bad: true }, db);
    const many = await createHabit(b, { name: "Bad many", trackMode: "many", bad: true }, db);
    await setHabitDay(b, once.id, today, true, today, db);
    await changeHabitDayCount(b, many.id, today, 1, today, db);
    await db.insert(habits).values([
      { userId: b, name: "Weekly", period: "week", position: 0 },
    ]);
    const data = coachData(db);
    const rows = await data.listHabits!(b, today);
    assert.equal(rows.length, 3);
    assert.ok(rows.filter((row) => row.period === "day").every((row) => row.bad && row.period === "day" && !row.done && row.streak === null && row.record === null));
    const { habits: listed } = await coachListHabits.run({}, { userId: b, today, data, messageId: "message", toolCallId: "read" });
    assert.ok(listed.filter((row) => row.period === "day").every((row) => row.bad && !row.due && row.streak === null && row.record === null));
    assert.deepEqual(listed.find((row) => row.period === "week"), { ...rows.find((row) => row.period === "week"), due: true });
    assert.equal(receipt({ type: "tool-listHabits", state: "output-available", output: { habits: listed } }), "Read your habits (3)");
    await db.delete(habits).where(eq(habits.userId, b));
  });

  test("the unfinished count is today's unmarked habits, not another day", async () => {
    const habit = await createHabit(a, "Read", db);
    await setHabitDay(a, habit.id, "2026-10-07", true, today, db);
    const before = await countUnfinishedHabits(a, today, db);
    await setHabitDay(a, habit.id, today, true, today, db);
    assert.equal(await countUnfinishedHabits(a, today, db), before - 1);
    await setHabitDay(a, habit.id, today, false, today, db);
    assert.equal(await countUnfinishedHabits(a, today, db), before);
    assert.equal(await countUnfinishedHabits(b, today, db), 0);
    await assert.rejects(countUnfinishedHabits(a, "2026-02-31", db), /calendar day/);
  });
  test("weekly once creation has no gate or habit limit", async () => {
    const before = (await listHabits(a, today, week, db)).length;
    for (let i = 0; i < 10; i++) await createHabit(a, { name: `Weekly ${i}`, period: "week" }, db);
    assert.equal((await listHabits(a, today, week, db)).length, before + 10);
  });

  test("weekly checks store Monday whichever day was clicked, refuse future weeks and enforce ownership", async () => {
    const habit = await createHabit(a, { name: "Weekly walk", period: "week" }, db);
    const baseline = await countUnfinishedHabits(a, today, db);
    for (const day of week) {
      assert.deepEqual(await setHabitDay(a, habit.id, day, true, today, db), { done: true, streak: 1, record: 1 });
      const marks = await db.select().from(habitMarks).where(eq(habitMarks.habitId, habit.id));
      assert.deepEqual(marks.map(({ day }) => day), ["2026-10-05"]);
      assert.equal(await countUnfinishedHabits(a, today, db), baseline - 1);
      await setHabitDay(a, habit.id, day, false, today, db);
      assert.equal((await db.select().from(habitMarks).where(eq(habitMarks.habitId, habit.id))).length, 0);
    }
    for (const checked of [true, false]) {
      await assert.rejects(setHabitDay(a, habit.id, "2026-10-12", checked, today, db), /not open yet/);
      await assert.rejects(setHabitDay(b, habit.id, today, checked, today, db), /unavailable/);
    }
    assert.equal((await listHabits(b, today, week, db)).some((row) => row.id === habit.id), false);
    for (const day of ["2026-09-20", "2026-09-27", "2026-10-04"]) await setHabitDay(a, habit.id, day, true, today, db);
    const shown = ["2026-09-14", "2026-09-21", "2026-09-28", "2026-10-05"];
    const read = async (days = shown) => (await listHabits(a, today, days, db)).find((row) => row.id === habit.id)!;
    assert.deepEqual((await read()).marked, shown.slice(0, 3));
    assert.equal((await read()).streak, 3);
    assert.equal((await read()).record, 3);
    assert.equal((await read()).done, false);
    assert.equal(await countUnfinishedHabits(a, today, db), baseline);
    await setHabitDay(a, habit.id, today, true, today, db);
    assert.equal((await read()).streak, 4);
    assert.equal((await read()).record, 4);
    // Showing an earlier week changes neither current progress nor the link count.
    const earlier = await read(["2026-09-14"]);
    assert.equal(earlier.done, true);
    assert.equal(earlier.streak, 4);
    assert.equal(await countUnfinishedHabits(a, today, db), baseline - 1);
    const coached = (await coachData(db).listHabits!(a, today)).find((row) => row.id === habit.id)!;
    assert.equal(coached.period, "week");
    assert.equal(coached.done, true);
    assert.equal(coached.streak, 4);
    assert.equal(coached.record, 4);
    await setHabitDay(a, habit.id, "2026-10-11", false, today, db);
    assert.equal(await countUnfinishedHabits(a, today, db), baseline);
    const ended = (await listHabits(a, "2026-10-12", shown, db)).find((row) => row.id === habit.id)!;
    assert.equal(ended.streak, 0);
    assert.equal(ended.record, 3);
  });

  test("weekly many-times creation keeps 200 and refuses invalid or missing goals without storing them", async () => {
    const habit = await createHabit(a, { name: "Weekly count", period: "week", trackMode: "many", goalCount: 200 }, db);
    assert.equal((await listHabits(a, today, week, db)).find((row) => row.id === habit.id)?.goalCount, 200);
    const before = (await listHabits(a, today, week, db)).length;
    for (const bad of [false, true]) {
      for (const goalCount of [0, 1000, 1.5]) {
        await assert.rejects(createHabit(a, { name: "Invalid weekly", period: "week", trackMode: "many", goalCount, bad }, db), bad ? /limit between 1 and 999/ : /weekly goal between 1 and 999/);
      }
    }
    for (const goalCount of [undefined, null]) await assert.rejects(createHabit(a, { name: "Missing goal", period: "week", trackMode: "many", goalCount }, db), /weekly goal between 1 and 999/);
    await assert.rejects(createHabit(a, { name: "Daily 200", trackMode: "many", goalCount: 200 }, db), /daily goal between 1 and 99/);
    assert.equal((await listHabits(a, today, week, db)).length, before);
  });

  test("weekly counts use Monday from any day, stop at 0 and 999, refuse future weeks, and enforce ownership", async () => {
    const habit = await createHabit(a, { name: "Weekly units", period: "week", trackMode: "many", goalCount: 200 }, db);
    const read = async () => (await listHabits(a, today, week, db)).find((row) => row.id === habit.id)!;
    for (const day of week) {
      assert.deepEqual(await changeHabitDayCount(a, habit.id, day, 1, today, db), { count: 1, done: false });
      assert.deepEqual((await db.select().from(habitMarks).where(eq(habitMarks.habitId, habit.id))).map(({ day, count }) => ({ day, count })), [{ day: "2026-10-05", count: 1 }]);
      assert.ok(Object.values((await read()).counts).every((count) => count === 1));
      assert.deepEqual(await changeHabitDayCount(a, habit.id, day, -1, today, db), { count: 0, done: false });
      await assert.rejects(changeHabitDayCount(a, habit.id, day, -1, today, db), /already 0/);
    }
    assert.equal((await db.select().from(habitMarks).where(eq(habitMarks.habitId, habit.id))).length, 0);
    for (const delta of [1, -1] as const) {
      await assert.rejects(changeHabitDayCount(a, habit.id, "2026-10-12", delta, today, db), /not open yet/);
      await assert.rejects(changeHabitDayCount(b, habit.id, today, delta, today, db), /unavailable/);
    }
    assert.equal(await deleteHabit(b, habit.id, db), false);
    assert.equal((await listHabits(b, today, week, db)).some((row) => row.id === habit.id), false);
    await assert.rejects(db.insert(habitMarks).values({ habitId: habit.id, day: "2026-10-05", count: 1000 }), (error: unknown) => {
      assert.equal((error as { cause?: { code?: string } }).cause?.code, "23514"); // CHECK violation, not application validation.
      return true;
    });
    await db.insert(habitMarks).values({ habitId: habit.id, day: "2026-10-05", count: 998 });
    assert.deepEqual(await changeHabitDayCount(a, habit.id, today, 1, today, db), { count: 999, done: true });
    await assert.rejects(changeHabitDayCount(a, habit.id, today, 1, today, db), /weekly count can be at most 999/);
    assert.equal((await read()).count, 999);
    assert.equal((await read()).done, true);
    assert.equal((await read()).streak, null);
    assert.equal((await read()).record, null);
    assert.deepEqual(await changeHabitDayCount(a, habit.id, today, -1, today, db), { count: 998, done: true });
  });

  test("weekly many-times leaves the unfinished count at the goal for today's week, independent of displayed weeks", async () => {
    const habit = await createHabit(a, { name: "Weekly progress", period: "week", trackMode: "many", goalCount: 200 }, db);
    const baseline = await countUnfinishedHabits(a, today, db);
    await db.insert(habitMarks).values([
      { habitId: habit.id, day: "2026-09-28", count: 999 },
      { habitId: habit.id, day: "2026-10-05", count: 199 },
    ]);
    assert.equal(await countUnfinishedHabits(a, today, db), baseline);
    for (const count of [200, 201]) {
      assert.deepEqual(await changeHabitDayCount(a, habit.id, today, 1, today, db), { count, done: true });
      assert.equal(await countUnfinishedHabits(a, today, db), baseline - 1);
    }
    const past = (await listHabits(a, today, ["2026-09-28"], db)).find((row) => row.id === habit.id)!;
    assert.equal(past.counts["2026-09-28"], 999);
    assert.equal(past.count, 201);
    await changeHabitDayCount(a, habit.id, today, -1, today, db);
    await changeHabitDayCount(a, habit.id, today, -1, today, db);
    assert.equal(await countUnfinishedHabits(a, today, db), baseline);
    const pastBaseline = await countUnfinishedHabits(a, "2026-09-30", db);
    await changeHabitDayCount(a, habit.id, "2026-09-30", -1, today, db);
    assert.equal(await countUnfinishedHabits(a, "2026-09-30", db), pastBaseline);
  });

  test("Bad weekly once and many-times with or without a limit never count as unfinished and stay owned", async () => {
    const baseline = await countUnfinishedHabits(a, today, db);
    for (const goalCount of [undefined, null, 200]) {
      const habit = await createHabit(a, { name: "Bad weekly count", period: "week", trackMode: "many", goalCount, bad: true }, db);
      for (const delta of [1, -1] as const) await assert.rejects(changeHabitDayCount(b, habit.id, today, delta, today, db), /unavailable/);
      await changeHabitDayCount(a, habit.id, "2026-10-11", 1, today, db);
      await db.update(habitMarks).set({ count: 998 }).where(eq(habitMarks.habitId, habit.id));
      assert.deepEqual(await changeHabitDayCount(a, habit.id, today, 1, today, db), { count: 999, done: false });
      await assert.rejects(changeHabitDayCount(a, habit.id, today, 1, today, db), /at most 999/);
      const row = (await listHabits(a, today, week, db)).find((row) => row.id === habit.id)!;
      assert.equal(row.goalCount, goalCount ?? null);
      assert.equal(row.done, false);
      assert.equal(row.streak, null);
      assert.equal(row.record, null);
      assert.equal(await countUnfinishedHabits(a, today, db), baseline);
      assert.deepEqual(await changeHabitDayCount(a, habit.id, today, -1, today, db), { count: 998, done: false });
    }
    const once = await createHabit(a, { name: "Bad weekly once", period: "week", bad: true }, db);
    for (const checked of [true, false]) {
      await assert.rejects(setHabitDay(b, once.id, today, checked, today, db), /unavailable/);
      await assert.rejects(setHabitDay(a, once.id, "2026-10-12", checked, today, db), /not open yet/);
      assert.deepEqual(await setHabitDay(a, once.id, "2026-10-11", checked, today, db), { done: false, streak: null, record: null });
      const row = (await listHabits(a, today, ["2026-10-05"], db)).find((row) => row.id === once.id)!;
      assert.deepEqual(row.marked, checked ? ["2026-10-05"] : []);
      assert.equal(await countUnfinishedHabits(a, today, db), baseline);
    }
  });

  test("the Coach adapter returns this week's many-times count, goal and done without streaks; receipts include weekly Bad", async () => {
    const baseline = (await coachData(db).listHabits!(b, today)).length;
    const many = await createHabit(b, { name: "Weekly Coach count", period: "week", trackMode: "many", goalCount: 200 }, db);
    const badOnce = await createHabit(b, { name: "Weekly Coach lapse", period: "week", bad: true }, db);
    const badMany = await createHabit(b, { name: "Weekly Coach lapses", period: "week", trackMode: "many", bad: true }, db);
    await db.insert(habitMarks).values([
      { habitId: many.id, day: "2026-09-28", count: 199 },
      { habitId: many.id, day: "2026-10-05", count: 201 },
    ]);
    await setHabitDay(b, badOnce.id, today, true, today, db);
    await changeHabitDayCount(b, badMany.id, today, 1, today, db);
    const data = coachData(db);
    const result = await coachListHabits.run({}, { userId: b, today, data, messageId: "message", toolCallId: "weekly" });
    assert.deepEqual(result.habits.find((row) => row.id === many.id), { id: many.id, name: "Weekly Coach count", period: "week", trackMode: "many", goalCount: 200, bad: false, count: 201, done: true, due: false, streak: null, record: null });
    const past = (await data.listHabits!(b, "2026-10-04")).find((row) => row.id === many.id)!;
    assert.equal(past.count, 199);
    assert.equal(past.done, false);
    assert.ok(result.habits.filter((row) => [badOnce.id, badMany.id].includes(row.id)).every((row) => row.bad && !row.done && !row.due && row.streak === null && row.record === null));
    assert.equal(result.habits.length, baseline + 3);
    assert.equal(receipt({ type: "tool-listHabits", state: "output-available", output: result }), `Read your habits (${baseline + 3})`);
    assert.equal((await data.listHabits!(a, today)).some((row) => row.id === many.id), false);
    await db.delete(habits).where(eq(habits.userId, b));
  });

  test("edits preserve all marks, Bad hides and restores streaks, and goal edits rejudge today", async () => {
    const habit = await createHabit(a, "Edit me", db);
    await setHabitDay(a, habit.id, "2026-10-07", true, today, db);
    await setHabitDay(a, habit.id, today, true, today, db);
    const marks = await db.select().from(habitMarks).where(eq(habitMarks.habitId, habit.id));
    const renamed = await editHabit(a, habit.id, { name: "  Read  " }, today, db);
    assert.equal(renamed.name, "Read");
    assert.equal(renamed.streak, 2);
    assert.equal((await editHabit(a, habit.id, { bad: true }, today, db)).streak, null);
    assert.equal((await editHabit(a, habit.id, { bad: false }, today, db)).streak, 2);
    assert.equal((await editHabit(a, habit.id, { trackMode: "many", goalCount: 3 }, today, db)).count, 1);
    assert.deepEqual(await db.select().from(habitMarks).where(eq(habitMarks.habitId, habit.id)), marks);
    await changeHabitDayCount(a, habit.id, today, 1, today, db);
    assert.equal((await editHabit(a, habit.id, { goalCount: 1 }, today, db)).done, true);
    assert.equal((await editHabit(a, habit.id, { goalCount: 3 }, today, db)).done, false);
    assert.equal((await listHabits(a, today, week, db)).find((row) => row.id === habit.id)!.count, 2);
  });

  test("every refused edit leaves the entire habit row and all history unchanged", async () => {
    const once = await createHabit(a, "Refuse once", db);
    await setHabitDay(a, once.id, "2026-09-01", true, today, db);
    const many = await createHabit(a, { name: "Refuse many", trackMode: "many", goalCount: 3 }, db);
    await changeHabitDayCount(a, many.id, "2026-09-01", 1, today, db);
    await changeHabitDayCount(a, many.id, "2026-09-01", 1, today, db);
    const bad = await createHabit(a, { name: "Refuse Bad off", trackMode: "many", bad: true }, db);
    await changeHabitDayCount(a, bad.id, today, 1, today, db);
    const weekly = await createHabit(a, { name: "Refuse weekly", period: "week", trackMode: "many", goalCount: 200 }, db);
    const markedWeekly = await createHabit(a, { name: "Marked weekly", period: "week" }, db);
    await setHabitDay(a, markedWeekly.id, today, true, today, db);
    const cases: [string, HabitEdit, RegExp][] = [
      [once.id, { name: "  " }, /Enter a habit name/],
      [once.id, { name: "x".repeat(201) }, /at most 200/],
      [once.id, { name: "Lost rename", trackMode: "many" }, /daily goal/],
      [once.id, { period: "week" }, /no marks or counts/],
      [markedWeekly.id, { period: "day" }, /no marks or counts/],
      [many.id, { name: "Lost rename", trackMode: "once" }, /count above 1/],
      [many.id, { goalCount: 100 }, /daily goal/],
      [many.id, { goalCount: null }, /daily goal/],
      [bad.id, { name: "Lost rename", bad: false }, /daily goal/],
      [bad.id, { bad: false, goalCount: 100 }, /daily goal/],
      [weekly.id, { period: "day" }, /daily goal/],
      [weekly.id, { goalCount: 1000 }, /weekly goal/],
    ];
    for (const [id, changes, message] of cases) {
      const row = await db.select().from(habits).where(eq(habits.id, id));
      const marks = await db.select().from(habitMarks).where(eq(habitMarks.habitId, id));
      await assert.rejects(editHabit(a, id, changes, today, db), message);
      assert.deepEqual(await db.select().from(habits).where(eq(habits.id, id)), row);
      assert.deepEqual(await db.select().from(habitMarks).where(eq(habitMarks.habitId, id)), marks);
    }
    const edited = await editHabit(a, bad.id, { bad: false, goalCount: 1 }, today, db);
    assert.equal(edited.bad, false);
    assert.equal(edited.count, 1);
    assert.equal(edited.done, true);
  });

  test("allowed conversions keep checks as 1, and period switches move to the destination top", async () => {
    const habit = await createHabit(a, { name: "Convert weekly", period: "week" }, db);
    await setHabitDay(a, habit.id, today, true, today, db);
    const marks = await db.select().from(habitMarks).where(eq(habitMarks.habitId, habit.id));
    await editHabit(a, habit.id, { trackMode: "many", goalCount: 2 }, undefined, db);
    await editHabit(a, habit.id, { trackMode: "once" }, undefined, db);
    assert.deepEqual(await db.select().from(habitMarks).where(eq(habitMarks.habitId, habit.id)), marks);
    const empty = await createHabit(a, { name: "Switch sections", trackMode: "many", goalCount: 99 }, db);
    const dailyBefore = (await listHabits(a, today, week, db)).filter((row) => row.period === "day" && row.id !== empty.id).map((row) => row.id);
    await editHabit(a, empty.id, { period: "week" }, today, db);
    let rows = await listHabits(a, today, week, db);
    assert.equal(rows.find((row) => row.period === "week")!.id, empty.id);
    assert.deepEqual(rows.filter((row) => row.period === "day").map((row) => row.id), dailyBefore);
    await editHabit(a, empty.id, { period: "day" }, today, db);
    rows = await listHabits(a, today, week, db);
    assert.equal(rows[0]!.id, empty.id);
    assert.equal(rows[0]!.goalCount, 99);
  });

  test("another account cannot edit or move a habit, even with otherwise valid changes", async () => {
    const habit = await createHabit(a, "Owned edit", db);
    await setHabitDay(a, habit.id, today, true, today, db);
    const row = await db.select().from(habits).where(eq(habits.id, habit.id));
    const marks = await db.select().from(habitMarks).where(eq(habitMarks.habitId, habit.id));
    await assert.rejects(editHabit(b, habit.id, { name: "Stolen" }, today, db), /unavailable/);
    for (const direction of ["up", "down"] as const) await assert.rejects(moveHabit(b, habit.id, direction, db), /unavailable/);
    await assert.rejects(editHabit(a, "invalid", { name: "Invalid" }, today, db), /unavailable/);
    await assert.rejects(moveHabit(a, "invalid", "up", db), /unavailable/);
    assert.deepEqual(await db.select().from(habits).where(eq(habits.id, habit.id)), row);
    assert.deepEqual(await db.select().from(habitMarks).where(eq(habitMarks.habitId, habit.id)), marks);
  });

  test("up/down normalize duplicate positions, stay inside the section, refuse ends and match Coach and Daily close order", async () => {
    const owner = randomUUID();
    await db.insert(users).values({ id: owner, email: `${owner}@test.invalid`, passwordHash: "-" });
    try {
      const d1 = await createHabit(owner, "Daily first", db);
      const w1 = await createHabit(owner, { name: "Weekly first", period: "week" }, db);
      const d2 = await createHabit(owner, "Daily second", db);
      const w2 = await createHabit(owner, { name: "Weekly second", period: "week" }, db);
      const d3 = await createHabit(owner, "Daily third", db);
      const ids = [d1.id, w1.id, d2.id, w2.id, d3.id];
      for (const [index, id] of ids.entries()) {
        await db.update(habits).set({ position: 7, createdAt: new Date(Date.UTC(2026, 9, 1, 0, 0, index)) }).where(eq(habits.id, id));
      }
      const otherRows = await db.select().from(habits).where(eq(habits.userId, a));
      const order = async () => (await listHabits(owner, today, week, db)).map((row) => row.id);
      assert.deepEqual(await order(), [d1.id, d2.id, d3.id, w1.id, w2.id]);
      await moveHabit(owner, d2.id, "up", db);
      assert.deepEqual(await order(), [d2.id, d1.id, d3.id, w1.id, w2.id]);
      await moveHabit(owner, d2.id, "down", db);
      await moveHabit(owner, w2.id, "up", db);
      assert.deepEqual(await order(), [d1.id, d2.id, d3.id, w2.id, w1.id]);
      for (const [id, direction] of [[d1.id, "up"], [d3.id, "down"], [w2.id, "up"], [w1.id, "down"]] as const) {
        const before = await db.select().from(habits).where(eq(habits.userId, owner));
        await assert.rejects(moveHabit(owner, id, direction, db), /already (first|last)/);
        assert.deepEqual(await db.select().from(habits).where(eq(habits.userId, owner)), before);
      }
      assert.deepEqual(await db.select().from(habits).where(eq(habits.userId, a)), otherRows);
      await editHabit(owner, d2.id, { name: "Edited daily", trackMode: "many", goalCount: 4, bad: true }, today, db);
      const data = coachData(db);
      const context = { userId: owner, today, messageId: "order", toolCallId: "read", data };
      const core = await coachListHabits.run({}, context);
      assert.deepEqual(core.habits.map((row) => row.id), await order());
      assert.deepEqual(core.habits.find((row) => row.id === d2.id), { id: d2.id, name: "Edited daily", period: "day", trackMode: "many", goalCount: 4, bad: true, count: 0, done: false, due: false, streak: null, record: null });
      const close = closeTools(coachTools(data), data, owner, today, "order");
      const closed = await close.listHabits.execute!({}, { toolCallId: "close-order", messages: [], context: {} });
      assert.deepEqual(closed, { ...core, day: today });
    } finally {
      await db.delete(users).where(eq(users.id, owner));
    }
  });

});


describe("Coach Habit writes", { skip: !url && "TEST_POSTGRES_URL missing", concurrency: 1 }, () => {
  const db = createDb(url!);
  const owner = randomUUID(), other = randomUUID();
  const operation = () => ({ source: "coach" as const, operationId: `${randomUUID()}:call:1`, today });
  const dailyOnce = { name: "Walk", period: "day" as const, trackMode: "once" as const, goalCount: null, bad: false };
  before(async () => {
    await db.insert(users).values([owner, other].map((id) => ({ id, email: `${id}@test.invalid`, passwordHash: "-" })));
  });
  after(async () => { await db.delete(users).where(inArray(users.id, [owner, other])); await db.$client.end(); });
  const ledger = (userId = owner) => db.select().from(habitOperations).where(eq(habitOperations.userId, userId));
  const marks = (id: string) => db.select().from(habitMarks).where(eq(habitMarks.habitId, id));

  test("concurrent creates replay one habit and one operation; edits and deletion keep the original result", async () => {
    const input = { ...dailyOnce, ...operation() };
    const results = await Promise.all(Array.from({ length: 3 }, () => createCoachHabit(owner, input, db)));
    const first = results[0]!;
    assert.deepEqual(results, [first, first, first]);
    assert.equal((await ledger()).filter((row) => row.operationId === input.operationId).length, 1);
    assert.equal((await listHabits(owner, today, week, db)).filter((row) => row.id === first.id).length, 1);
    assert.equal(first.count, 0);
    assert.equal(first.due, true);
    await editHabit(owner, first.id, { name: "Edited", bad: true, trackMode: "many", goalCount: 5 }, today, db);
    const edited = await db.select().from(habits).where(eq(habits.id, first.id));
    const before = await ledger();
    assert.deepEqual(await createCoachHabit(owner, input, db), first);
    assert.deepEqual(await db.select().from(habits).where(eq(habits.id, first.id)), edited);
    assert.equal(await deleteHabit(owner, first.id, db), true);
    assert.deepEqual(await createCoachHabit(owner, input, db), first);
    assert.deepEqual(await db.select().from(habits).where(eq(habits.id, first.id)), []);
    assert.deepEqual(await ledger(), before);
  });

  test("concurrent tracking applies once; replay after edit returns the original state without a second count", async () => {
    const habit = await createHabit(owner, { name: "Water", trackMode: "many", goalCount: 3 }, db);
    const input = { habitId: habit.id, action: "did" as const, day: today, ...operation() };
    const results = await Promise.all(Array.from({ length: 3 }, () => trackCoachHabit(owner, input, db)));
    const original = results[0]!;
    assert.deepEqual(results, [original, original, original]);
    assert.equal(original.count, 1);
    assert.equal((await ledger()).filter((row) => row.operationId === input.operationId).length, 1);
    assert.equal((await marks(habit.id))[0]?.count, 1);
    await editHabit(owner, habit.id, { name: "Glasses", goalCount: 1, bad: true }, today, db);
    const before = await ledger();
    const history = await marks(habit.id);
    assert.deepEqual(await trackCoachHabit(owner, input, db), original);
    assert.deepEqual(await marks(habit.id), history);
    assert.deepEqual(await ledger(), before);
    await deleteHabit(owner, habit.id, db);
    assert.deepEqual(await trackCoachHabit(owner, input, db), original);
    assert.deepEqual(await marks(habit.id), []);
    assert.deepEqual(await db.select().from(habits).where(eq(habits.id, habit.id)), []);
    assert.deepEqual(await ledger(), before);
  });

  test("another account cannot list or track an owned habit or use its replay record", async () => {
    const own = { ...dailyOnce, ...operation() };
    const habit = await createCoachHabit(owner, own, db);
    const input = { habitId: habit.id, day: today, action: "did" as const, ...operation() };
    await trackCoachHabit(owner, input, db);
    const before = await marks(habit.id);
    assert.equal((await coachListHabits.run({}, { userId: other, messageId: "message", toolCallId: "read", today, data: coachData(db, today) })).habits.some((row) => row.id === habit.id), false);
    await assert.rejects(trackCoachHabit(other, input, db), /unavailable/);
    assert.deepEqual(await ledger(other), []);
    assert.deepEqual(await marks(habit.id), before);
    // An operation id is scoped to an account; it cannot expose another's result.
    const otherHabit = await createCoachHabit(other, own, db);
    assert.notEqual(otherHabit.id, habit.id);
  });

  test("daily and weekly once did/undo affect one open or past period and future periods write nothing", async () => {
    for (const period of ["day", "week"] as const) {
      const habit = await createHabit(owner, { name: "Once", period }, db);
      for (const day of [today, "2026-09-28"]) {
        const did = await trackCoachHabit(owner, { habitId: habit.id, day, action: "did", ...operation() }, db);
        assert.equal(did.count, 1);
        assert.equal(did.done, true);
        assert.equal(did.due, false);
        const undo = await trackCoachHabit(owner, { habitId: habit.id, day, action: "undo", ...operation() }, db);
        assert.equal(undo.count, 0);
        assert.equal(undo.done, false);
        assert.equal(undo.due, true);
      }
      const before = await ledger();
      await assert.rejects(trackCoachHabit(owner, { habitId: habit.id, day: "2026-10-12", action: "did", ...operation() }, db), /not open yet/);
      assert.deepEqual(await marks(habit.id), []);
      assert.deepEqual(await ledger(), before);
    }
  });

  test("many-times undo restores the previous write, markDone raises to the goal and never lowers in daily and weekly periods", async () => {
    for (const period of ["day", "week"] as const) {
      const goalCount = period === "week" ? 200 : 3;
      const habit = await createHabit(owner, { name: "Pages", period, trackMode: "many", goalCount }, db);
      for (const day of [today, "2026-09-28"]) {
        const track = (action: "did" | "undo" | "markDone") => trackCoachHabit(owner, { habitId: habit.id, day, action, ...operation() }, db);
        assert.equal((await track("did")).count, 1);
        assert.equal((await track("did")).count, 2);
        assert.equal((await track("undo")).count, 1);
        const done = await track("markDone");
        assert.equal(done.count, goalCount);
        assert.equal(done.done, true);
        assert.equal((await track("did")).count, goalCount + 1);
        const again = await track("markDone");
        assert.equal(again.count, goalCount + 1);
        assert.equal(again.changed, false);
        assert.equal((await track("undo")).count, goalCount);
      }
    }
  });

  test("markDone on a once-habit already checked changes nothing", async () => {
    const habit = await createHabit(owner, { name: "Stretch" }, db);
    const track = () => trackCoachHabit(owner, { habitId: habit.id, day: today, action: "markDone", ...operation() }, db);
    assert.equal((await track()).changed, true);
    const again = await track();
    assert.equal(again.count, 1);
    assert.equal(again.changed, false);
    assert.equal((await marks(habit.id))[0]?.count, 1);
  });

  test("Bad didnt on empty writes nothing; an existing once check or many-times log is cleared", async () => {
    for (const period of ["day", "week"] as const) for (const trackMode of ["once", "many"] as const) {
      const habit = await createHabit(owner, { name: "Smoking", period, trackMode, bad: true }, db);
      const track = (action: "did" | "didnt" | "markDone") => trackCoachHabit(owner, { habitId: habit.id, day: today, action, ...operation() }, db);
      const before = await ledger();
      const empty = await track("didnt");
      assert.equal(empty.changed, false);
      assert.equal(empty.count, 0);
      assert.deepEqual(await marks(habit.id), []);
      assert.deepEqual(await ledger(), before);
      if (trackMode === "many") {
        await assert.rejects(track("markDone"), /How many times.*total/);
        assert.deepEqual(await ledger(), before);
        await track("did");
      }
      await track("did");
      const cleared = await track("didnt");
      assert.equal(cleared.changed, true);
      assert.equal(cleared.count, 0);
      assert.equal(cleared.done, false);
      assert.equal(cleared.due, false);
      assert.deepEqual(await marks(habit.id), []);
    }
  });

  test("Bad many-times markDone asks with or without a limit, daily and weekly, without marks or ledger", async () => {
    for (const period of ["day", "week"] as const) for (const goalCount of [null, 5]) {
      const habit = await createHabit(owner, { name: "Cigarettes", period, trackMode: "many", goalCount, bad: true }, db);
      await setHabitCount(owner, habit.id, today, 2, today, db);
      const before = await ledger();
      await assert.rejects(trackCoachHabit(owner, { habitId: habit.id, day: today, action: "markDone", ...operation() }, db), /How many times.*unreported lapses/);
      assert.equal((await marks(habit.id))[0]?.count, 2);
      assert.deepEqual(await ledger(), before);
    }
  });

  test("Coach setCount replays one operation, refuses invalid totals, future periods, once and other owners", async () => {
    for (const period of ["day", "week"] as const) for (const bad of [false, true]) {
      const habit = await createHabit(owner, { name: "Total", period, trackMode: "many", goalCount: 5, bad }, db);
      const input = { habitId: habit.id, day: today, action: "setCount" as const, count: period === "week" ? 120 : 8, ...operation() };
      const before = await ledger();
      const result = await trackCoachHabit(owner, input, db);
      assert.equal(result.count, input.count);
      assert.equal(result.changed, true);
      assert.deepEqual(await trackCoachHabit(owner, input, db), result);
      assert.equal((await ledger()).length, before.length + 1);
      const unchanged = await trackCoachHabit(owner, { ...input, ...operation() }, db);
      assert.equal(unchanged.changed, false);
      const saved = await ledger();
      for (const count of [-1, period === "week" ? 1000 : 100, 1.5]) await assert.rejects(trackCoachHabit(owner, { ...input, count, ...operation() }, db));
      await assert.rejects(trackCoachHabit(owner, { ...input, day: "2026-10-19", ...operation() }, db), /not open yet/);
      await assert.rejects(trackCoachHabit(other, { ...input, ...operation() }, db), /unavailable/);
      assert.deepEqual(await ledger(), saved);
      assert.equal((await marks(habit.id))[0]?.count, input.count);
      const [stored] = await marks(habit.id);
      assert.equal(stored?.day, period === "week" ? "2026-10-05" : today); // Monday
      await assert.rejects(trackCoachHabit(other, { ...input, count: 1, ...operation() }, db), /unavailable/);
      assert.deepEqual(await marks(habit.id), [stored]); // owner's row untouched
    }
    const once = await createHabit(owner, { name: "Once", bad: true }, db);
    await assert.rejects(trackCoachHabit(owner, { habitId: once.id, day: today, action: "setCount", count: 1, ...operation() }, db), /Once-habits have no count/);
    assert.equal((await trackCoachHabit(owner, { habitId: once.id, day: today, action: "markDone", ...operation() }, db)).count, 1);
  });

  test("Coach counts refuse above 99/999 and undo at zero without recording an operation", async () => {
    for (const period of ["day", "week"] as const) {
      const cap = period === "day" ? 99 : 999;
      const habit = await createHabit(owner, { name: "Cap", period, trackMode: "many", goalCount: cap }, db);
      const track = (action: "did" | "undo" | "markDone") => trackCoachHabit(owner, { habitId: habit.id, day: today, action, ...operation() }, db);
      const before = await ledger();
      assert.match(String(((await track("undo")) as { question?: string }).question), /I have no update of mine to undo/);
      assert.deepEqual(await ledger(), before);
      await track("markDone");
      const filled = await ledger();
      await assert.rejects(track("did"), new RegExp(`at most ${cap}`));
      assert.deepEqual(await ledger(), filled);
      assert.equal((await marks(habit.id))[0]?.count, cap);
    }
  });
  test("true undo restores totals and markDone, deletes created marks, and replays without another restore", async () => {
    for (const period of ["day", "week"] as const) for (const bad of [false, true]) {
      const habit = await createHabit(owner, { name: "Water undo", period, trackMode: "many", goalCount: 5, bad }, db);
      const track = (action: "setCount" | "did" | "undo" | "markDone" | "didnt", count?: number) => trackCoachHabit(owner, { habitId: habit.id, day: today, action, count, ...operation() }, db);
      await setHabitCount(owner, habit.id, today, 3, today, db);
      assert.equal((await track("setCount", 8)).previousCount, 3);
      const input = { habitId: habit.id, day: today, action: "undo" as const, ...operation() };
      const restored = await trackCoachHabit(owner, input, db);
      assert.equal(restored.count, 3);
      assert.equal(restored.previousCount, 8);
      assert.equal(restored.day, period === "week" ? "2026-10-05" : today);
      assert.ok(restored.undoes);
      const before = await ledger();
      const history = await marks(habit.id);
      assert.deepEqual(await trackCoachHabit(owner, input, db), restored);
      assert.deepEqual(await ledger(), before);
      assert.deepEqual(await marks(habit.id), history);
      await setHabitCount(owner, habit.id, today, 0, today, db);
      assert.equal((await track("did")).previousCount, 0);
      assert.equal((await track("undo")).count, 0);
      assert.deepEqual(await marks(habit.id), []);
      if (!bad) {
        await setHabitCount(owner, habit.id, today, 2, today, db);
        assert.equal((await track("markDone")).count, 5);
        assert.equal((await track("undo")).count, 2);
      } else {
        await track("setCount", 4);
        assert.equal((await track("didnt")).previousCount, 4);
        assert.equal((await track("undo")).count, 4);
      }
    }
  });

  test("repeated undo steps back through Coach writes and never redoes", async () => {
    const habit = await createHabit(owner, { name: "Steps", trackMode: "many", goalCount: 5 }, db);
    const track = (action: "did" | "setCount" | "undo", count?: number) => trackCoachHabit(owner, { habitId: habit.id, day: today, action, count, ...operation() }, db);
    await track("did");
    await track("setCount", 4);
    assert.equal((await track("undo")).count, 1);
    assert.equal((await track("undo")).count, 0);
    assert.deepEqual(await marks(habit.id), []);
    const before = await ledger();
    assert.deepEqual(await track("undo"), { refused: true, reason: "nothingToUndo", id: habit.id, name: "Steps", period: "day", day: today, action: "undo", count: 0, question: `I have no update of mine to undo for 'Steps' for today. What should the total be?` });
    assert.deepEqual(await ledger(), before);
  });

  test("nothing-to-undo names the period in day words, never an ISO date", async () => {
    const daily = await createHabit(owner, { name: "Past undo", trackMode: "many", goalCount: 5 }, db);
    const weekly = await createHabit(owner, { name: "Past week undo", period: "week", trackMode: "many", goalCount: 5 }, db);
    const yesterday = new Date(Date.parse(today + "T00:00:00Z") - 86_400_000).toISOString().slice(0, 10);
    const lastWeek = new Date(Date.parse(today + "T00:00:00Z") - 7 * 86_400_000).toISOString().slice(0, 10);
    const lastMonday = (() => { const d = new Date(lastWeek + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d; })();
    const weekWords = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(lastMonday);
    const cases = [
      [daily, yesterday, "yesterday"],
      [daily, lastWeek, new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(lastWeek + "T00:00:00Z"))],
      [weekly, lastWeek, `the week of ${weekWords}`],
    ] as const;
    for (const [habit, day, words] of cases) {
      const result = await trackCoachHabit(owner, { habitId: habit.id, day, action: "undo", ...operation() }, db) as { refused?: boolean; question?: string };
      assert.equal(result.refused, true);
      assert.equal(result.question, `I have no update of mine to undo for '${habit.name}' for ${words}. What should the total be?`);
      assert.doesNotMatch(result.question!, /\d{4}-\d{2}-\d{2}/);
    }
  });

  test("undo refuses page edits, missing history, legacy history and another user's rows without writes", async () => {
    for (const period of ["day", "week"] as const) for (const scenario of ["page", "pageOnly", "empty", "legacy", "foreign", "checked"]) {
      const habit = await createHabit(owner, { name: "Refuse undo", period, ...(scenario === "checked" ? {} : { trackMode: "many" as const, goalCount: 5 }) }, db);
      const day = period === "week" ? "2026-10-05" : today;
      const input = { habitId: habit.id, day: today, ...operation() };
      if (scenario === "page") {
        await trackCoachHabit(owner, { ...input, action: "setCount", count: 8 }, db);
        await setHabitCount(owner, habit.id, today, 6, today, db);
      } else if (scenario === "pageOnly") {
        await setHabitCount(owner, habit.id, today, 6, today, db);
      } else if (scenario === "checked") {
        await setHabitDay(owner, habit.id, today, true, today, db);
        assert.equal((await trackCoachHabit(owner, { ...input, action: "did" }, db)).changed, false);
      } else if (scenario === "legacy" || scenario === "foreign") {
        await setHabitCount(owner, habit.id, today, 8, today, db);
        await db.insert(habitOperations).values({ userId: scenario === "foreign" ? other : owner, source: "coach", operationId: randomUUID(), habitId: habit.id,
          result: { id: habit.id, day, action: "setCount", changed: true, count: 8, ...(scenario === "foreign" ? { previousCount: 3 } : {}) } });
      }
      const before = await ledger();
      const otherBefore = await ledger(other);
      const history = await marks(habit.id);
      const message = scenario === "page" ? "'Refuse undo' has changed since my last update (now 6). What should the total be?"
        : `I have no update of mine to undo for 'Refuse undo' for ${period === "week" ? "this week" : "today"}. What should the total be?`;
      const refusal = await trackCoachHabit(owner, { ...input, ...operation(), action: "undo" }, db) as { refused?: boolean; reason?: string; question?: string };
      assert.equal(refusal.refused, true);
      assert.equal(refusal.reason, scenario === "page" ? "changedSince" : "nothingToUndo");
      assert.equal(refusal.question, message);
      assert.deepEqual(await ledger(), before);
      assert.deepEqual(await ledger(other), otherBefore);
      assert.deepEqual(await marks(habit.id), history);
    }
  });

  test("undo restores daily and weekly caps and refuses a restored total above the current period cap", async () => {
    for (const period of ["day", "week"] as const) {
      const cap = period === "week" ? 999 : 99;
      const habit = await createHabit(owner, { name: "Restore cap", period, trackMode: "many", goalCount: 5 }, db);
      await setHabitCount(owner, habit.id, today, cap, today, db);
      await trackCoachHabit(owner, { habitId: habit.id, day: today, action: "setCount", count: 1, ...operation() }, db);
      assert.equal((await trackCoachHabit(owner, { habitId: habit.id, day: today, action: "undo", ...operation() }, db)).count, cap);
      const result = { id: habit.id, day: period === "week" ? "2026-10-05" : today, action: "setCount", count: cap, changed: true, previousCount: cap + 1 };
      await db.insert(habitOperations).values({ userId: owner, source: "coach", operationId: randomUUID(), habitId: habit.id, result });
      const before = await ledger();
      const history = await marks(habit.id);
      await assert.rejects(trackCoachHabit(owner, { habitId: habit.id, day: today, action: "undo", ...operation() }, db), { message: `Up to ${cap}` });
      assert.deepEqual(await ledger(), before);
      assert.deepEqual(await marks(habit.id), history);
    }
  });

});
