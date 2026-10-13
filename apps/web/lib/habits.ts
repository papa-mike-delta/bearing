import { db as defaultDb, habitMarks, habits } from "@repo/db";
import { dailyOnceProgress, habitName, isCalendarDay, maxHabitNameLength } from "@repo/domain";
import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";
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

export type HabitListItem = {
  id: string;
  name: string;
  marked: string[];
  done: boolean;
  streak: number;
  record: number;
};

function asDay(value: unknown) {
  if (typeof value === "string") return value.slice(0, 10);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return "";
}

export async function listHabits(userId: string, today: string, week: readonly string[], db: Db = defaultDb) {
  if (!isCalendarDay(today)) throw new HabitError(todayError);
  const rows = await db.select({ id: habits.id, name: habits.name }).from(habits)
    .where(eq(habits.userId, userId)).orderBy(asc(habits.position), asc(habits.createdAt), asc(habits.id));
  const ids = rows.map((row) => row.id);
  const markRows = ids.length
    ? await db.select({ habitId: habitMarks.habitId, day: habitMarks.day }).from(habitMarks)
      .where(and(inArray(habitMarks.habitId, ids), lte(habitMarks.day, today)))
    : [];
  const byHabit = new Map<string, string[]>();
  for (const mark of markRows) {
    const day = asDay(mark.day);
    const list = byHabit.get(mark.habitId) ?? [];
    list.push(day);
    byHabit.set(mark.habitId, list);
  }
  const shown = new Set(week);
  return rows.map((row) => {
    const days = (byHabit.get(row.id) ?? []).filter((day) => isCalendarDay(day)).sort();
    const progress = dailyOnceProgress(days.map((day) => ({ day })), today)!;
    return { id: row.id, name: row.name, marked: days.filter((day) => shown.has(day)), ...progress };
  });
}

export async function countUnfinishedHabits(userId: string, today: string, db: Db = defaultDb) {
  if (!isCalendarDay(today)) throw new HabitError(todayError);
  const rows = await db.select({ id: habits.id }).from(habits).where(eq(habits.userId, userId));
  if (!rows.length) return 0;
  const done = await db.select({ habitId: habitMarks.habitId }).from(habitMarks).where(and(
    inArray(habitMarks.habitId, rows.map((row) => row.id)), eq(habitMarks.day, today),
  ));
  return rows.length - done.length;
}

// A new habit takes the position above the current top. Equal positions keep the older row first.
export async function createHabit(userId: string, input: string, db: Db = defaultDb) {
  const problem = habitNameError(input);
  const name = problem ? null : habitName(input);
  if (!name) throw new HabitError(problem ?? blankName);
  return db.transaction(async (tx) => {
    const [least] = await tx.select({ position: sql<number | null>`min(${habits.position})::int` }).from(habits).where(eq(habits.userId, userId));
    const position = (least?.position == null ? 0 : Number(least.position)) - 1;
    const [row] = await tx.insert(habits).values({ userId, name, position }).returning({ id: habits.id, name: habits.name });
    return row!;
  });
}

export async function setHabitDay(userId: string, habitId: string, day: string, checked: boolean, today: string, db: Db = defaultDb) {
  if (!isUuid(habitId) || !isCalendarDay(day) || !isCalendarDay(today) || typeof checked !== "boolean") throw new HabitError(unavailable);
  if (day > today) throw new HabitError(future);
  return db.transaction(async (tx) => {
    const [habit] = await tx.select({ id: habits.id }).from(habits).where(and(eq(habits.id, habitId), eq(habits.userId, userId)));
    if (!habit) throw new HabitError(unavailable);
    if (checked) await tx.insert(habitMarks).values({ habitId, day }).onConflictDoNothing();
    else await tx.delete(habitMarks).where(and(eq(habitMarks.habitId, habitId), eq(habitMarks.day, day)));
    const marks = await tx.select({ day: habitMarks.day }).from(habitMarks).where(and(eq(habitMarks.habitId, habitId), lte(habitMarks.day, today)));
    return dailyOnceProgress(marks.map((mark) => ({ day: asDay(mark.day) })), today)!;
  });
}

export async function deleteHabit(userId: string, habitId: string, db: Db = defaultDb) {
  if (!isUuid(habitId)) return false;
  const [row] = await db.delete(habits).where(and(eq(habits.id, habitId), eq(habits.userId, userId))).returning({ id: habits.id });
  return Boolean(row);
}
