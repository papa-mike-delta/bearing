import { coachMessages, coachThreads, db as defaultDb } from "@repo/db";
import type { UIMessage } from "ai";
import { and, asc, eq, sql } from "drizzle-orm";
import { isUuid, type Db } from "./db.ts";
import { cancelsClose } from "./coach-close.ts";

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
// existing id updates only a message of the same thread and role. User text
// is immutable under its id, including concurrent resends, so a
// forged id can't overwrite another thread's message. Returns false when the
// id belongs to another thread or role. Throws if the thread isn't the
// user's (callers check that first).
// A reply passes `answering`, the id of the message it answers, and is placed
// just after it, however long it ran: a reply still running after Stop then
// reloads before anything sent in the meantime. Only a message in the same
// thread counts; otherwise the reply is placed now.
export async function saveMessage(
  userId: string,
  threadId: string,
  message: UIMessage,
  db: Db = defaultDb,
  answering?: string,
  browserToday?: string,
  closeDay?: string | null,
) {
  const [saved] = await db
    .insert(coachMessages)
    .values({
      id: message.id,
      // Null, which the column refuses, unless it is this user's thread.
      threadId: sql`(select ${coachThreads.id} from ${coachThreads} where ${threadOf(userId, threadId)})`,
      role: message.role,
      parts: message.parts,
      browserToday,
      closeDay,
      ...(answering && {
        createdAt: sql`coalesce((select ${coachMessages.createdAt} + interval '1 microsecond' from ${coachMessages} where ${and(eq(coachMessages.id, answering), eq(coachMessages.threadId, threadId))}), now())`,
      }),
    })
    .onConflictDoUpdate({
      target: coachMessages.id,
      set: { parts: sql`excluded.parts_json`, updatedAt: sql`now()` },
      setWhere: sql`${coachMessages.threadId} = excluded.thread_id and ${coachMessages.role} = excluded.role and (${coachMessages.role} <> 'user' or ${coachMessages.parts} = excluded.parts_json)`,
    })
    .returning({ id: coachMessages.id });
  return Boolean(saved);
}

// Bound once on insert, independent of model input and unchanged on resend.
export async function coachMessageContext(userId: string, threadId: string, messageId: string, db: Db = defaultDb) {
  const [message] = await db.select({ today: coachMessages.browserToday, closeDay: coachMessages.closeDay, createdAt: coachMessages.createdAt })
    .from(coachMessages).innerJoin(coachThreads, eq(coachMessages.threadId, coachThreads.id))
    .where(and(threadOf(userId, threadId), eq(coachMessages.id, messageId), eq(coachMessages.role, "user")));
  return message ? { today: message.today ?? "", closeDay: message.closeDay, messageCreatedAt: message.createdAt.getTime() } : null;
}

// Latest user turn decides the mode on reload; never derive it from model text.
export async function coachCloseDay(userId: string, threadId: string, db: Db = defaultDb) {
  const [message] = await db.select({ closeDay: coachMessages.closeDay, parts: coachMessages.parts })
    .from(coachMessages).innerJoin(coachThreads, eq(coachMessages.threadId, coachThreads.id))
    .where(and(threadOf(userId, threadId), eq(coachMessages.role, "user")))
    .orderBy(sql`${coachMessages.createdAt} desc`).limit(1);
  const parts = message?.parts as { type: string; text?: string }[] | undefined;
  return parts?.some((part) => part.type === "text" && cancelsClose(part.text ?? "")) ? null : message?.closeDay ?? null;
}
