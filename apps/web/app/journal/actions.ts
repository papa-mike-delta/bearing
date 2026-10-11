"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "../../auth";
import { JournalError, saveJournalDay, saveJournalTemplate, setAlwaysLoadTemplate } from "../../lib/journal";

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
