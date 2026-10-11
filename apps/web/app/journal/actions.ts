"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "../../auth";
import { JournalError, saveJournalDay } from "../../lib/journal";

export async function updateJournalDay(day: string, body: string, expectedRevision: number, today: string): Promise<{ revision: number } | { empty: true } | { error: string }> {
  const user = await requireUser();
  try {
    const entry = await saveJournalDay(user.id, day, body, expectedRevision, today);
    if (!entry) return { empty: true as const };
    revalidatePath(`/journal/${day}`);
    return { revision: entry.revision };
  } catch (error) {
    return { error: error instanceof JournalError ? error.message : "Could not save. Your text is kept here; please try again." };
  }
}
