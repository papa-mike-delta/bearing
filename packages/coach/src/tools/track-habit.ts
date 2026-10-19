import { isCalendarDay } from "@repo/domain";
import { z } from "zod";
import type { ToolRunContext } from "../data.ts";
import { journalDaySchema } from "./append-journal.ts";
import { coachHabitOperationId, habitWriteStateSchema } from "./create-habit.ts";

const inputSchema = z.object({
  habitId: z.uuid().describe("An owned id read from listHabits; never a guessed name. Ask which one when names match more than one habit."),
  action: z.enum(["did", "undo", "didnt", "markDone"]),
  day: journalDaySchema,
});

const resultSchema = habitWriteStateSchema.extend({
  day: z.string().refine(isCalendarDay),
  action: inputSchema.shape.action,
  changed: z.boolean(),
});

export const trackHabit = {
  description: "Track only an explicitly reported occurrence, undo, I didn't, or mark it done, using an id from listHabits. Ask which habit if names are ambiguous; never guess. did checks once or adds exactly one, for each new report; never ask if it is a repeat (resends are ignored, undo fixes an extra); undo clears once or removes one. On Bad, didnt leaves an empty period empty and clears only an existing log. markDone raises a many-times count to its goal and never lowers a higher count; call it even when already done, so the No change receipt shows; Bad many-times without a goal needs a question. Never invent extra logs. Omitted day uses browser Today; named past periods allowed, future periods refused. Weekly dates mean their Monday–Sunday week. Returns the new listHabits state for the affected period.",
  inputSchema,
  async run(input: z.infer<typeof inputSchema>, { userId, messageId, today, data, habitOrdinal }: ToolRunContext & { habitOrdinal: number }) {
    const parsed = inputSchema.parse(input);
    if (!today || !isCalendarDay(today)) throw new Error("Supply the browser's Today as a real YYYY-MM-DD calendar day, then retry.");
    const day = parsed.day === undefined || parsed.day === "today" ? today : parsed.day;
    if (!data.trackHabit) throw new Error("Habits are unavailable.");
    // Persistence resolves the period and replay before reading today's habit
    // definition: edits and deletion must not invalidate an earlier success.
    const result = await data.trackHabit(userId, { habitId: parsed.habitId, action: parsed.action, day, today, source: "coach", operationId: coachHabitOperationId(messageId, "trackHabit", habitOrdinal) });
    return { ...resultSchema.parse(result), href: "/habits" };
  },
};
