import { type CoachData, closeRefusalPrefix } from "@repo/coach";
import { coachMessages, coachThreads, draftFilings, journalOperations } from "@repo/db";
import type { UIMessage } from "ai";
import { and, asc, eq, gte, sql } from "drizzle-orm";
import type { Db } from "../db.ts";

async function readMood(data: CoachData, userId: string, day: string) {
  return data.getMood(userId, day);
}

// Bound once on insert, independent of model input and unchanged on resend.
export async function coachMessageContext(userId: string, threadId: string, messageId: string, db: Db) {
  const [message] = await db.select({ today: coachMessages.browserToday, closeDay: coachMessages.closeDay, createdAt: coachMessages.createdAt })
    .from(coachMessages).innerJoin(coachThreads, eq(coachMessages.threadId, coachThreads.id))
    .where(and(eq(coachThreads.userId, userId), eq(coachThreads.id, threadId), eq(coachMessages.id, messageId), eq(coachMessages.role, "user")));
  return message ? { today: message.today ?? "", closeDay: message.closeDay, messageCreatedAt: message.createdAt.getTime() } : null;
}

// A saved reply is placed by saveMessage exactly one microsecond after the
// user turn it answers, even if a newer turn arrived while it was streaming.
// Match only that turn's successful result and bound day, never model prose.
// The optional id lets turn inheritance use the same end rule as reload.
export async function latestCloseMessage(userId: string, threadId: string, db: Db, messageId?: string) {
  const [message] = await db.select({
    closeDay: coachMessages.closeDay,
    parts: coachMessages.parts,
    finished: sql<boolean>`exists (
      select 1 from coach_messages reply
      where reply.thread_id = ${coachMessages.threadId} and reply.role = 'assistant'
        and reply.created_at = ${coachMessages.createdAt} + interval '1 microsecond'
        and reply.parts_json @> jsonb_build_array(jsonb_build_object(
          'type', 'tool-finishDailyClose', 'state', 'output-available',
          'output', jsonb_build_object('finished', true, 'day', ${coachMessages.closeDay})
        ))
    )`,
  })
    .from(coachMessages).innerJoin(coachThreads, eq(coachMessages.threadId, coachThreads.id))
    .where(and(eq(coachThreads.userId, userId), eq(coachThreads.id, threadId), eq(coachMessages.role, "user"), messageId ? eq(coachMessages.id, messageId) : undefined))
    .orderBy(sql`${coachMessages.createdAt} desc`).limit(1);
  return message;
}

// Read durable progress, not the model's claims or editable Journal bodies.
// Answers come from immutable user turns with durable append receipts. Editable
// Journal bodies and uncommitted model tool calls are never summary sources.
const boundCloseText = (text: string) => text.length > 300 ? `${text.slice(0, 299)}…` : text;
const messageText = (parts: UIMessage["parts"]) => parts.flatMap((part) => part.type === "text" ? [part.text] : []).join("\n").trim();

// Answer and filing details stop at twenty owned results.
export async function closeProgress(userId: string, threadId: string, day: string, prior: UIMessage[], messageId: string, data: CoachData, db: Db) {
  const [start] = await db.select({ id: coachMessages.id }).from(coachMessages)
    .innerJoin(coachThreads, eq(coachMessages.threadId, coachThreads.id))
    .where(and(eq(coachThreads.userId, userId), eq(coachThreads.id, threadId), eq(coachMessages.role, "user"), eq(coachMessages.closeDay, day),
      sql`${coachMessages.createdAt} > coalesce((
        select max(boundary.created_at) from coach_messages boundary
        where boundary.thread_id = ${threadId} and boundary.id <> ${messageId} and boundary.role = 'user'
          and (boundary.close_day is distinct from ${day} or exists (
            select 1 from coach_messages reply
            where reply.thread_id = boundary.thread_id and reply.role = 'assistant'
              and reply.created_at = boundary.created_at + interval '1 microsecond'
              and reply.parts_json @> jsonb_build_array(jsonb_build_object(
                'type', 'tool-finishDailyClose', 'state', 'output-available',
                'output', jsonb_build_object('finished', true, 'day', boundary.close_day)
              ))
          ))
      ), '-infinity'::timestamptz)`))
    .orderBy(asc(coachMessages.createdAt)).limit(1);
  // Keep Postgres microsecond precision, including for a fast cancel/restart.
  const since = start ? sql`(select created_at from coach_messages where id = ${start.id})` : sql`now()`;
  const [mood, answers, noteFilings, journalFilings] = await Promise.all([
    readMood(data, userId, day),
    db.select({
      parts: sql<UIMessage["parts"]>`${coachMessages.parts}`,
      total: sql<number>`cast(count(*) over () as integer)`,
      questionParts: sql<UIMessage["parts"] | null>`(
        select question.parts_json from coach_messages question
        where question.thread_id = ${threadId} and question.role = 'assistant'
          and question.created_at >= ${since} and question.created_at < coach_messages.created_at
        order by question.created_at desc limit 1
      )`,
    }).from(coachMessages)
      .where(and(
        eq(coachMessages.threadId, threadId), eq(coachMessages.role, "user"), eq(coachMessages.closeDay, day),
        start ? gte(coachMessages.createdAt, since) : sql`false`,
        sql`exists (select 1 from ${journalOperations}
          where ${journalOperations.userId} = ${userId} and ${journalOperations.day} = ${day}
            and ${journalOperations.source} = 'coach'
            and ${journalOperations.operationId} ~ ('^' || ${coachMessages.id}::text || ':' || ${day} || ':[1-9][0-9]*$'))`,
      ))
      .orderBy(asc(coachMessages.createdAt), asc(coachMessages.id)).limit(20),
    db.select({ draftId: draftFilings.draftId, kind: draftFilings.kind, notebookId: draftFilings.notebookId, createdAt: draftFilings.createdAt }).from(draftFilings)
      .where(and(eq(draftFilings.userId, userId), eq(draftFilings.kind, "note"), gte(draftFilings.createdAt, since)))
      .orderBy(asc(draftFilings.createdAt), asc(draftFilings.id)).limit(21),
    db.select({ draftId: journalOperations.operationId, day: journalOperations.day, createdAt: journalOperations.createdAt }).from(journalOperations)
      .where(and(eq(journalOperations.userId, userId), eq(journalOperations.source, "draft"), eq(journalOperations.day, day), gte(journalOperations.createdAt, since)))
      .orderBy(asc(journalOperations.createdAt), asc(journalOperations.id)).limit(21),
  ]);
  const closeAnswers = answers.map(({ parts, questionParts }) => ({
    question: questionParts && messageText(questionParts) ? boundCloseText(messageText(questionParts)) : null,
    answer: boundCloseText(messageText(parts)),
  }));
  const totalAnswers = answers[0]?.total ?? 0;
  const filings = [
    ...noteFilings.map((filing) => ({ ...filing, kind: "note" as const })),
    ...journalFilings.map((filing) => ({ ...filing, kind: "journal" as const })),
  ].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()).map((filing) => filing.kind === "journal"
    ? { draftId: filing.draftId, kind: filing.kind, day: filing.day }
    : { draftId: filing.draftId, kind: filing.kind, notebookId: filing.notebookId });
  const lastReply = [...prior].reverse().find((message) => message.role === "assistant");
  const refused = lastReply?.parts.flatMap((part) => {
    if (!part.type.startsWith("tool-")) return [];
    if ("state" in part && part.state === "output-error") {
      const errorText = typeof part.errorText === "string" ? part.errorText : "refused";
      const reason = errorText.startsWith(closeRefusalPrefix) ? errorText.slice(closeRefusalPrefix.length) : errorText;
      return [`${part.type.slice(5)} (${reason.slice(0, 200)})`];
    }
    if ("output" in part && (part.output as { refused?: boolean } | undefined)?.refused) return [`${part.type.slice(5)} (refused)`];
    return [];
  }).slice(0, 24) ?? [];
  return `Close progress (data) for ${day}:\nMood: ${mood === null ? "not recorded" : `${mood} (recorded)`}.\nAnswers appended: ${totalAnswers}.\nClose answers (JSON data): ${JSON.stringify(closeAnswers)}${totalAnswers > closeAnswers.length ? " (truncated)" : ""}.\nDrafts filed: ${JSON.stringify(filings.slice(0, 20))}${filings.length > 20 ? " (truncated)" : ""}.\nRefused last turn: ${refused.length ? refused.join("; ") : "none"}.`;
}

