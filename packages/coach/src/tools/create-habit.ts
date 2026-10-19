import { habitCountCap, isCalendarDay, maxHabitNameLength } from "@repo/domain";
import { z } from "zod";
import type { ToolRunContext } from "../data.ts";

const inputSchema = z.object({
  name: z.string().trim().min(1).max(maxHabitNameLength),
  period: z.enum(["day", "week"]).optional(),
  trackMode: z.enum(["once", "many"]).optional(),
  goalCount: z.number().int().positive().nullable().optional(),
  bad: z.boolean().optional(),
});

export const habitWriteStateSchema = z.object({
  id: z.uuid(), name: z.string().min(1),
  period: z.enum(["day", "week"]), trackMode: z.enum(["once", "many"]),
  goalCount: z.number().int().positive().nullable(), bad: z.boolean(),
  count: z.number().int().nonnegative(), done: z.boolean(), due: z.boolean(),
  streak: z.number().int().nonnegative().nullable(), record: z.number().int().nonnegative().nullable(),
});

// Like Journal appends, use the call's reserved position, never a provider id
// which may change on resend. The message id fixes the person's request.
export function coachHabitOperationId(messageId: string, tool: "createHabit" | "trackHabit", ordinal: number) {
  return `${messageId}:${tool}:${ordinal}`;
}

export const createHabit = {
  description: "Create a habit only on an explicit ask or acceptance of a proposal. A name alone defaults to daily once, not Bad. Infer Bad for stop/cut down/do less and name the lapse: Quit smoking means Smoking, Bad daily once; say you marked it Bad, without asking again. Count my cigarettes means Bad daily many-times with no goal; ask nothing. Ask if the behaviour is unclear. Non-Bad many-times needs a goal; above 99 with no period asks, never guesses weekly. Daily maximum 99; weekly maximum 999. Returns the new state in listHabits form, with a Habits link.",
  inputSchema,
  async run(input: z.infer<typeof inputSchema>, { userId, messageId, today, data, habitOrdinal }: ToolRunContext & { habitOrdinal: number }) {
    const parsed = inputSchema.parse(input);
    if (!today || !isCalendarDay(today)) throw new Error("Supply the browser's Today as a real YYYY-MM-DD calendar day, then retry.");
    const { name, bad = false, goalCount = null } = parsed;
    const period = parsed.period ?? "day";
    const trackMode = parsed.trackMode ?? (goalCount === null ? "once" : "many");
    if (goalCount !== null && goalCount > 99 && parsed.period === undefined) {
      return { refused: true as const, clarification: "Is this daily or weekly? The daily maximum is 99; the weekly maximum is 999." };
    }
    if (goalCount !== null && goalCount > habitCountCap(period)) {
      return { refused: true as const, clarification: `The ${period === "day" ? "daily" : "weekly"} maximum is ${habitCountCap(period)}.` };
    }
    if (trackMode === "many" && !bad && goalCount === null) {
      return { refused: true as const, clarification: "What goal would you like for each day or week?" };
    }
    if (trackMode === "once" && goalCount !== null) return { refused: true as const, clarification: "Once-habits cannot have a goal. Should this be many-times?" };
    if (!data.createHabit) throw new Error("Habits are unavailable.");
    const result = await data.createHabit(userId, { name, period, trackMode, goalCount, bad, today, source: "coach", operationId: coachHabitOperationId(messageId, "createHabit", habitOrdinal) });
    return { ...habitWriteStateSchema.parse(result), href: "/habits" };
  },
};
