import type { HabitTracking } from "@repo/domain";

export function habitFormValues(habit?: HabitTracking & { name: string }) {
  return {
    name: habit?.name ?? "",
    period: habit?.period ?? "day",
    trackMode: habit?.trackMode ?? "once",
    bad: habit?.bad ?? false,
    goal: habit?.goalCount?.toString() ?? "",
  };
}

export type HabitErrorField = "name" | "period" | "trackMode" | "bad" | "goal";

// Server refusals already carry visible text. Keep their field association in
// one place, ordered so conversion errors don't match words in other fields.
export function habitErrorField(message: string): HabitErrorField | null {
  if (message.startsWith("Cannot switch to once:") || message === "Choose once or many-times for this habit.") return "trackMode";
  if (message === "Choose Daily or Weekly for this habit." || message.startsWith("Daily and Weekly can only be switched")) return "period";
  if (message === "Once-habits cannot have a goal." || message.startsWith("Enter a whole-number")) return "goal";
  if (message === "Enter a habit name." || message.startsWith("Habit names can be at most")) return "name";
  if (message === "Choose whether this habit is Bad.") return "bad";
  return null;
}
