import { db, drafts } from "@repo/db";
import { draftToTask } from "@repo/domain";
import { and, desc, eq } from "drizzle-orm";
import { addTask } from "./tasks";

// Every query here takes the session user.

export async function captureDraft(userId: string, body: string) {
  await db.insert(drafts).values({ userId, body });
}

export async function inboxDrafts(userId: string) {
  return db
    .select({ id: drafts.id, body: drafts.body })
    .from(drafts)
    .where(and(eq(drafts.userId, userId), eq(drafts.workspace, "inbox")))
    .orderBy(desc(drafts.createdAt));
}

export async function fileDraftAsTask(userId: string, draftId: string) {
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
    const task = draft && draftToTask(draft.body);
    if (task) await addTask(userId, task, tx);
  });
}
