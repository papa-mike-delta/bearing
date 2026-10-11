import { z } from "zod";
import type { ToolRunContext } from "../data.ts";
import { journalDaySchema, resolveCoachJournalDay } from "./append-journal.ts";

import { coachMoods } from "../moods.ts";
const inputSchema = z.object({
  day: journalDaySchema,
  mood: z.enum(coachMoods).nullable(),
});

export const setMood = {
  description:
    "Set only one of the five mood words the person explicitly stated: Very low, Low, Okay, Good, Very good. Never infer a mood from prose or a reflection. Pass null only when the person explicitly asks to clear. day is today (or omitted) or a named past YYYY-MM-DD day, resolved only from this turn's browser Today. Future days are refused. Returns a link to the day.",
  inputSchema,
  async run(
    input: z.infer<typeof inputSchema>,
    { userId, today, messageCreatedAt, data }: ToolRunContext,
  ) {
    const parsed = inputSchema.parse(input);
    const day = resolveCoachJournalDay(parsed.day, today);
    if (!data.setMood || messageCreatedAt === undefined)
      throw new Error("Mood is unavailable. Please retry.");
    const result = await data.setMood(userId, {
      day,
      today: today!,
      mood: parsed.mood,
      setAt: messageCreatedAt,
    });
    if (
      result.day !== day ||
      !inputSchema.shape.mood.safeParse(result.mood).success
    )
      throw new Error("Invalid Mood result.");
    // A stale replay returns the current choice; never claim the older choice was applied.
    return { day, mood: result.mood, href: `/journal/${day}` };
  },
};
