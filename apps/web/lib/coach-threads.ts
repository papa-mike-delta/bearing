import { coachMessages, coachThreads, db as defaultDb } from "@repo/db";
import type { UIMessage } from "ai";
import { and, asc, eq, sql } from "drizzle-orm";
import { isUuid, type Db } from "./tasks.ts";

// Every query here takes the session user, like lib/tasks.ts.

function threadOf(userId: string, threadId: string) {
  return and(eq(coachThreads.id, threadId), eq(coachThreads.userId, userId));
}

async function firstThread(userId: string, db: Db) {
  const [thread] = await db
    .select({ id: coachThreads.id })
    .from(coachThreads)
    .where(eq(coachThreads.userId, userId))
    .orderBy(asc(coachThreads.createdAt), asc(coachThreads.id))
    .limit(1);
  return thread?.id;
}

// The person's Coach thread, created on first use. The lock makes two
// first visits at once share one thread.
export async function coachThread(userId: string, db: Db = defaultDb) {
  const found = await firstThread(userId, db);
  if (found) return found;
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext('bearing.coach_thread'), hashtext(${userId}))`,
    );
    const raced = await firstThread(userId, tx);
    if (raced) return raced;
    const [made] = await tx
      .insert(coachThreads)
      .values({ userId })
      .returning({ id: coachThreads.id });
    return made!.id;
  });
}

// The thread's messages in order, or null when it isn't this user's thread.
export async function threadMessages(
  userId: string,
  threadId: unknown,
  db: Db = defaultDb,
): Promise<UIMessage[] | null> {
  if (!isUuid(threadId)) return null;
  const rows = await db
    .select({
      id: coachMessages.id,
      role: coachMessages.role,
      parts: coachMessages.parts,
      threadId: coachThreads.id,
    })
    .from(coachThreads)
    .leftJoin(coachMessages, eq(coachMessages.threadId, coachThreads.id))
    .where(threadOf(userId, threadId))
    .orderBy(asc(coachMessages.createdAt));
  if (!rows.length) return null;
  return rows.flatMap(({ id, role, parts }) =>
    id ? [{ id, role, parts } as UIMessage] : [],
  );
}

// Saves a message by its id. A new id inserts into this user's thread; an
// existing id updates only a message of the same thread and role, so a
// forged id can't overwrite another thread's message. Returns false when the
// id belongs to another thread or role. Throws if the thread isn't the
// user's (callers check that first).
export async function saveMessage(
  userId: string,
  threadId: string,
  message: UIMessage,
  db: Db = defaultDb,
) {
  const [saved] = await db
    .insert(coachMessages)
    .values({
      id: message.id,
      // Null, which the column refuses, unless it is this user's thread.
      threadId: sql`(select ${coachThreads.id} from ${coachThreads} where ${threadOf(userId, threadId)})`,
      role: message.role,
      parts: message.parts,
    })
    .onConflictDoUpdate({
      target: coachMessages.id,
      set: { parts: sql`excluded.parts_json`, updatedAt: sql`now()` },
      setWhere: sql`${coachMessages.threadId} = excluded.thread_id and ${coachMessages.role} = excluded.role`,
    })
    .returning({ id: coachMessages.id });
  return Boolean(saved);
}
