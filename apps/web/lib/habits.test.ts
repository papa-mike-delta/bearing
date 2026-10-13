import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, test } from "node:test";
import { createDb, habitMarks, habits, users } from "@repo/db";
import { eq, inArray } from "drizzle-orm";
import { countUnfinishedHabits, createHabit, deleteHabit, listHabits, setHabitDay } from "./habits.ts";

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
