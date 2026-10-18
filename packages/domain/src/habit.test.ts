import assert from "node:assert/strict";
import { test } from "node:test";
import {
  changeHabitCount,
  habitProgress,
  habitIsDue,
  habitOverGoal,
  habitPeriodDay,
  manyTimesProgress,
  validHabitGoal,
  type HabitTracking,
  addCalendarDays,
  dailyOnceProgress,
  weeklyOnceProgress,
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

test("many-times goals are required whole numbers within the period's cap", () => {
  const daily: HabitTracking = { period: "day", trackMode: "many", goalCount: 3, bad: false };
  for (const goalCount of [null, 0, 100, 1.5, NaN]) assert.equal(validHabitGoal({ ...daily, goalCount }), false);
  for (const goalCount of [1, 3, 99]) assert.equal(validHabitGoal({ ...daily, goalCount }), true);
  assert.equal(validHabitGoal({ ...daily, period: "week", goalCount: 999 }), true);
  assert.equal(validHabitGoal({ ...daily, period: "week", goalCount: 1000 }), false);
  assert.equal(validHabitGoal({ ...daily, bad: true, goalCount: null }), true);
  assert.equal(validHabitGoal({ ...daily, trackMode: "once" }), false);
  assert.equal(validHabitGoal({ ...daily, trackMode: "once", goalCount: null }), true);
});

test("count changes refuse the cap and floor without clipping", () => {
  assert.equal(changeHabitCount(0, -1, "day"), null);
  assert.equal(changeHabitCount(1, -1, "day"), 0);
  assert.equal(changeHabitCount(98, 1, "day"), 99);
  assert.equal(changeHabitCount(99, 1, "day"), null);
  assert.equal(changeHabitCount(100, -1, "day"), 99);
  assert.equal(changeHabitCount(1.5, 1, "day"), null);
  assert.equal(changeHabitCount(998, 1, "week"), 999);
  assert.equal(changeHabitCount(999, 1, "week"), null);
});

test("many-times progress stays unfinished until the goal, allows over-goal, and has no streak", () => {
  const habit: HabitTracking = { period: "day", trackMode: "many", goalCount: 3, bad: false };
  assert.deepEqual(manyTimesProgress(habit, [], "2026-10-08"), { count: 0, done: false });
  for (const count of [1, 2, 3, 4, 99]) {
    assert.deepEqual(manyTimesProgress(habit, [{ day: "2026-10-08", count }], "2026-10-08"), { count, done: count >= 3 });
  }
  assert.equal(manyTimesProgress(habit, [{ day: "2026-10-08", count: 1000 }], "2026-10-08"), null);
  assert.deepEqual(manyTimesProgress(habit, [{ day: "2026-10-07", count: 3 }], "2026-10-08"), { count: 0, done: false });
});

test("weekly marks use the week's Monday across month and year boundaries", () => {
  assert.equal(habitPeriodDay("week", "2027-01-03"), "2026-12-28");
  assert.equal(habitPeriodDay("week", "2027-01-04"), "2027-01-04");
  assert.equal(habitPeriodDay("day", "2027-01-03"), "2027-01-03");
  assert.equal(habitPeriodDay("week", "2026-02-31"), null);
  const habit: HabitTracking = { period: "week", trackMode: "many", goalCount: 100, bad: false };
  assert.deepEqual(manyTimesProgress(habit, [{ day: "2026-12-28", count: 100 }], "2027-01-03"), { count: 100, done: true });
});


test("Bad once and many-times habits never contribute to the unfinished count or have streaks or records", () => {
  const normal: HabitTracking = { period: "day", trackMode: "once", goalCount: null, bad: false };
  const habits = [normal, { ...normal, bad: true }, { ...normal, trackMode: "many" as const, goalCount: 3, bad: true }];
  for (const count of [0, 1, 2, 3, 4]) {
    const marks = count ? [{ day: "2026-10-08", count }] : [];
    const progress = habits.map((habit) => habitProgress(habit, marks, "2026-10-08")!);
    for (const bad of progress.slice(1)) assert.deepEqual(bad, { count, done: false, streak: null, record: null });
    assert.equal(progress.filter((row, i) => habitIsDue(habits[i]!, row.done)).length, count === 0 ? 1 : 0);
    assert.equal(progress[0]!.streak, count === 0 ? 0 : 1);
  }
});

test("Bad many-times without a goal counts occurrences up to 99 with no over-goal mark", () => {
  const habit: HabitTracking = { period: "day", trackMode: "many", goalCount: null, bad: true };
  assert.equal(validHabitGoal(habit), true);
  assert.equal(validHabitGoal({ ...habit, bad: false }), false);
  for (const count of [0, 1, 99]) {
    assert.deepEqual(habitProgress(habit, [{ day: "2026-10-08", count }], "2026-10-08"), { count, done: false, streak: null, record: null });
    assert.equal(habitOverGoal(habit, count), false);
  }
  assert.equal(changeHabitCount(98, 1, "day"), 99);
  assert.equal(changeHabitCount(99, 1, "day"), null);
});

test("a Bad goal is a limit: only counts above it have the over-goal mark, never done or due", () => {
  const habit: HabitTracking = { period: "day", trackMode: "many", goalCount: 3, bad: true };
  for (const count of [0, 2, 3, 4, 99]) {
    const progress = habitProgress(habit, [{ day: "2026-10-08", count }], "2026-10-08")!;
    assert.equal(habitOverGoal(habit, count), count > 3);
    assert.equal(progress.done, false);
    assert.equal(habitIsDue(habit, progress.done), false);
  }
});

test("weekly once progress crosses Sunday to Monday and is independent of the clicked day", () => {
  const marks = days("2026-09-21", "2026-09-28", "2026-10-05");
  assert.deepEqual(weeklyOnceProgress(marks, "2026-10-11"), { done: true, streak: 3, record: 3 });
  assert.deepEqual(weeklyOnceProgress(marks, "2026-10-12"), { done: false, streak: 3, record: 3 });
  assert.deepEqual(weeklyOnceProgress(marks, "2026-10-18"), { done: false, streak: 3, record: 3 });
  for (const day of weekDays("2026-10-12")!) {
    assert.deepEqual(weeklyOnceProgress([...marks, { day }], "2026-10-18"), { done: true, streak: 4, record: 4 });
  }
  const habit: HabitTracking = { period: "week", trackMode: "once", goalCount: null, bad: false };
  assert.deepEqual(habitProgress(habit, marks.map((mark) => ({ ...mark, count: 1 })), "2026-10-18"), { count: 0, done: false, streak: 3, record: 3 });
});

test("an ended empty week breaks the streak; record follows the longest remaining weekly run", () => {
  const marks = days("2026-09-21", "2026-09-28", "2026-10-05");
  assert.deepEqual(weeklyOnceProgress(marks, "2026-10-19"), { done: false, streak: 0, record: 3 });
  assert.deepEqual(weeklyOnceProgress([...marks, { day: "2026-10-19" }], "2026-10-19"), { done: true, streak: 1, record: 3 });
  assert.deepEqual(weeklyOnceProgress([marks[0]!, marks[2]!], "2026-10-12"), { done: false, streak: 1, record: 1 });
  assert.deepEqual(weeklyOnceProgress(days("2026-10-19"), "2026-10-18"), { done: false, streak: 0, record: 0 });
  assert.deepEqual(weeklyOnceProgress([], "2026-10-18"), { done: false, streak: 0, record: 0 });
  assert.equal(weeklyOnceProgress(marks, "2026-13-40"), null);
});


test("weekly many-times keeps goals up to 999, stops at 0 and 999, and is done at its goal without a streak", () => {
  const habit: HabitTracking = { period: "week", trackMode: "many", goalCount: 200, bad: false };
  for (const goalCount of [1, 200, 999]) assert.equal(validHabitGoal({ ...habit, goalCount }), true);
  for (const goalCount of [null, 0, 1000, 1.5]) assert.equal(validHabitGoal({ ...habit, goalCount }), false);
  assert.equal(validHabitGoal({ ...habit, period: "day" }), false);
  assert.equal(changeHabitCount(0, -1, "week"), null);
  assert.equal(changeHabitCount(1, -1, "week"), 0);
  assert.equal(changeHabitCount(998, 1, "week"), 999);
  assert.equal(changeHabitCount(999, 1, "week"), null);
  assert.equal(changeHabitCount(1000, 1, "week"), null);
  for (const count of [0, 199, 200, 201, 999]) {
    const marks = count ? [{ day: "2026-10-05", count }] : [];
    for (const day of weekDays("2026-10-05")!) {
      const progress = habitProgress(habit, marks, day)!;
      assert.deepEqual(progress, { count, done: count >= 200, streak: null, record: null });
      assert.equal(habitIsDue(habit, progress.done), count < 200);
      assert.equal(habitOverGoal(habit, count), count > 200);
    }
    assert.deepEqual(habitProgress(habit, marks, "2026-10-12"), { count: 0, done: false, streak: null, record: null });
  }
});

test("Bad weekly once and many-times habits never have completion, due, streak or record, including without a goal", () => {
  const base: HabitTracking = { period: "week", trackMode: "many", goalCount: 200, bad: true };
  const habits = [base, { ...base, goalCount: null }, { ...base, trackMode: "once" as const, goalCount: null }];
  for (const habit of habits) {
    assert.equal(validHabitGoal(habit), true);
    for (const count of habit.trackMode === "many" ? [0, 199, 200, 201, 999] : [0, 1]) {
      const progress = habitProgress(habit, count ? [{ day: "2026-10-05", count }] : [], "2026-10-11")!;
      assert.deepEqual(progress, { count, done: false, streak: null, record: null });
      assert.equal(habitIsDue(habit, progress.done), false);
      assert.equal(habitOverGoal(habit, count), habit.goalCount !== null && count > habit.goalCount);
    }
  }
});
