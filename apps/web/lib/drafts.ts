import { db as defaultDb, drafts } from "@repo/db";
import { draftToTask } from "@repo/domain";
import { and, desc, eq, TransactionRollbackError } from "drizzle-orm";
import { isUuid, type Db } from "./db.ts";
import { addTask } from "./tasks.ts";

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

// Archives the Draft and creates its task, or neither. Returns false when the
// text can't become a task (the Draft stays in the Inbox). A foreign,
// already-filed, or malformed id is a silent no-op.
export async function fileDraftAsTask(
  userId: string,
  draftId: string,
  db: Db = defaultDb,
  input: { today: string; area?: string } = { today: "" },
) {
  if (!isUuid(draftId)) return true;
  try {
    await db.transaction(async (tx) => {
      const [draft] = await tx
        .update(drafts)
        .set({ workspace: "archive" })
        .where(
          and(
            eq(drafts.id, draftId),
            eq(drafts.userId, userId),
            eq(drafts.workspace, "inbox"),
          ),
        )
        .returning({ body: drafts.body });
      if (!draft) return;
      const task = draftToTask(draft.body);
      if (!task || !(await addTask(userId, { ...task, ...input }, tx))) tx.rollback();
    });
    return true;
  } catch (error) {
    if (error instanceof TransactionRollbackError) return false;
    throw error;
  }
}
