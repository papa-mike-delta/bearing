import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, test } from "node:test";
import { createDb, habitMarks, habits, users } from "@repo/db";
import { eq, inArray } from "drizzle-orm";
import { coachData } from "./coach-tools.ts";
import { changeHabitDayCount, countUnfinishedHabits, createHabit, deleteHabit, listHabits, setHabitDay } from "./habits.ts";

const url = process.env.TEST_POSTGRES_URL;
if (!url && process.env.CI) test("Habit database tests require Postgres in CI", () => assert.fail("TEST_POSTGRES_URL missing"));

const today = "2026-10-08";
const week = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"];

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
});
