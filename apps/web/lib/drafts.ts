import { db as defaultDb, drafts } from "@repo/db";
import { maxListedInboxDrafts } from "@repo/coach";
import { and, desc, eq, sql } from "drizzle-orm";
import type { Db } from "./db.ts";
export { fileDraft, fileDraftAsJournal, fileDraftAsTask, DraftError } from "./draft-filing/index.ts";

// Every query here takes the session user.

export async function captureDraft(
  userId: string,
  body: string,
  db: Db = defaultDb,
) {
  await db.insert(drafts).values({ userId, body });
}

export async function inboxDrafts(userId: string, db: Db = defaultDb) {
  return db
    .select({ id: drafts.id, body: drafts.body })
    .from(drafts)
    .where(and(eq(drafts.userId, userId), eq(drafts.workspace, "inbox")))
    .orderBy(desc(drafts.createdAt), desc(drafts.id));
}

// Bound the read in SQL as well as at the SDK-independent tool boundary.
export async function listInboxDrafts(userId: string, db: Db = defaultDb) {
  const rows = await db.select({ id: drafts.id, excerpt: sql<string>`left(${drafts.body}, 200)`, createdAt: drafts.createdAt }).from(drafts)
    .where(and(eq(drafts.userId, userId), eq(drafts.workspace, "inbox")))
    .orderBy(desc(drafts.createdAt), desc(drafts.id)).limit(maxListedInboxDrafts);
  return rows.map((row) => ({ ...row, excerpt: row.excerpt.slice(0, 200), createdAt: row.createdAt.toISOString() }));
}
