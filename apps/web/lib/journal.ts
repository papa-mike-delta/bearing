import { db as defaultDb, journalEntries, journalSettings } from "@repo/db";
import { validNoteBody } from "@repo/domain";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "./db.ts";
import { isJournalDay } from "./journal-day.ts";
import { JournalError } from "./draft-filing/postgres.ts";
export { appendJournal } from "./draft-filing/index.ts";
export { JournalError } from "./draft-filing/postgres.ts";
export const starterJournalTemplate = "## Gratitude\n\n## Best thing\n\n## Hard part\n";

export async function getJournalTemplate(userId: string, db: Db = defaultDb) {
  const [settings] = await db.select({ template: journalSettings.template, alwaysLoad: journalSettings.alwaysLoad })
    .from(journalSettings).where(eq(journalSettings.userId, userId));
  return { template: settings?.template ?? starterJournalTemplate, alwaysLoad: settings?.alwaysLoad ?? false };
}

export async function saveJournalTemplate(userId: string, template: string, db: Db = defaultDb) {
  if (typeof template !== "string" || template.length > 10_000) throw new JournalError("Use a template of at most 10,000 characters. Your text has not been truncated.");
  await db.insert(journalSettings).values({ userId, template })
    .onConflictDoUpdate({ target: journalSettings.userId, set: { template } });
}

export async function setAlwaysLoadTemplate(userId: string, alwaysLoad: boolean, db: Db = defaultDb) {
  if (typeof alwaysLoad !== "boolean") throw new JournalError("Use a boolean for Always load template.");
  await db.insert(journalSettings).values({ userId, alwaysLoad })
    .onConflictDoUpdate({ target: journalSettings.userId, set: { alwaysLoad } });
}

const conflict = "Conflict: this Journal day changed in another tab. Your unsaved text is kept here. Copy it before reloading to compare with the latest version.";

export async function getJournalDay(userId: string, day: string, db: Db = defaultDb) {
  if (!isJournalDay(day)) return null;
  const [entry] = await db.select().from(journalEntries)
    .where(and(eq(journalEntries.userId, userId), eq(journalEntries.day, day)));
  return entry ?? null;
}

// One bounded read for preview links. Return days only, never document contents.
export async function getSavedJournalDays(userId: string, days: string[], db: Db = defaultDb): Promise<string[]> {
  if (!Array.isArray(days) || days.length > 100 || !days.every(isJournalDay)) {
    throw new JournalError("Use at most 100 real YYYY-MM-DD calendar days.");
  }
  const distinct = [...new Set(days)];
  if (!distinct.length) return [];
  const rows = await db.select({ day: journalEntries.day }).from(journalEntries)
    .where(and(eq(journalEntries.userId, userId), inArray(journalEntries.day, distinct)));
  return rows.map((row) => row.day);
}

// Revision zero represents an unsaved, virtual day.
export async function saveJournalDay(userId: string, day: string, body: string, expectedRevision: number, today: string, db: Db = defaultDb, loadedTemplate?: string) {
  if (!isJournalDay(day) || !isJournalDay(today)) throw new JournalError("Use a real YYYY-MM-DD calendar day and supply the browser's Today.");
  if (day > today) throw new JournalError("This day is not open yet.");
  if (!validNoteBody(body)) throw new JournalError("Use a body of at most 100,000 characters.");
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || expectedRevision >= 2_147_483_647) {
    throw new JournalError("Use a valid Journal revision. Refresh and try again.");
  }
  if (!body.trim()) return null;
  if (expectedRevision === 0) {
    // Keep an untouched prompt virtual, including one loaded before settings
    // changed in another tab. Existing documents keep normal revision semantics.
    if (body === loadedTemplate || body === (await getJournalTemplate(userId, db)).template) return null;
    const [entry] = await db.insert(journalEntries).values({ userId, day, body })
      .onConflictDoNothing({ target: [journalEntries.userId, journalEntries.day] }).returning();
    if (entry) return entry;
    throw new JournalError(conflict);
  }
  const [entry] = await db.update(journalEntries).set({ body, revision: sql`${journalEntries.revision} + 1` })
    .where(and(eq(journalEntries.userId, userId), eq(journalEntries.day, day), eq(journalEntries.revision, expectedRevision))).returning();
  if (entry) return entry;
  if (!(await getJournalDay(userId, day, db))) throw new JournalError("That item is unavailable. Refresh and try again.");
  throw new JournalError(conflict);
}
