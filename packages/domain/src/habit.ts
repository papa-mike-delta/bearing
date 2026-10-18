import { isCalendarDay } from "./areas.ts";

export const maxHabitNameLength = 200;

export type HabitPeriod = "day" | "week";
export type HabitTrackMode = "once" | "many";
export type HabitTracking = {
  period: HabitPeriod;
  trackMode: HabitTrackMode;
  goalCount: number | null;
  bad: boolean;
};

export function habitCountCap(period: HabitPeriod): number {
  return period === "day" ? 99 : 999;
}

export function validHabitGoal(habit: HabitTracking): boolean {
  if (habit.trackMode === "once") return habit.goalCount === null;
  if (habit.goalCount === null) return habit.bad;
  return Number.isInteger(habit.goalCount) && habit.goalCount >= 1 && habit.goalCount <= habitCountCap(habit.period);
}

// Refuse counts outside the period's bounds; never clip to the cap or floor.
export function changeHabitCount(count: number, delta: 1 | -1, period: HabitPeriod): number | null {
  const cap = habitCountCap(period);
  if (!Number.isInteger(count) || count < 0 || count > cap || (delta !== 1 && delta !== -1)) return null;
  const next = count + delta;
  return next >= 0 && next <= cap ? next : null;
}

export function habitPeriodDay(period: HabitPeriod, day: string): string | null {
  if (!isCalendarDay(day)) return null;
  return period === "week" ? mondayOf(day) : day;
}

export function manyTimesProgress(
  habit: HabitTracking,
  marks: readonly { day: string; count: number }[],
  day: string,
): { count: number; done: boolean } | null {
  const periodDay = habitPeriodDay(habit.period, day);
  if (!periodDay || habit.trackMode !== "many" || !validHabitGoal(habit)) return null;
  const count = marks.find((mark) => mark.day === periodDay)?.count ?? 0;
  if (!Number.isInteger(count) || count < 0 || count > habitCountCap(habit.period)) return null;
  return { count, done: habit.goalCount !== null && count >= habit.goalCount };
}

export function habitName(value: string): string | null {
  const name = value.trim();
  if (!name || name.length > maxHabitNameLength) return null;
  return name;
}

export function addCalendarDays(day: string, count: number): string | null {
  if (!isCalendarDay(day) || !Number.isInteger(count)) return null;
  const [year, month, date] = day.split("-").map(Number);
  const utc = new Date(Date.UTC(year!, month! - 1, date!));
  utc.setUTCDate(utc.getUTCDate() + count);
  const next = utc.toISOString().slice(0, 10);
  return isCalendarDay(next) ? next : null;
}

// Monday of the week that contains day, in the calendar date itself.
export function mondayOf(day: string): string | null {
  if (!isCalendarDay(day)) return null;
  const [year, month, date] = day.split("-").map(Number);
  const weekday = new Date(Date.UTC(year!, month! - 1, date!)).getUTCDay();
  const back = weekday === 0 ? 6 : weekday - 1;
  return addCalendarDays(day, -back);
}

export function weekDays(monday: string): string[] | null {
  if (mondayOf(monday) !== monday) return null;
  const days: string[] = [];
  for (let i = 0; i < 7; i += 1) {
    const day = addCalendarDays(monday, i);
    if (!day) return null;
    days.push(day);
  }
  return days;
}

export function shiftWeek(monday: string, weeks: number): string | null {
  if (!Number.isInteger(weeks) || weekDays(monday) === null) return null;
  const next = addCalendarDays(monday, weeks * 7);
  return next && mondayOf(next) === next ? next : null;
}

export type DayMark = { day: string };

// Daily once-habit. Marks after today are ignored. The open day does not
// break a streak, and the record is the longest run still in the marks.
export function dailyOnceProgress(
  marks: readonly DayMark[],
  today: string,
): { done: boolean; streak: number; record: number } | null {
  if (!isCalendarDay(today)) return null;
  const days = [
    ...new Set(
      marks
        .map((mark) => mark.day)
        .filter((day) => isCalendarDay(day) && day <= today),
    ),
  ].sort();
  return {
    done: days.includes(today),
    streak: currentStreak(days, today),
    record: longestRun(days),
  };
}

function longestRun(days: readonly string[]): number {
  let best = 0;
  let run = 0;
  let previous = "";
  for (const day of days) {
    run = previous && addCalendarDays(previous, 1) === day ? run + 1 : 1;
    previous = day;
    if (run > best) best = run;
  }
  return best;
}

function currentStreak(days: readonly string[], today: string): number {
  const done = new Set(days);
  let cursor = done.has(today) ? today : addCalendarDays(today, -1);
  if (!cursor || !done.has(cursor)) return 0;
  let streak = 0;
  while (cursor && done.has(cursor)) {
    streak += 1;
    cursor = addCalendarDays(cursor, -1);
  }
  return streak;
}
