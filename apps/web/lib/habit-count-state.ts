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
