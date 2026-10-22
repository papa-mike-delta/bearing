import { createHash } from "node:crypto";
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

test("Habit and Journal text keys case-fold and collapse whitespace", () => {
  for (const [tool, field] of [["createHabit", "name"], ["appendJournal", "text"]]) {
    assert.equal(coachWriteKey(tool!, { [field!]: "  Morning\n WALK  " }, today), coachWriteKey(tool!, { [field!]: "morning walk" }, today));
  }
});

test("old trim-only hash rows are not matched when text normalization changes the hash", () => {
  // The ledger is not rewritten: an old mixed-case or spaced write can apply again.
  for (const tool of ["createHabit", "appendJournal"]) {
    const oldArguments = tool === "createHabit"
      ? { name: "Morning  Walk", period: "day", trackMode: "once", goalCount: null, bad: false }
      : { day: today, text: "Morning  Walk" };
    const oldHash = createHash("sha256").update(JSON.stringify(Object.keys(oldArguments).sort().map(key => [key, oldArguments[key as keyof typeof oldArguments]]))).digest("hex").slice(0, 32);
    assert.notEqual(coachWriteKey(tool, oldArguments, today), oldHash);
  }
});

test('person Note identity matches name and text normalization, and distinguishes person, text and stated occasion day',()=>{
 const original={name:' Ada ',text:' A quote\nExact words '};
 const key=coachWriteKey('logNoteOnPerson',original,'2026-10-21');
 assert.equal(key,coachWriteKey('logNoteOnPerson',{name:'ADA',text:'a quote  exact WORDS'},'2026-10-22'));
 for(const patch of [{name:'Bo'},{text:'Different'},{day:'2026-10-09'}]) assert.notEqual(key,coachWriteKey('logNoteOnPerson',{...original,...patch},'2026-10-21'));
});
