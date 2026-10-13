import { isCalendarDay } from "./areas.ts";

export const maxHabitNameLength = 200;

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
