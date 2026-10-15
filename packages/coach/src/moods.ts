export const coachMoods = [
  "Very low",
  "Low",
  "Okay",
  "Good",
  "Very good",
] as const;
export type CoachMood = (typeof coachMoods)[number];

export function normalizeCoachMood(value: unknown): unknown {
  if (typeof value !== "string") return value;
  return coachMoods.find((mood) => mood.toLowerCase() === value.trim().toLowerCase()) ?? value;
}
