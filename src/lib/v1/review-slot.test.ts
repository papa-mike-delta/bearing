import { expect, it } from "vitest";
import { ReviewSlot } from "./review-slot";

const daily = {
  id: "daily-review",
  period: "daily",
  localDate: "2026-10-24",
  prompts: { wins: "A daily pause" },
};
const reviews = [daily];

it("keeps weekly when the date is filled after the period", () => {
  let slot = { period: "daily", localDate: "2026-10-24" };
  const chosen = ReviewSlot.next(slot, { period: "weekly" });
  expect(ReviewSlot.match(reviews, chosen.period, chosen.localDate)).toBeUndefined();
  slot = chosen;
  const dated = ReviewSlot.next(slot, { localDate: "2026-10-24" });
  expect(dated).toEqual({ period: "weekly", localDate: "2026-10-24" });
  expect(ReviewSlot.match(reviews, dated.period, dated.localDate)?.id).not.toBe(
    daily.id,
  );
});

it("opens the daily review when the date is chosen first, then leaves it for weekly", () => {
  let slot = { period: "daily", localDate: "2026-11-01" };
  const dated = ReviewSlot.next(slot, { localDate: "2026-10-24" });
  expect(ReviewSlot.match(reviews, dated.period, dated.localDate)?.id).toBe(
    daily.id,
  );
  slot = dated;
  const weekly = ReviewSlot.next(slot, { period: "weekly" });
  expect(weekly.period).toBe("weekly");
  expect(ReviewSlot.match(reviews, weekly.period, weekly.localDate)).toBeUndefined();
});

it("opens a matching review on load and leaves an in-progress draft alone", () => {
  const slot = { period: "daily", localDate: "2026-10-24" };
  expect(ReviewSlot.match(reviews, slot.period, slot.localDate)?.id).toBe(daily.id);
  expect(ReviewSlot.canOpen([], undefined)).toBe(true);
  expect(ReviewSlot.canOpen(["period"], undefined)).toBe(true);
  expect(ReviewSlot.canOpen(["wins"], undefined)).toBe(false);
  expect(ReviewSlot.canOpen([], 1)).toBe(false);
});
