"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "../../auth";
import { getSavedJournalDays, JournalError, saveJournalDay, saveJournalTemplate, setAlwaysLoadTemplate } from "../../lib/journal";
import { MoodError, setMood, type MoodInput } from "../../lib/mood";
import type { Mood } from "../../lib/mood-values";

export async function resolveJournalLinks(days: string[]): Promise<string[]> {
  const user = await requireUser();
  return getSavedJournalDays(user.id, days);
}

export async function updateMood(input: MoodInput): Promise<{ mood: Mood | null; setAt: number } | { error: string }> {
  const user = await requireUser();
  try {
    const score = await setMood(user.id, input);
    revalidatePath(`/journal/${input.day}`);
    return { mood: score.mood, setAt: score.moodSetAt.getTime() };
  } catch (error) {
    return { error: error instanceof MoodError ? error.message : "Could not save the mood. Please retry." };
  }
}

export async function updateJournalDay(day: string, body: string, expectedRevision: number, today: string, loadedTemplate?: string): Promise<{ revision: number } | { empty: true } | { error: string }> {
  const user = await requireUser();
  try {
    const entry = await saveJournalDay(user.id, day, body, expectedRevision, today, undefined, loadedTemplate);
    if (!entry) return { empty: true as const };
    revalidatePath(`/journal/${day}`);
    return { revision: entry.revision };
  } catch (error) {
    return { error: error instanceof JournalError ? error.message : "Could not save. Your text is kept here; please try again." };
  }
}

export async function updateJournalTemplate(template: string): Promise<{ saved: true } | { error: string }> {
  const user = await requireUser();
  try {
    await saveJournalTemplate(user.id, template);
    revalidatePath("/journal", "layout");
    return { saved: true as const };
  } catch (error) {
    return { error: error instanceof JournalError ? error.message : "Could not save the template. Your text is kept here; please retry." };
  }
}

export async function updateAlwaysLoadTemplate(alwaysLoad: boolean): Promise<{ saved: true } | { error: string }> {
  const user = await requireUser();
  try {
    await setAlwaysLoadTemplate(user.id, alwaysLoad);
    revalidatePath("/journal", "layout");
    return { saved: true as const };
  } catch (error) {
    return { error: error instanceof JournalError ? error.message : "Could not save the setting. Please retry." };
  }
}
