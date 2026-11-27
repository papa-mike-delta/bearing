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

it("follows the visible slot when a dirty draft switches onto a saved review", () => {
  const slot = { period: "daily", localDate: "2026-11-01" };
  const held = ReviewSlot.decide(slot, { localDate: "2026-10-24" }, reviews, true);
  expect(held.action).toBe("hold");
  expect(held.match?.id).toBe(daily.id);
  expect(held.slot).toEqual({ period: "daily", localDate: "2026-10-24" });
  const next = ReviewSlot.decide(held.slot, { period: "weekly" }, reviews, true);
  expect(next.slot).toEqual({ period: "weekly", localDate: "2026-10-24" });
  expect(next.action).toBe("edit");
  expect(next.match).toBeUndefined();
  const opened = ReviewSlot.decide(
    slot,
    { localDate: "2026-10-24" },
    reviews,
    false,
  );
  expect(opened.action).toBe("open");
  expect(opened.slot).toEqual(held.slot);
});

it("opens a matching review on load and leaves an in-progress draft alone", () => {
  const slot = { period: "daily", localDate: "2026-10-24" };
  expect(ReviewSlot.match(reviews, slot.period, slot.localDate)?.id).toBe(daily.id);
  expect(ReviewSlot.canOpen([], undefined)).toBe(true);
  expect(ReviewSlot.canOpen(["period"], undefined)).toBe(true);
  expect(ReviewSlot.canOpen(["wins"], undefined)).toBe(false);
  expect(ReviewSlot.canOpen([], 1)).toBe(false);
});
