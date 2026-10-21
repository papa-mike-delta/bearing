import { parseHabitCountTotal } from "@repo/domain";

export type HabitCountEdit = { text: string; stored: number; active: boolean };

// Closing synchronously consumes Enter before its resulting blur can save again.
export function finishHabitCountEdit(state: HabitCountEdit, event: "Enter" | "blur" | "Escape", cap: number): { state: HabitCountEdit; save?: number; error?: string } {
  if (!state.active) return { state };
  const closed = { ...state, active: false };
  if (event === "Escape") return { state: closed };
  const parsed = parseHabitCountTotal(state.text, cap);
  if (!parsed.ok) return { state: closed, error: parsed.kind === "over-cap" ? `Up to ${parsed.cap}` : undefined };
  return { state: closed, save: parsed.value === state.stored ? undefined : parsed.value };
}

// Keep the prior count for rollback; an over-cap press is refused, not clipped.
export function optimisticHabitCount(prior: number, delta: 1 | -1, cap: number) {
  const next = prior + delta;
  return { prior, count: next >= 0 && next <= cap ? next : prior };
}

export function settleHabitCount(change: { prior: number; count: number }, result: { count: number } | { error: string }) {
  return "error" in result ? { count: change.prior, error: result.error } : { count: result.count, error: "" };
}

export type HabitCountError = { message: string; interaction: number };

// Feedback belongs to the interaction that produced it. A later pointer,
// keyboard or click interaction with this habit retires that feedback.
export function currentHabitCountError(error: HabitCountError, interaction: number) {
  return error.interaction === interaction ? error.message : "";
}
