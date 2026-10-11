import { CloseRefusal, closeRefusalPrefix, dailyCloseToolNames, type CoachData } from "@repo/coach";
import { journalingArticle } from "@repo/coach/knowledge";
import { tool, type UIMessage } from "ai";
import { z } from "zod";
import { coachMessages, coachThreads, draftFilings, journalOperations } from "@repo/db";
import { and, asc, count, eq, gte, sql } from "drizzle-orm";
import type { Db } from "./db.ts";
import { getMood } from "./mood.ts";
import type { coachTools } from "./coach-tools.ts";

// Construct a separate tool set. activeTools alone is provider guidance and
// must not be trusted to stop a model emitting an unadvertised tool call.
export function closeTools(tools: ReturnType<typeof coachTools>, data: CoachData, userId: string, day: string) {
  const reads = {
    readJournalDay: tool({
      description: "Read only the selected owned Journal day, at most 4,000 characters; truncated is explicit. No day/id input.",
      inputSchema: z.strictObject({}),
      execute: async () => {
        if (!data.readJournalDay) throw new Error("Journal read is unavailable.");
        return data.readJournalDay(userId, day);
      },
    }),
    getJournalTemplate: tool({
      description: "Read the saved Journal template, or the starter if none is saved; at most 10,000 characters.",
      inputSchema: z.strictObject({}),
      execute: async () => {
        if (!data.getJournalTemplate) throw new Error("Journal template is unavailable.");
        return data.getJournalTemplate(userId);
      },
    }),
    readJournalingArticle: tool({
      description: "Read Journaling: evidence and limits, with citable research sources. Static knowledge only, no user text or web research.",
      inputSchema: z.strictObject({}),
      execute: journalingArticle,
    }),
  };
  return {
    appendJournal: tools.appendJournal,
    setMood: tools.setMood,
    fileDraft: {
      ...tools.fileDraft,
      description: "File the particular draft offered in the preceding reply, after affirmative consent, as a Note in an existing named Notebook or this selected Journal day. At most one draft per reply; extra calls return the earlier success.",
    },
    listInboxDrafts: tools.listInboxDrafts,
    listNotebooks: tools.listNotebooks,
    ...reads,
  } satisfies Record<(typeof dailyCloseToolNames)[number], unknown>;
}

export const cancelsClose = (text: string) => /^(?:cancel|stop|end)(?:\s+(?:daily close|the close|close))?[.!?,;:\s]*$/i.test(text.trim());

// Read durable progress, not the model's claims or editable Journal bodies.
// Counts have constant size; filing details stop at twenty owned results.
export async function closeProgress(userId: string, threadId: string, day: string, prior: UIMessage[], messageId: string, db: Db) {
  const [start] = await db.select({ createdAt: coachMessages.createdAt }).from(coachMessages)
    .innerJoin(coachThreads, eq(coachMessages.threadId, coachThreads.id))
    .where(and(eq(coachThreads.userId, userId), eq(coachThreads.id, threadId), eq(coachMessages.role, "user"), eq(coachMessages.closeDay, day),
      sql`${coachMessages.createdAt} > coalesce((select max(boundary.created_at) from coach_messages boundary where boundary.thread_id = ${threadId} and boundary.id <> ${messageId} and boundary.role = 'user' and boundary.close_day is distinct from ${day}), '-infinity'::timestamptz)`))
    .orderBy(asc(coachMessages.createdAt)).limit(1);
  const since = start?.createdAt ?? new Date();
  const [mood, [answers], noteFilings, journalFilings] = await Promise.all([
    getMood(userId, day, db),
    db.select({ total: count() }).from(journalOperations)
      .where(and(eq(journalOperations.userId, userId), eq(journalOperations.day, day), eq(journalOperations.source, "coach"))),
    db.select({ draftId: draftFilings.draftId, kind: draftFilings.kind, notebookId: draftFilings.notebookId, createdAt: draftFilings.createdAt }).from(draftFilings)
      .where(and(eq(draftFilings.userId, userId), eq(draftFilings.kind, "note"), gte(draftFilings.createdAt, since)))
      .orderBy(asc(draftFilings.createdAt), asc(draftFilings.id)).limit(21),
    db.select({ draftId: journalOperations.operationId, day: journalOperations.day, createdAt: journalOperations.createdAt }).from(journalOperations)
      .where(and(eq(journalOperations.userId, userId), eq(journalOperations.source, "draft"), eq(journalOperations.day, day), gte(journalOperations.createdAt, since)))
      .orderBy(asc(journalOperations.createdAt), asc(journalOperations.id)).limit(21),
  ]);
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
  return `Close progress (data) for ${day}:\nMood: ${mood === null ? "not recorded" : `${mood} (recorded)`}.\nAnswers appended: ${answers!.total}.\nDrafts filed: ${JSON.stringify(filings.slice(0, 20))}${filings.length > 20 ? " (truncated)" : ""}.\nRefused last turn: ${refused.length ? refused.join("; ") : "none"}.`;
}

const skipsClose = (text: string) => /^(?:skip(?:\s+this)?|next)[.!?,;:\s]*$/i.test(text.trim());
const negation = /\b(?:not|no|don['’]t|leave\s+it\s+unset)\b/i;

function namesMood(text: string, mood: string) {
  // Match compound moods first, so Very good does not also count as Good.
  const words = [...text.matchAll(/\b(?:very\s+low|very\s+good|low|okay|good)\b/gi)];
  const named = new Set(words.map(([word]) => word.toLowerCase().replace(/\s+/g, " ")));
  if (named.size !== 1 || !named.has(mood.toLowerCase())) return false;
  return words.every((word) => {
    // Negation in the same sentence vetoes a choice, including commands
    // such as "Don't set my mood to Good". Also catch "Good? No."
    const before = text.slice(0, word.index).split(/[.!?;\n]/).at(-1) ?? "";
    const remaining = text.slice(word.index + word[0].length);
    const after = remaining.split(/[.!?;\n]/)[0] ?? "";
    return !negation.test(`${before} ${word[0]} ${after}`)
      && !/^\s*[.!?;]\s*(?:no|not|don['’]t)\b/i.test(remaining);
  }) && !/\bleave\s+it\s+unset\b/i.test(text);
}

// Bind writes to this turn's selected day and the person's actual words.
// These adapters still use the existing shared mutations and replay ids.
export function closeData(data: CoachData, day: string, text: string, prior: UIMessage[], messageId: string, openingClose: boolean, db: Db): CoachData {
  let filing: ReturnType<NonNullable<CoachData["fileDraft"]>> | undefined;
  let journalReplayId: string | undefined;
  const noAnswer = openingClose || cancelsClose(text) || skipsClose(text);
  const permit = (targetDay?: string) => {
    if (noAnswer) throw new CloseRefusal("starting, skipping or cancelling writes nothing");
    if (targetDay !== undefined && targetDay !== day) throw new CloseRefusal("only the selected day is allowed");
  };
  return {
    ...data,
    async appendJournal(userId, input) {
      permit(input.day);
      const answer = text.trim();
      if (!answer) throw new CloseRefusal("no answer to append");
      if (!data.appendJournal) throw new Error("Journal append is unavailable.");
      // Ignore the model's substring. The payload is the whole trimmed person
      // message. Replay identity is the first appendJournal ordinal this turn
      // (`messageId:day:n`); later calls write that same answer and reuse it.
      if (!input.operationId.startsWith(`${messageId}:`)) throw new Error("Journal append is unavailable.");
      journalReplayId ??= input.operationId;
      return data.appendJournal(userId, { ...input, text: answer, operationId: journalReplayId });
    },
    async setMood(userId, input) {
      permit(input.day);
      // A repeated choice reports the stored success without moving its
      // timestamp or requiring fresh authorization for a write we won't make.
      const storedMood = await getMood(userId, day, db);
      if (input.mood !== null && storedMood === input.mood) return { day, mood: input.mood };
      const named = input.mood === null ? /\b(?:clear|remove|unset)\s+my\s+mood\b/i.test(text) && !negation.test(text)
        : namesMood(text, input.mood);
      if (!named) throw new CloseRefusal("no explicit mood");
      if (storedMood === input.mood) return { day, mood: input.mood };
      if (!data.setMood) throw new Error("Mood is unavailable.");
      return data.setMood(userId, input);
    },
    async fileDraft(userId, input) {
      permit(input.destination.kind === "journal" ? input.destination.day : undefined);
      if (input.destination.kind === "task") throw new CloseRefusal("choose Note or this Journal day");
      if (filing) return filing;
      const lastReply = [...prior].reverse().find((message) => message.role === "assistant");
      const offer = lastReply?.parts.flatMap((part) => part.type === "text" ? [part.text] : []).join(" ") ?? "";
      // Stored bounded reads let consent survive reload and a retry after the
      // chosen draft has been archived. The mutation still checks ownership.
      const listed = prior.flatMap((message) => message.parts).flatMap((part) => {
        if (part.type !== "tool-listInboxDrafts" || !("output" in part)) return [];
        const output = part.output as { drafts?: { id: string; excerpt: string }[] } | undefined;
        return output?.drafts ?? [];
      });
      const namesDraft = (words: string, row: { id: string; excerpt: string }) => words.includes(row.id) || (!!row.excerpt.trim() && words.includes(row.excerpt.trim()));
      const offeredIds = new Set(listed.filter((row) => namesDraft(offer, row)).map((row) => row.id));
      const agrees = /^(?:yes|ok(?:ay)?|sure|please do|file it|go ahead)\b/i.test(text.trim());
      const agreedOffer = agrees && offeredIds.size === 1 && offeredIds.has(input.draftId);
      const destination = input.destination;
      const namesDestination = destination.kind === "journal" ? /\bjournal\b/i.test(offer) && (offer.includes(day) || /\b(?:today|this day)\b/i.test(offer))
        : /\bnote\b/i.test(offer) && !!(destination.notebook ?? destination.notebookId) && offer.toLowerCase().includes((destination.notebook ?? destination.notebookId!).toLowerCase());
      const changedDestination = [...text.matchAll(/\bas\s+(?:a\s+)?(task|note|journal)\b/gi)]
        .some((match) => match[1]!.toLowerCase() !== destination.kind);
      if (!agreedOffer || !namesDestination || negation.test(text) || /\b(?:instead|but)\b/i.test(text) || changedDestination) throw new CloseRefusal("no agreement to one named draft and destination");
      if (!data.fileDraft) throw new Error("Inbox filing is unavailable.");
      // Reserve before awaiting: parallel model calls cannot file a second draft.
      filing = data.fileDraft(userId, input);
      return filing;
    },
  };
}
