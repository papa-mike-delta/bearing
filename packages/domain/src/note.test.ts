import assert from "node:assert/strict";
import { test } from "node:test";
import { draftNoteTitle, noteHref, noteName, validNoteBody } from "./note.ts";

test("note bounds trim names but never truncate body or proposed title", () => {
  assert.equal(noteName("  Ideas  "), "Ideas");
  for (const name of ["", "  ", "x".repeat(201), null]) assert.equal(noteName(name), null);
  assert.equal(noteName("x".repeat(200))?.length, 200);
  assert.equal(validNoteBody(""), true);
  assert.equal(validNoteBody("x".repeat(100_000)), true);
  assert.equal(validNoteBody("x".repeat(100_001)), false);
  assert.equal(validNoteBody(null), false);
  assert.equal(draftNoteTitle("\n  # Heading\r\nBody"), "# Heading");
  assert.equal(draftNoteTitle("x".repeat(201)).length, 201);
});

test("a note with no notebook links under /notes/_", () => {
  const noteId = "11111111-1111-4111-8111-111111111111";
  const notebookId = "22222222-2222-4222-8222-222222222222";
  assert.equal(noteHref(notebookId, noteId), `/notes/${notebookId}/${noteId}`);
  assert.equal(noteHref(null, noteId), `/notes/_/${noteId}`);
});
