import { createHash } from "node:crypto";

// Inputs have already passed their tool schema. Resolve defaults before counting
// occurrences, so unrelated calls and provider call ids cannot shift a replay.
export function coachWriteKey(tool: string, input: Record<string, unknown>, today?: string) {
  let normalized: Record<string, unknown>;
  if (tool === "createHabit") {
    const goalCount = input.goalCount ?? null;
    normalized = { name: String(input.name).trim(), period: input.period ?? "day", trackMode: input.trackMode ?? (goalCount === null ? "once" : "many"), goalCount, bad: input.bad ?? false };
  } else {
    const day = input.day === undefined || input.day === "today" ? today : input.day;
    normalized = tool === "appendJournal"
      ? { day, text: String(input.text).trim() }
      : { habitId: input.habitId, action: input.action, day, count: input.count ?? null };
  }
  return createHash("sha256").update(JSON.stringify(Object.keys(normalized).sort().map(key => [key, normalized[key]]))).digest("hex").slice(0, 32);
}
