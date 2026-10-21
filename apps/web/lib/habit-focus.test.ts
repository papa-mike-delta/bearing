import assert from "node:assert/strict";
import { test } from "node:test";
import { habitMoveFocus } from "./habit-focus.ts";

test("a move within the section keeps the pressed direction", () => {
  assert.equal(habitMoveFocus(1, 4, "up"), "up");
  assert.equal(habitMoveFocus(2, 4, "down"), "down");
});

test("reaching either section end focuses its enabled arrow", () => {
  assert.equal(habitMoveFocus(0, 4, "up"), "down");
  assert.equal(habitMoveFocus(3, 4, "down"), "up");
  assert.equal(habitMoveFocus(0, 2, "up"), "down");
  assert.equal(habitMoveFocus(1, 2, "down"), "up");
});

test("moving away from an end keeps the pressed direction", () => {
  assert.equal(habitMoveFocus(0, 4, "down"), "down");
  assert.equal(habitMoveFocus(3, 4, "up"), "up");
});

test("a section reduced to one row falls back to Edit", () => {
  assert.equal(habitMoveFocus(0, 1, "up"), "edit");
  assert.equal(habitMoveFocus(0, 1, "down"), "edit");
});
