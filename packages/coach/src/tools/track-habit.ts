import { isCalendarDay } from "@repo/domain";
import { z } from "zod";
import { coachWriteKey } from "../write-identity.ts";
import type { ToolRunContext } from "../data.ts";
import { journalDaySchema } from "./append-journal.ts";
import { coachHabitOperationId, habitWriteStateSchema } from "./create-habit.ts";

const inputSchema = z.object({
  habitId: z.uuid().describe("An owned id read from listHabits; never a guessed name. Ask which one when names match more than one habit."),
  action: z.enum(["did", "undo", "didnt", "markDone", "setCount"]),
  count: z.number().int().min(0).max(999).optional(),
  day: journalDaySchema,
}).refine((input) => input.action !== "setCount" || input.count !== undefined, { message: "setCount requires a count", path: ["count"] });

const resultSchema = habitWriteStateSchema.extend({
  day: z.string().refine(isCalendarDay),
  action: z.enum(["did", "undo", "didnt", "markDone", "setCount"]),
  changed: z.boolean(),
});

const refusalSchema = z.object({
  refused: z.literal(true),
  reason: z.enum(["nothingToUndo", "changedSince"]),
  id: z.uuid(),
  name: z.string().min(1),
  period: z.enum(["day", "week"]),
  day: z.string().refine(isCalendarDay),
  action: z.literal("undo"),
  count: z.number().int().min(0),
  question: z.string().min(1),
});

export const trackHabit = {
  description: "Track only an explicitly reported occurrence, undo, I didn't, or mark it done, using an id from listHabits. Ask which habit if names are ambiguous; never guess. did checks once or adds exactly one, for each new report; never ask if it is a repeat (resends are ignored, undo fixes an extra); undo restores the habit to before your last update to it; it never subtracts one. If it refuses, ask the total. A refused undo wrote nothing; it is true, never a guess. On Bad, didnt leaves an empty period empty and clears only an existing log. For a habit that is not Bad, markDone raises a many-times count to its goal and never lowers a higher count; call it even when already done, so the No change receipt shows; On every Bad many-times habit, markDone is refused: ask one question naming the habit, period count and limit if any, explaining that marking done would log unreported lapses, and asking the total; no tool call in that reply. setCount records a stated total for any many-times habit, never once: plain numbers are totals; N more means listHabits count plus N, and say the total. N fewer or one less is not undo: subtract from the listHabits count and use setCount for the total. None or that’s all writes nothing. Ask once only if total versus addition is genuinely unclear. Daily cap 99; weekly cap 999. Never invent extra logs. Omitted day uses browser Today; named past periods allowed, future periods refused. Weekly dates mean their Monday–Sunday week. Returns the new listHabits state for the affected period.",
  inputSchema,
  async run(input: z.infer<typeof inputSchema>, { userId, messageId, today, data, habitOrdinal }: ToolRunContext & { habitOrdinal: number }) {
    const parsed = inputSchema.parse(input);
    if (!today || !isCalendarDay(today)) throw new Error("Supply the browser's Today as a real YYYY-MM-DD calendar day, then retry.");
    const day = parsed.day === undefined || parsed.day === "today" ? today : parsed.day;
    if (!data.trackHabit) throw new Error("Habits are unavailable.");
    // Persistence resolves the period and replay before reading today's habit
    // definition: edits and deletion must not invalidate an earlier success.
    const result = await data.trackHabit(userId, { habitId: parsed.habitId, action: parsed.action, day, ...(parsed.action === "setCount" ? { count: parsed.count } : {}), today, source: "coach", operationId: coachHabitOperationId(messageId, "trackHabit", habitOrdinal, coachWriteKey("trackHabit", parsed, today)) });
    if ("refused" in result && result.refused) return { ...refusalSchema.parse(result), href: "/habits" };
    return { ...resultSchema.parse(result), href: "/habits" };
  },
};
