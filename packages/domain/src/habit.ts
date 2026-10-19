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

export type HabitEdit = Partial<HabitTracking & { name: string }>;

// Validate the whole proposed edit before a caller writes anything. Checks are
// already counts of 1, so both allowed conversions preserve every stored mark.
export function editHabitRules(
  current: HabitTracking & { name: string },
  marks: readonly { count: number }[],
  changes: HabitEdit,
): { habit: HabitTracking & { name: string } } | { error: string } {
  const next = { ...current, ...changes };
  if (typeof next.name !== "string" || !next.name.trim()) return { error: "Enter a habit name." };
  const name = habitName(next.name);
  if (!name) return { error: `Habit names can be at most ${maxHabitNameLength} characters; this one has ${next.name.trim().length}.` };
  if (next.period !== "day" && next.period !== "week") return { error: "Choose Daily or Weekly for this habit." };
  if (next.trackMode !== "once" && next.trackMode !== "many") return { error: "Choose once or many-times for this habit." };
  if (typeof next.bad !== "boolean") return { error: "Choose whether this habit is Bad." };
  if (next.period !== current.period && marks.length) return { error: "Daily and Weekly can only be switched when this habit has no marks or counts." };
  if (current.trackMode === "many" && next.trackMode === "once") {
    if (marks.some((mark) => mark.count > 1)) return { error: "Cannot switch to once: a period has a count above 1." };
    // Dropping the goal is part of switching to once, unless a new goal was supplied.
    if (changes.goalCount === undefined) next.goalCount = null;
  }
  if (!validHabitGoal(next)) {
    if (next.trackMode === "once") return { error: "Once-habits cannot have a goal." };
    const cap = habitCountCap(next.period);
    return { error: next.bad
      ? `Enter a whole-number limit between 1 and ${cap}, or leave it empty.`
      : `Enter a whole-number ${next.period === "week" ? "weekly" : "daily"} goal between 1 and ${cap}.` };
  }
  return { habit: { name, period: next.period, trackMode: next.trackMode, bad: next.bad, goalCount: next.goalCount } };
}

// Plus stops at the period's cap; minus also repairs stored counts above it. Never clip.
export function changeHabitCount(count: number, delta: 1 | -1, period: HabitPeriod): number | null {
  const cap = habitCountCap(period);
  if (!Number.isInteger(count) || count < 0 || count > 999 || (delta !== 1 && delta !== -1)) return null;
  const next = count + delta;
  return next >= 0 && (delta === -1 || next <= cap) ? next : null;
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
  if (!Number.isInteger(count) || count < 0 || count > 999) return null;
  return { count, done: !habit.bad && habit.goalCount !== null && count >= habit.goalCount };
}

export function habitIsDue(habit: Pick<HabitTracking, "bad">, done: boolean): boolean {
  return !habit.bad && !done;
}

export function habitOverGoal(habit: HabitTracking, count: number): boolean {
  return habit.trackMode === "many" && habit.goalCount !== null && count > habit.goalCount;
}

export function habitProgress(habit: HabitTracking, marks: readonly { day: string; count: number }[], day: string) {
  const periodDay = habitPeriodDay(habit.period, day);
  if (!periodDay || !validHabitGoal(habit)) return null;
  const count = marks.find((mark) => mark.day === periodDay)?.count ?? 0;
  if (habit.trackMode === "many") {
    const progress = manyTimesProgress(habit, marks, day);
    return progress && { ...progress, streak: null, record: null };
  }
  if (habit.bad) return { count, done: false, streak: null, record: null };
  if (habit.period === "day") return { count, ...dailyOnceProgress(marks, day)! };
  return { count, ...weeklyOnceProgress(marks, day)! };
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

// Weekly once-habits share the daily rules, with Monday as the period date.
export function weeklyOnceProgress(marks: readonly DayMark[], today: string) {
  const monday = mondayOf(today);
  if (!monday) return null;
  const weeks = [...new Set(marks.map((mark) => mondayOf(mark.day))
    .filter((week): week is string => week !== null && week <= monday))].sort();
  return { done: weeks.includes(monday), streak: currentStreak(weeks, monday, 7), record: longestRun(weeks, 7) };
}

function longestRun(days: readonly string[], step = 1): number {
  let best = 0;
  let run = 0;
  let previous = "";
  for (const day of days) {
    run = previous && addCalendarDays(previous, step) === day ? run + 1 : 1;
    previous = day;
    if (run > best) best = run;
  }
  return best;
}

function currentStreak(days: readonly string[], today: string, step = 1): number {
  const done = new Set(days);
  let cursor = done.has(today) ? today : addCalendarDays(today, -step);
  if (!cursor || !done.has(cursor)) return 0;
  let streak = 0;
  while (cursor && done.has(cursor)) {
    streak += 1;
    cursor = addCalendarDays(cursor, -step);
  }
  return streak;
}
