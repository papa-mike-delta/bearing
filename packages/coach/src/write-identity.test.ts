import assert from "node:assert/strict";
import { test } from "node:test";
import { coachWriteKey } from "./write-identity.ts";
import { coachJournalOperationId } from "./tools/append-journal.ts";

const today = "2026-10-09";
test("write keys normalize trimmed names, text, defaults, day aliases and property order", () => {
  assert.equal(coachWriteKey("createHabit", { name: " Walk " }, today), coachWriteKey("createHabit", { bad: false, goalCount: null, trackMode: "once", period: "day", name: "Walk" }, today));
  for (const day of [undefined, "today", today]) {
    assert.equal(coachWriteKey("appendJournal", { text: " hello ", day }, today), coachWriteKey("appendJournal", { day: today, text: "hello" }, today));
    assert.equal(coachWriteKey("trackHabit", { habitId: "id", action: "did", day }, today), coachWriteKey("trackHabit", { day: today, action: "did", habitId: "id" }, today));
  }
});
test("each normalized argument contributes to the bounded content key", () => {
  const base = { habitId: "id", action: "setCount", day: today, count: 2 };
  const keys = [base, { ...base, habitId: "other" }, { ...base, action: "did" }, { ...base, day: "2026-10-08" }, { ...base, count: 3 }].map(input => coachWriteKey("trackHabit", input, today));
  assert.equal(new Set(keys).size, keys.length);
  assert.ok(keys.every(key => /^[a-f0-9]{32}$/.test(key)));
  assert.notEqual(coachWriteKey("appendJournal", { text: "one" }, today), coachWriteKey("appendJournal", { text: "two" }, today));
  for (const input of [{ name: "Run" }, { name: "Walk", period: "week" }, { name: "Walk", bad: true }, { name: "Walk", goalCount: 3 }]) {
    assert.notEqual(coachWriteKey("createHabit", input, today), coachWriteKey("createHabit", { name: "Walk" }, today));
  }
});

test("journal operation ids no longer match pre-#140 position-keyed ledger rows", () => {
  const day = "2026-10-08";
  const legacy = `msg-1:appendJournal:${day}:1`;
  assert.notEqual(coachJournalOperationId("msg-1", day, 1, coachWriteKey("appendJournal", { day, text: "hello" }, day)), legacy);
});
