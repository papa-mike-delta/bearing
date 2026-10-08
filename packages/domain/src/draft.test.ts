import assert from "node:assert/strict";
import { test } from "node:test";
import { draftToTask } from "./draft.ts";

test("one line becomes the task name with no note", () => {
  assert.deepEqual(draftToTask("Buy milk"), { name: "Buy milk", note: "" });
});

test("the first non-empty line is the name and the rest is the note", () => {
  assert.deepEqual(
    draftToTask(
      "\n\n  Call the bank  \n\nAsk about the fee.\n  - card ends 4411\n\n",
    ),
    { name: "Call the bank", note: "Ask about the fee.\n  - card ends 4411" },
  );
});

test("Windows line endings split the same way", () => {
  assert.deepEqual(draftToTask("Book flights\r\nAisle seat"), {
    name: "Book flights",
    note: "Aisle seat",
  });
});

test("empty or blank text cannot be filed", () => {
  assert.equal(draftToTask(""), null);
  assert.equal(draftToTask("  \n\t\n "), null);
});
