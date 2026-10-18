import type { HabitPeriod } from "@repo/domain";

// A streak or record length with its unit: singular only for exactly 1.
export function habitRunLength(value: number, period: HabitPeriod): string {
  const unit = period === "week" ? "week" : "day";
  return `${value} ${unit}${value === 1 ? "" : "s"}`;
}
