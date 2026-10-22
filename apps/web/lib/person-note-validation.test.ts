import assert from "node:assert/strict";
import { test } from "node:test";
import { personNoteError } from "./person-note-validation.ts";

test("future occasion dates are checked independently of note text or draft person", () => {
  for (const text of ["", "Hello"]) {
    for (const draft of [false, true]) {
      assert.equal(personNoteError({ day: "2026-10-23", today: "2026-10-22", text, draft, name: "" }), "Pick today or an earlier day.");
    }
  }
});
test("valid dates allow text validation and corrected input clears validation", () => {
  for (const day of ["", "2026-10-21", "2026-10-22"]) {
    const input = { day, today: "2026-10-22", text: "", draft: false, name: "" };
    assert.equal(personNoteError(input), "Write a note before adding it.");
    assert.equal(personNoteError({ ...input, text: "Hello" }), "");
    assert.equal(personNoteError({ ...input, draft: true }), "Choose a person to log this draft on.");
  }
});
