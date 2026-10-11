import { db as defaultDb, dayScores } from "@repo/db";
import { and, eq, sql } from "drizzle-orm";
import type { Db } from "./db.ts";
import { isJournalDay } from "./journal-day.ts";
import { moods, type Mood } from "./mood-values.ts";

export class MoodError extends Error {}

// setAt is client-issued epoch milliseconds. Keep it unchanged on retries;
// issue a later time for a new choice, including a clear.
export type MoodInput = { day: string; today: string; mood: Mood | null; setAt: number };

export async function getMood(userId: string, day: string, db: Db = defaultDb): Promise<Mood | null> {
  if (!isJournalDay(day)) return null;
  const [score] = await db.select({ mood: dayScores.mood }).from(dayScores)
    .where(and(eq(dayScores.userId, userId), eq(dayScores.day, day)));
  return (score?.mood as Mood | null) ?? null;
}

export async function setMood(userId: string, input: MoodInput, db: Db = defaultDb) {
  const { day, today, mood, setAt } = input;
  if (!isJournalDay(day) || !isJournalDay(today)) throw new MoodError("Use a real YYYY-MM-DD calendar day and supply the browser's Today.");
  if (day > today) throw new MoodError("This day is not open yet.");
  if (mood !== null && !moods.includes(mood)) throw new MoodError("Choose one of the five mood words, or clear the mood.");
  if (!Number.isSafeInteger(setAt) || setAt < 0 || setAt > 253_402_300_799_999) throw new MoodError("Supply a valid client set time in epoch milliseconds.");
  const [score] = await db.insert(dayScores).values({ userId, day, mood, moodSetAt: new Date(setAt) })
    .onConflictDoUpdate({
      target: [dayScores.userId, dayScores.day],
      set: { mood, moodSetAt: new Date(setAt) },
      setWhere: sql`${dayScores.moodSetAt} < excluded.mood_set_at`,
    }).returning();
  // ON CONFLICT locks the owned day while comparing times. A stale/equal
  // request changes nothing, including updated_at; return the current choice.
  const current = score ?? (await db.select().from(dayScores)
    .where(and(eq(dayScores.userId, userId), eq(dayScores.day, day))))[0];
  if (!current) throw new MoodError("Could not save the mood. Please retry.");
  return { ...current, mood: current.mood as Mood | null };
}
