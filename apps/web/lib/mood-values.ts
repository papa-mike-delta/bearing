export const moods = ["Very low", "Low", "Okay", "Good", "Very good"] as const;
export type Mood = (typeof moods)[number];
