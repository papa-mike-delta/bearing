import { type CoachData, closeRefusalPrefix } from "@repo/coach";
import { coachMessages, coachThreads, draftFilings, journalOperations, dayScores } from "@repo/db";
import type { UIMessage } from "ai";
import { and, asc, eq, gte, sql, type SQL } from "drizzle-orm";
import type { Db } from "../db.ts";
import { startsNewClose } from "./state.ts";

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

// New finish receipts identify the answered user turn directly. Older saved
// receipts fall back to the interval before the next user turn, never an
// exact microsecond offset. A late reply cannot finish a newer user turn.
function finishedClose(id: SQL, thread: SQL, createdAt: SQL, day: SQL) {
  return sql<boolean>`exists (
    select 1 from coach_messages reply, jsonb_array_elements(reply.parts_json) part
    where reply.thread_id = ${thread} and reply.role = 'assistant'
      and part @> jsonb_build_object(
        'type', 'tool-finishDailyClose', 'state', 'output-available',
        'output', jsonb_build_object('finished', true, 'day', ${day})
      )
      and (part->'output'->>'messageId' = ${id}::text or (
        not (part->'output' ? 'messageId')
        and reply.created_at > ${createdAt}
        and reply.created_at < coalesce((
          select min(next_turn.created_at) from coach_messages next_turn
          where next_turn.thread_id = ${thread} and next_turn.role = 'user'
            and next_turn.created_at > ${createdAt}
        ), 'infinity'::timestamptz)
      ))
  )`;
}

export async function latestCloseMessage(userId: string, threadId: string, db: Db, messageId?: string) {
  const [message] = await db.select({
    closeDay: coachMessages.closeDay,
    parts: coachMessages.parts,
    finished: finishedClose(sql`${coachMessages.id}`, sql`${coachMessages.threadId}`, sql`${coachMessages.createdAt}`, sql`${coachMessages.closeDay}`),
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
export async function closeProgress(userId: string, threadId: string, day: string, prior: UIMessage[], messageId: string, data: CoachData, db: Db, fresh = false) {
  const opening = [...prior].reverse().find((m) => m.role === "user" && startsNewClose(messageText(m.parts)));
  const [start] = await db.select({ id: coachMessages.id }).from(coachMessages)
    .innerJoin(coachThreads, eq(coachMessages.threadId, coachThreads.id))
    .where(and(eq(coachThreads.userId, userId), eq(coachThreads.id, threadId), eq(coachMessages.role, "user"), eq(coachMessages.closeDay, day),
      fresh ? sql`false` : undefined,
      opening ? gte(coachMessages.createdAt, sql`(select created_at from coach_messages where id = ${opening.id})`) : undefined,
      sql`${coachMessages.createdAt} > coalesce((
        select max(boundary.created_at) from coach_messages boundary
        where boundary.thread_id = ${threadId} and boundary.id <> ${messageId} and boundary.role = 'user'
          and (boundary.close_day is distinct from ${day} or ${finishedClose(sql`boundary.id`, sql`boundary.thread_id`, sql`boundary.created_at`, sql`boundary.close_day`)})
      ), '-infinity'::timestamptz)`))
    .orderBy(asc(coachMessages.createdAt)).limit(1);
  // Keep Postgres microsecond precision, including for a fast cancel/restart.
  const since = start ? sql`(select created_at from coach_messages where id = ${start.id})` : sql`now()`;
  const [storedMood, answers, noteFilings, journalFilings, moodWrites] = await Promise.all([
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
    db.select({ day: dayScores.day }).from(dayScores).where(and(
      eq(dayScores.userId, userId), eq(dayScores.day, day),
      start ? gte(dayScores.moodSetAt, since) : sql`false`,
    )).limit(1),
  ]);
  const sessionPrior = start ? prior.slice(prior.findIndex((m) => m.id === start.id)) : [];
  // Equality replays do not move mood_set_at, so their persisted receipt also
  // counts. A day's pre-existing mood alone is never this close's progress.
  const moodReceipt = sessionPrior.flatMap((m) => m.parts).some((part) =>
    part.type === "tool-setMood" && part.state === "output-available" &&
    (part.output as { day?: string } | undefined)?.day === day);
  const mood = moodWrites.length || moodReceipt ? storedMood : null;
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
  const lastReply = [...sessionPrior].reverse().find((message) => message.role === "assistant");
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
  return { startId: start?.id, text: `Close progress (data) for ${day}:\nMood: ${mood === null ? "not recorded" : `${mood} (recorded)`}.\nAnswers appended: ${totalAnswers}.\nClose answers (JSON data): ${JSON.stringify(closeAnswers)}${totalAnswers > closeAnswers.length ? " (truncated)" : ""}.\nDrafts filed: ${JSON.stringify(filings.slice(0, 20))}${filings.length > 20 ? " (truncated)" : ""}.\nRefused last turn: ${refused.length ? refused.join("; ") : "none"}.` };
}

