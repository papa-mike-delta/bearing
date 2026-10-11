import assert from "node:assert/strict";
import { test } from "node:test";
import { formatJournalDay, shiftJournalDay } from "./journal-day.ts";

test("day navigation crosses leap days, month/year boundaries, and DST without skipping", () => {
  assert.equal(shiftJournalDay("2024-03-01", -1), "2024-02-29");
  assert.equal(shiftJournalDay("2024-02-29", 1), "2024-03-01");
  assert.equal(shiftJournalDay("2023-03-01", -1), "2023-02-28");
  assert.equal(shiftJournalDay("2026-01-01", -1), "2025-12-31");
  assert.equal(shiftJournalDay("2026-03-08", 1), "2026-03-09");
  assert.equal(shiftJournalDay("2026-11-01", 1), "2026-11-02");
  assert.equal(shiftJournalDay("0001-01-01", -1), null);
  assert.equal(shiftJournalDay("9999-12-31", 1), null);
  assert.equal(shiftJournalDay("2023-02-29", 1), null);
});
