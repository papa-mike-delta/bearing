import { isCalendarDay, maxNoteBodyLength } from "@repo/domain";
import { z } from "zod";
import type { ToolRunContext } from "../data.ts";

export const journalDaySchema = z
  .union([
    z.literal("today"),
    z.string().refine(isCalendarDay, "Use a real YYYY-MM-DD calendar day."),
  ])
  .optional();

export function resolveCoachJournalDay(
  day: string | undefined,
  today: string | undefined,
) {
  if (!today || !isCalendarDay(today))
    throw new Error(
      "Supply the browser's Today as a real YYYY-MM-DD calendar day, then retry.",
    );
  const resolved = day === undefined || day === "today" ? today : day;
  if (!isCalendarDay(resolved))
    throw new Error("Use a real YYYY-MM-DD calendar day.");
  if (resolved > today) throw new Error("This day is not open yet.");
  return resolved;
}

// Replay identity is the turn position, not the text. The Journal mutation
// still hashes [day, text] and conflicts when a resend changes the payload.
export function coachJournalOperationId(
  messageId: string,
  day: string,
  n: number,
) {
  return `${messageId}:${day}:${n}`;
}

const inputSchema = z.object({
  day: journalDaySchema,
  text: z
    .string()
    .max(maxNoteBodyLength)
    .refine((text) => Boolean(text.trim()), "Use nonempty reflection text."),
});

export const appendJournal = {
  description:
    "Append only the exact reflection text the person explicitly asks to save. Never invent or rewrite a reflection. day is today (or omitted) or a named past YYYY-MM-DD day; resolve relative requests only from the browser's Today supplied with this turn, never a server date. Future days are refused. No Journal contents are read. Returns a link to the saved day.",
  inputSchema,
  async run(
    input: z.infer<typeof inputSchema>,
    {
      userId,
      messageId,
      today,
      data,
      appendOrdinal,
    }: ToolRunContext & { appendOrdinal: number },
  ) {
    const parsed = inputSchema.parse(input);
    const day = resolveCoachJournalDay(parsed.day, today);
    if (!data.appendJournal) throw new Error("Journal is unavailable.");
    const result = await data.appendJournal(userId, {
      day,
      today: today!,
      text: parsed.text,
      source: "coach",
      operationId: coachJournalOperationId(messageId, day, appendOrdinal),
    });
    if (result.day !== day || !z.uuid().safeParse(result.id).success)
      throw new Error("Invalid Journal result.");
    return { ...result, href: `/journal/${day}` };
  },
};
