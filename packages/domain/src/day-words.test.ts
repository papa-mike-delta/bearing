import assert from "node:assert/strict";
import { test } from "node:test";
import { dayWords } from "./day-words.ts";

test("day words: today, tomorrow, yesterday, a weekday this week, else a short date", () => {
  const today = "2026-10-21"; // Wednesday
  assert.equal(dayWords("2026-10-21", today), "Today");
  assert.equal(dayWords("2026-10-22", today), "Tomorrow");
  assert.equal(dayWords("2026-10-20", today), "Yesterday");
  assert.equal(dayWords("2026-10-23", today), "Friday");
  assert.equal(dayWords("2026-10-27", today), "Tuesday");
  assert.equal(dayWords("2026-10-28", today), "Wed, Oct 28");
  assert.equal(dayWords("2026-10-15", today), "Thu, Oct 15");
  assert.equal(dayWords("2027-01-05", today), "Tue, Jan 5, 2027");
  assert.equal(dayWords("2026-02-30", today), "2026-02-30");
});
