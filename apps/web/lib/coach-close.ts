import { dailyCloseToolNames, type CoachData } from "@repo/coach";
import { journalingArticle } from "@repo/coach/knowledge";
import { tool, type UIMessage } from "ai";
import { z } from "zod";
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
    fileDraft: tools.fileDraft,
    listInboxDrafts: tools.listInboxDrafts,
    ...reads,
  } satisfies Record<(typeof dailyCloseToolNames)[number], unknown>;
}

export const cancelsClose = (text: string) => /^(?:cancel|stop|end)(?:\s+(?:daily close|the close|close))?[.!\s]*$/i.test(text.trim());

// Bind writes to this turn's selected day and the person's actual words.
// These adapters still use the existing shared mutations and replay ids.
export function closeData(data: CoachData, day: string, text: string, prior: UIMessage[]): CoachData {
  let filedThisTurn = false;
  const noAnswer = cancelsClose(text) || /^skip\b/i.test(text.trim()) || /\b(?:daily close|close (?:the|my) day)\b/i.test(text);
  const permit = (targetDay?: string) => {
    if (noAnswer) throw new Error("Starting, skipping or cancelling Daily close writes nothing.");
    if (targetDay !== undefined && targetDay !== day) throw new Error("Daily close can write only its selected day.");
  };
  return {
    ...data,
    async appendJournal(userId, input) {
      permit(input.day);
      if (!input.text.trim() || !text.includes(input.text)) throw new Error("Append only the person's exact answer from this turn.");
      if (!data.appendJournal) throw new Error("Journal append is unavailable.");
      return data.appendJournal(userId, input);
    },
    async setMood(userId, input) {
      permit(input.day);
      const named = input.mood === null ? /\b(?:clear|remove)\s+(?:my\s+|the\s+)?mood\b/i.test(text)
        : text.trim().replace(/[.!]$/, "").toLowerCase() === input.mood.toLowerCase()
          || new RegExp(`\\bmood\\s*(?::|=|is|was|to)?\\s*${input.mood}\\b`, "i").test(text);
      if (!named) throw new Error("Ask for an explicit mood; never infer it.");
      if (!data.setMood) throw new Error("Mood is unavailable.");
      return data.setMood(userId, input);
    },
    async fileDraft(userId, input) {
      permit(input.destination.kind === "journal" ? input.destination.day : undefined);
      if (/\b(?:all|everything|every|bulk|rest)\b/i.test(text)) throw new Error("Choose one particular draft; Daily close cannot mass-file.");
      if (filedThisTurn) throw new Error("Daily close files only one draft per reply.");
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
      const direct = /\b(?:file|append)\b/i.test(text) && (text.includes(input.draftId) || listed.some((row) => row.id === input.draftId && namesDraft(text, row)));
      const agreedOffer = agrees && offeredIds.size === 1 && offeredIds.has(input.draftId);
      const choice = direct ? text : agreedOffer ? offer : "";
      const destination = input.destination;
      const namesDestination = destination.kind === "journal" ? /\bjournal\b/i.test(choice) && (choice.includes(day) || /\b(?:today|this day)\b/i.test(choice))
        : destination.kind === "task" ? /\btask\b/i.test(choice)
        : /\bnote\b/i.test(choice) && !!(destination.notebook ?? destination.notebookId) && choice.toLowerCase().includes((destination.notebook ?? destination.notebookId!).toLowerCase());
      if ((!direct && !agreedOffer) || !namesDestination) throw new Error("Wait for agreement to one named draft and destination.");
      if (!data.fileDraft) throw new Error("Inbox filing is unavailable.");
      // Reserve before awaiting: parallel model calls cannot file a second draft.
      filedThisTurn = true;
      return data.fileDraft(userId, input);
    },
  };
}
