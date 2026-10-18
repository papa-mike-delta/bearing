import { db as defaultDb, habitMarks, habits } from "@repo/db";
import { changeHabitCount, habitProgress, habitCountCap, habitName, habitPeriodDay, isCalendarDay, maxHabitNameLength, validHabitGoal, type HabitTracking } from "@repo/domain";
import { and, asc, eq, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import { isUuid, type Db } from "./db.ts";

export class HabitError extends Error {}

const blankName = "Enter a habit name.";

// Distinct, visible reasons; a long name is refused, never cut.
export function habitNameError(input: unknown): string | null {
  if (typeof input !== "string" || !input.trim()) return blankName;
  const length = input.trim().length;
  if (length > maxHabitNameLength) return `Habit names can be at most ${maxHabitNameLength} characters; this one has ${length}.`;
  return null;
}
const unavailable = "That habit is unavailable. Refresh and try again.";
const future = "That day is not open yet.";
const todayError = "Supply the browser's today as a real calendar day.";

export type HabitListItem = HabitTracking & {
  id: string;
  name: string;
  marked: string[];
  done: boolean;
  counts: Record<string, number>;
  count: number;
  streak: number | null;
  record: number | null;
};

function asDay(value: unknown) {
  if (typeof value === "string") return value.slice(0, 10);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return "";
}

export async function listHabits(userId: string, today: string, week: readonly string[], db: Db = defaultDb) {
  if (!isCalendarDay(today)) throw new HabitError(todayError);
  const rows = await db.select().from(habits)
    .where(eq(habits.userId, userId)).orderBy(asc(habits.period), asc(habits.position), asc(habits.createdAt), asc(habits.id));
  const ids = rows.map((row) => row.id);
  const markRows = ids.length
    ? await db.select({ habitId: habitMarks.habitId, day: habitMarks.day, count: habitMarks.count }).from(habitMarks)
      .where(and(inArray(habitMarks.habitId, ids), lte(habitMarks.day, today)))
    : [];
  const byHabit = new Map<string, { day: string; count: number }[]>();
  for (const mark of markRows) {
    const day = asDay(mark.day);
    if (!isCalendarDay(day)) continue;
    const list = byHabit.get(mark.habitId) ?? [];
    list.push({ day, count: mark.count });
    byHabit.set(mark.habitId, list);
  }
  const shown = new Set(week);
  return rows.map((row): HabitListItem => {
    const marks = byHabit.get(row.id) ?? [];
    const days = marks.map((mark) => mark.day).sort();
    const progress = habitProgress(row, marks, today)!;
    return {
      id: row.id, name: row.name, period: row.period, trackMode: row.trackMode, goalCount: row.goalCount, bad: row.bad,
      marked: days.filter((day) => shown.has(day)),
      counts: Object.fromEntries(week.map((day) => [day, marks.find((mark) => mark.day === habitPeriodDay(row.period, day))?.count ?? 0])),
      ...progress,
    };
  });
}

export async function countUnfinishedHabits(userId: string, today: string, db: Db = defaultDb) {
  if (!isCalendarDay(today)) throw new HabitError(todayError);
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(habits)
    .leftJoin(habitMarks, and(eq(habitMarks.habitId, habits.id), eq(habitMarks.day,
      sql`case when ${habits.period} = 'week' then ${habitPeriodDay("week", today)}::date else ${today}::date end`)))
    .where(and(eq(habits.userId, userId), eq(habits.bad, false), or(
      and(eq(habits.trackMode, "once"), isNull(habitMarks.day)),
      and(eq(habits.trackMode, "many"), lt(sql`coalesce(${habitMarks.count}, 0)`, habits.goalCount)),
    )));
  return row?.count ?? 0;
}

// A new habit takes the position above the current top. Equal positions keep the older row first.
export async function createHabit(userId: string, input: string | { name: string; period?: "day" | "week"; trackMode?: "once" | "many"; goalCount?: number | null; bad?: boolean }, db: Db = defaultDb) {
  const options = typeof input === "string" ? { name: input } : input;
  const tracking: HabitTracking = { period: options.period ?? "day", trackMode: options.trackMode ?? "once", goalCount: options.goalCount ?? null, bad: options.bad ?? false };
  if (tracking.period !== "day" && tracking.period !== "week") throw new HabitError("Choose Daily or Weekly for this habit.");
  if (tracking.period === "week" && (tracking.trackMode !== "once" || tracking.bad)) throw new HabitError("Weekly habits must be once and cannot be Bad.");
  if (typeof tracking.bad !== "boolean") throw new HabitError("Choose whether this habit is Bad.");
  if (tracking.trackMode !== "once" && tracking.trackMode !== "many") throw new HabitError("Choose once or many-times for this habit.");
  if (!validHabitGoal(tracking)) throw new HabitError(tracking.trackMode === "many" ? (tracking.bad ? "Enter a whole-number limit between 1 and 99, or leave it empty." : "Enter a whole-number daily goal between 1 and 99.") : "Once-habits cannot have a goal.");
  const problem = habitNameError(options.name);
  const name = problem ? null : habitName(options.name);
  if (!name) throw new HabitError(problem ?? blankName);
  return db.transaction(async (tx) => {
    const [least] = await tx.select({ position: sql<number | null>`min(${habits.position})::int` }).from(habits).where(eq(habits.userId, userId));
    const position = (least?.position == null ? 0 : Number(least.position)) - 1;
    const [row] = await tx.insert(habits).values({ userId, name, position, ...tracking }).returning({ id: habits.id, name: habits.name });
    return row!;
  });
}

export async function setHabitDay(userId: string, habitId: string, day: string, checked: boolean, today: string, db: Db = defaultDb) {
  if (!isUuid(habitId) || !isCalendarDay(day) || !isCalendarDay(today) || typeof checked !== "boolean") throw new HabitError(unavailable);
  return db.transaction(async (tx) => {
    const [habit] = await tx.select().from(habits).where(and(eq(habits.id, habitId), eq(habits.userId, userId), eq(habits.trackMode, "once")));
    if (!habit) throw new HabitError(unavailable);
    const periodDay = habitPeriodDay(habit.period, day)!;
    if (periodDay > habitPeriodDay(habit.period, today)!) throw new HabitError(future);
    if (habit.period === "week" && habit.bad) throw new HabitError(unavailable);
    if (checked) await tx.insert(habitMarks).values({ habitId, day: periodDay }).onConflictDoNothing();
    else await tx.delete(habitMarks).where(and(eq(habitMarks.habitId, habitId), eq(habitMarks.day, periodDay)));
    const marks = await tx.select({ day: habitMarks.day, count: habitMarks.count }).from(habitMarks).where(and(eq(habitMarks.habitId, habitId), lte(habitMarks.day, today)));
    const { done, streak, record } = habitProgress(habit, marks.map((mark) => ({ day: asDay(mark.day), count: mark.count })), today)!;
    return { done, streak, record };
  });
}

// Lock the owned habit so decrement/delete and concurrent increments take turns.
export async function changeHabitDayCount(userId: string, habitId: string, day: string, delta: 1 | -1, today: string, db: Db = defaultDb) {
  if (!isUuid(habitId) || !isCalendarDay(day) || !isCalendarDay(today) || (delta !== 1 && delta !== -1)) throw new HabitError(unavailable);
  if (day > today) throw new HabitError(future);
  return db.transaction(async (tx) => {
    const [habit] = await tx.select().from(habits).where(and(eq(habits.id, habitId), eq(habits.userId, userId), eq(habits.trackMode, "many"), eq(habits.period, "day"))).for("update");
    if (!habit) throw new HabitError(unavailable);
    // The SQL mirrors changeHabitCount: plus stops at habitCountCap, minus at 0 (no row).
    const cap = habitCountCap(habit.period);
    const target = and(eq(habitMarks.habitId, habitId), eq(habitMarks.day, day));
    let count: number;
    if (delta === 1) {
      const [row] = await tx.insert(habitMarks).values({ habitId, day, count: 1 }).onConflictDoUpdate({
        target: [habitMarks.habitId, habitMarks.day],
        set: { count: sql`${habitMarks.count} + 1` },
        setWhere: lt(habitMarks.count, cap),
      }).returning({ count: habitMarks.count });
      if (!row) throw new HabitError(`This habit's daily count can be at most ${cap}.`);
      count = row.count;
    } else {
      const [mark] = await tx.select({ count: habitMarks.count }).from(habitMarks).where(target);
      const next = mark ? changeHabitCount(mark.count, -1, habit.period) : null;
      if (next === null) throw new HabitError("This habit's count is already 0.");
      count = next;
      if (count === 0) await tx.delete(habitMarks).where(target);
      else await tx.update(habitMarks).set({ count }).where(target);
    }
    return { count, done: !habit.bad && habit.goalCount !== null && count >= habit.goalCount };
  });
}

export async function deleteHabit(userId: string, habitId: string, db: Db = defaultDb) {
  if (!isUuid(habitId)) return false;
  const [row] = await db.delete(habits).where(and(eq(habits.id, habitId), eq(habits.userId, userId))).returning({ id: habits.id });
  return Boolean(row);
}
