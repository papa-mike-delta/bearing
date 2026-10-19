import type { HabitAction, HabitOperation, HabitWriteState, HabitTrackResult } from "@repo/coach";
import { db as defaultDb, habitMarks, habitOperations, habits, users } from "@repo/db";
import { changeHabitCount, habitIsDue, editHabitRules, habitProgress, habitCountCap, habitName, habitPeriodDay, isCalendarDay, maxHabitNameLength, validHabitGoal, type HabitEdit, type HabitTracking } from "@repo/domain";
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
  if (typeof tracking.bad !== "boolean") throw new HabitError("Choose whether this habit is Bad.");
  if (tracking.trackMode !== "once" && tracking.trackMode !== "many") throw new HabitError("Choose once or many-times for this habit.");
  const cap = habitCountCap(tracking.period);
  const periodLabel = tracking.period === "week" ? "weekly" : "daily";
  if (!validHabitGoal(tracking)) throw new HabitError(tracking.trackMode === "many" ? (tracking.bad ? `Enter a whole-number limit between 1 and ${cap}, or leave it empty.` : `Enter a whole-number ${periodLabel} goal between 1 and ${cap}.`) : "Once-habits cannot have a goal.");
  const problem = habitNameError(options.name);
  const name = problem ? null : habitName(options.name);
  if (!name) throw new HabitError(problem ?? blankName);
  return db.transaction(async (tx) => {
    // Serialize section ordering with edits and moves for this account.
    await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
    const [least] = await tx.select({ position: sql<number | null>`min(${habits.position})::int` }).from(habits).where(and(eq(habits.userId, userId), eq(habits.period, tracking.period)));
    const position = (least?.position == null ? 0 : Number(least.position)) - 1;
    const [row] = await tx.insert(habits).values({ userId, name, position, ...tracking }).returning({ id: habits.id, name: habits.name });
    return row!;
  });
}

export async function editHabit(userId: string, habitId: string, changes: HabitEdit, today?: string, db: Db = defaultDb): Promise<HabitTracking & { name: string } & Partial<NonNullable<ReturnType<typeof habitProgress>>>> {
  if (!isUuid(habitId) || !changes || typeof changes !== "object") throw new HabitError(unavailable);
  if (today !== undefined && !isCalendarDay(today)) throw new HabitError(todayError);
  return db.transaction(async (tx) => {
    await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
    const owned = and(eq(habits.id, habitId), eq(habits.userId, userId));
    const [habit] = await tx.select().from(habits).where(owned).for("update");
    if (!habit) throw new HabitError(unavailable);
    // Read all history, including any future marks, for conversion refusals.
    const marks = await tx.select({ day: habitMarks.day, count: habitMarks.count }).from(habitMarks).where(eq(habitMarks.habitId, habitId));
    const result = editHabitRules(habit, marks, changes);
    if ("error" in result) throw new HabitError(result.error);
    let position = habit.position;
    if (result.habit.period !== habit.period) {
      const [least] = await tx.select({ position: sql<number | null>`min(${habits.position})::int` }).from(habits)
        .where(and(eq(habits.userId, userId), eq(habits.period, result.habit.period)));
      position = (least?.position ?? 0) - 1;
    }
    await tx.update(habits).set({ ...result.habit, position, updatedAt: new Date() }).where(owned);
    return { ...result.habit, ...(today ? habitProgress(result.habit, marks.map((mark) => ({ day: asDay(mark.day), count: mark.count })), today) : {}) };
  });
}

export async function moveHabit(userId: string, habitId: string, direction: "up" | "down", db: Db = defaultDb) {
  if (!isUuid(habitId) || (direction !== "up" && direction !== "down")) throw new HabitError(unavailable);
  return db.transaction(async (tx) => {
    await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
    const [habit] = await tx.select().from(habits).where(and(eq(habits.id, habitId), eq(habits.userId, userId))).for("update");
    if (!habit) throw new HabitError(unavailable);
    const section = await tx.select({ id: habits.id }).from(habits)
      .where(and(eq(habits.userId, userId), eq(habits.period, habit.period)))
      .orderBy(asc(habits.position), asc(habits.createdAt), asc(habits.id)).for("update");
    const index = section.findIndex((row) => row.id === habitId);
    const neighbour = index + (direction === "up" ? -1 : 1);
    if (!section[neighbour]) throw new HabitError(`This habit is already ${direction === "up" ? "first" : "last"} in its section.`);
    // Normalize duplicate positions using the page's stable tie breakers, then
    // swap exactly one neighbour. Refused moves never normalize or write.
    [section[index], section[neighbour]] = [section[neighbour]!, section[index]!];
    for (const [position, row] of section.entries()) {
      await tx.update(habits).set({ position }).where(and(eq(habits.id, row.id), eq(habits.userId, userId)));
    }
    return { ok: true };
  });
}

export async function setHabitDay(userId: string, habitId: string, day: string, checked: boolean, today: string, db: Db = defaultDb) {
  if (!isUuid(habitId) || !isCalendarDay(day) || !isCalendarDay(today) || typeof checked !== "boolean") throw new HabitError(unavailable);
  return db.transaction(async (tx) => {
    const [habit] = await tx.select().from(habits).where(and(eq(habits.id, habitId), eq(habits.userId, userId), eq(habits.trackMode, "once"))).for("update");
    if (!habit) throw new HabitError(unavailable);
    const periodDay = habitPeriodDay(habit.period, day)!;
    if (periodDay > habitPeriodDay(habit.period, today)!) throw new HabitError(future);
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
  return db.transaction(async (tx) => {
    const [habit] = await tx.select().from(habits).where(and(eq(habits.id, habitId), eq(habits.userId, userId), eq(habits.trackMode, "many"))).for("update");
    if (!habit) throw new HabitError(unavailable);
    const periodDay = habitPeriodDay(habit.period, day)!;
    if (periodDay > habitPeriodDay(habit.period, today)!) throw new HabitError(future);
    // The SQL mirrors changeHabitCount: plus stops at habitCountCap, minus at 0 (no row).
    const cap = habitCountCap(habit.period);
    const target = and(eq(habitMarks.habitId, habitId), eq(habitMarks.day, periodDay));
    let count: number;
    if (delta === 1) {
      const [row] = await tx.insert(habitMarks).values({ habitId, day: periodDay, count: 1 }).onConflictDoUpdate({
        target: [habitMarks.habitId, habitMarks.day],
        set: { count: sql`${habitMarks.count} + 1` },
        setWhere: lt(habitMarks.count, cap),
      }).returning({ count: habitMarks.count });
      if (!row) throw new HabitError(`This habit's ${habit.period === "week" ? "weekly" : "daily"} count can be at most ${cap}.`);
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

// Lock the account before checking the ledger. Concurrent resends, creation,
// edits and section ordering therefore share one transaction order. The ledger
// stores the complete original state independently of the editable habit.
async function habitOperation<Result extends HabitWriteState>(userId: string, input: HabitOperation, db: Db, apply: (tx: Db) => Promise<Result>): Promise<Result> {
  if (input.source !== "coach" || !input.operationId?.trim() || input.operationId.length > 250) throw new HabitError(unavailable);
  return db.transaction(async (tx) => {
    const [account] = await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
    if (!account) throw new HabitError(unavailable);
    const [previous] = await tx.select({ result: habitOperations.result }).from(habitOperations).where(and(
      eq(habitOperations.userId, userId), eq(habitOperations.source, input.source), eq(habitOperations.operationId, input.operationId),
    ));
    if (previous) return previous.result as Result;
    if (!isCalendarDay(input.today)) throw new HabitError(todayError);
    const result = await apply(tx);
    // "I didn't" on an empty Bad period is entirely read-only, including the
    // ledger. It reports no change and must not claim a successful write.
    if (!("action" in result && result.action === "didnt" && "changed" in result && !result.changed)) {
      await tx.insert(habitOperations).values({ userId, source: input.source, operationId: input.operationId, habitId: result.id, result });
    }
    return result;
  });
}

async function habitWriteState(userId: string, habitId: string, day: string, tx: Db): Promise<HabitWriteState> {
  const row = (await listHabits(userId, day, [day], tx)).find((row) => row.id === habitId);
  if (!row) throw new HabitError(unavailable);
  const { id, name, period, trackMode, goalCount, bad, count, done, streak, record } = row;
  return { id, name, period, trackMode, goalCount, bad, count, done, streak, record, due: habitIsDue(row, done) };
}

export async function createCoachHabit(userId: string, input: HabitTracking & { name: string } & HabitOperation, db: Db = defaultDb) {
  return habitOperation(userId, input, db, async (tx) => {
    // Use the same validation and section insertion as the Habits page.
    const row = await createHabit(userId, input, tx);
    return habitWriteState(userId, row.id, input.today, tx);
  });
}

export async function trackCoachHabit(userId: string, input: { habitId: string; day: string; action: HabitAction } & HabitOperation, db: Db = defaultDb): Promise<HabitTrackResult> {
  return habitOperation(userId, input, db, async (tx) => {
    if (!isUuid(input.habitId) || !isCalendarDay(input.day) || !["did", "undo", "didnt", "markDone"].includes(input.action)) throw new HabitError(unavailable);
    const [habit] = await tx.select().from(habits).where(and(eq(habits.id, input.habitId), eq(habits.userId, userId))).for("update");
    if (!habit) throw new HabitError(unavailable);
    const day = habitPeriodDay(habit.period, input.day)!;
    if (day > habitPeriodDay(habit.period, input.today)!) throw new HabitError(future);
    const target = and(eq(habitMarks.habitId, habit.id), eq(habitMarks.day, day));
    const [mark] = await tx.select({ count: habitMarks.count }).from(habitMarks).where(target);
    const previousCount = mark?.count ?? 0;
    let count: number;
    if (input.action === "didnt") {
      if (!habit.bad) throw new HabitError(`"I didn't" clears only a Bad habit. Did you mean undo?`);
      count = 0;
    } else if (input.action === "markDone") {
      if (habit.trackMode === "many" && habit.goalCount === null) throw new HabitError("What count should be recorded? This Bad habit has no goal.");
      count = habit.trackMode === "once" ? 1 : habit.goalCount!;
    } else if (habit.trackMode === "once") {
      count = input.action === "did" ? 1 : 0;
    } else {
      const next = changeHabitCount(previousCount, input.action === "did" ? 1 : -1, habit.period);
      if (next === null) throw new HabitError(input.action === "undo" ? "This habit's count is already 0." : `This habit's ${habit.period === "week" ? "weekly" : "daily"} count can be at most ${habitCountCap(habit.period)}.`);
      count = next;
    }
    if (count !== previousCount) {
      if (count === 0) await tx.delete(habitMarks).where(target);
      else await tx.insert(habitMarks).values({ habitId: habit.id, day, count }).onConflictDoUpdate({ target: [habitMarks.habitId, habitMarks.day], set: { count } });
    }
    return { ...await habitWriteState(userId, habit.id, input.day, tx), day, action: input.action, changed: count !== previousCount };
  });
}
