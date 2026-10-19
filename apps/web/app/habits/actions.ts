"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "../../auth";
import type { HabitEdit } from "@repo/domain";
import { changeHabitDayCount, countUnfinishedHabits, createHabit, deleteHabit, editHabit, moveHabit, HabitError, setHabitDay } from "../../lib/habits";

function failure(error: unknown, fallback: string) {
  return { error: error instanceof HabitError ? error.message : fallback };
}

export async function addHabit(name: string, trackMode: "once" | "many" = "once", goalCount: number | null = null, bad = false, period: "day" | "week" = "day") {
  const user = await requireUser();
  try {
    await createHabit(user.id, { name, period, trackMode, goalCount, bad });
    revalidatePath("/habits");
    return { ok: true };
  } catch (error) { return failure(error, "Could not add the habit. Please try again."); }
}

export async function markHabitDay(habitId: string, day: string, checked: boolean, today: string) {
  const user = await requireUser();
  try {
    const progress = await setHabitDay(user.id, habitId, day, checked, today);
    revalidatePath("/habits");
    return progress;
  } catch (error) { return failure(error, "Could not save. Please try again."); }
}

export async function countHabitDay(habitId: string, day: string, delta: 1 | -1, today: string) {
  const user = await requireUser();
  try {
    const progress = await changeHabitDayCount(user.id, habitId, day, delta, today);
    revalidatePath("/habits");
    return progress;
  } catch (error) { return failure(error, "Could not save. Please try again."); }
}

export async function removeHabit(habitId: string) {
  const user = await requireUser();
  try {
    if (!(await deleteHabit(user.id, habitId))) return { error: "That habit is unavailable. Refresh and try again." };
    revalidatePath("/habits");
    return { ok: true };
  } catch { return { error: "Could not delete. Please try again." }; }
}

export async function saveHabit(habitId: string, changes: HabitEdit, today: string) {
  const user = await requireUser();
  try {
    await editHabit(user.id, habitId, changes, today);
    revalidatePath("/habits");
    return { ok: true };
  } catch (error) { return failure(error, "Could not save. Please try again."); }
}

export async function reorderHabit(habitId: string, direction: "up" | "down") {
  const user = await requireUser();
  try {
    await moveHabit(user.id, habitId, direction);
    revalidatePath("/habits");
    return { ok: true };
  } catch (error) { return failure(error, "Could not move the habit. Please try again."); }
}

export async function unfinishedHabits(today: string) {
  const user = await requireUser();
  try { return { count: await countUnfinishedHabits(user.id, today) }; }
  catch (error) { return failure(error, "Could not load habits."); }
}
