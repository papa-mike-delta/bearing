import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addCalendarDays,
  dailyOnceProgress,
  habitName,
  mondayOf,
  shiftWeek,
  weekDays,
} from "./habit.ts";

const days = (...dates: string[]) => dates.map((day) => ({ day }));

test("a habit name is trimmed and limited to 200 characters", () => {
  assert.equal(habitName("  Floss  "), "Floss");
  assert.equal(habitName("   "), null);
  assert.equal(habitName("a".repeat(201)), null);
  assert.equal(habitName("a".repeat(200))?.length, 200);
});

test("weeks start on Monday and do not care that Sunday is day zero", () => {
  assert.equal(mondayOf("2026-10-11"), "2026-10-05");
  assert.equal(mondayOf("2026-10-05"), "2026-10-05");
  assert.equal(mondayOf("2026-10-12"), "2026-10-12");
  assert.deepEqual(weekDays("2026-10-05"), [
    "2026-10-05",
    "2026-10-06",
    "2026-10-07",
    "2026-10-08",
    "2026-10-09",
    "2026-10-10",
    "2026-10-11",
  ]);
  assert.equal(weekDays("2026-10-06"), null);
  assert.equal(shiftWeek("2026-10-05", -1), "2026-09-28");
  assert.equal(shiftWeek("2026-10-06", -1), null);
});

test("an empty today does not break a streak or lower the record", () => {
  const progress = dailyOnceProgress(
    days("2026-10-05", "2026-10-06", "2026-10-07"),
    "2026-10-08",
  );
  assert.deepEqual(progress, { done: false, streak: 3, record: 3 });
  assert.deepEqual(
    dailyOnceProgress(
      days("2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08"),
      "2026-10-08",
    ),
    { done: true, streak: 4, record: 4 },
  );
});

test("a closed miss ends the streak and the record stays in the marks", () => {
  assert.deepEqual(
    dailyOnceProgress(days("2026-10-05"), "2026-10-07"),
    { done: false, streak: 0, record: 1 },
  );
  assert.deepEqual(
    dailyOnceProgress(days("2026-10-05", "2026-10-06"), "2026-10-08"),
    { done: false, streak: 0, record: 2 },
  );
});

test("a daily streak crosses Monday", () => {
  assert.deepEqual(
    dailyOnceProgress(days("2026-10-11", "2026-10-12"), "2026-10-12"),
    { done: true, streak: 2, record: 2 },
  );
});

test("removing a day from a run lowers the record", () => {
  assert.equal(
    dailyOnceProgress(days("2026-10-05", "2026-10-06", "2026-10-07"), "2026-10-08")!.record,
    3,
  );
  assert.equal(
    dailyOnceProgress(days("2026-10-05", "2026-10-06"), "2026-10-08")!.record,
    2,
  );
});

test("a gap stops the streak, and a future mark does not count", () => {
  assert.deepEqual(
    dailyOnceProgress(days("2026-10-05", "2026-10-07"), "2026-10-08"),
    { done: false, streak: 1, record: 1 },
  );
  assert.deepEqual(
    dailyOnceProgress(days("2026-10-08", "2026-10-09"), "2026-10-08"),
    { done: true, streak: 1, record: 1 },
  );
});

test("calendar addition stays on the real day", () => {
  assert.equal(addCalendarDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addCalendarDays("2026-02-31", 1), null);
  assert.equal(dailyOnceProgress(days("2026-10-05"), "nope"), null);
});
