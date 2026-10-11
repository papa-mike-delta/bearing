export const coachMoods = [
  "Very low",
  "Low",
  "Okay",
  "Good",
  "Very good",
] as const;
export type CoachMood = (typeof coachMoods)[number];
