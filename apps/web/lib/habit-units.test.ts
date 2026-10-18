import assert from "node:assert/strict";
import { test } from "node:test";
import { habitRunLength } from "./habit-units.ts";

test("weekly streak and record units are singular only for 1", () => {
  assert.equal(habitRunLength(0, "week"), "0 weeks");
  assert.equal(habitRunLength(1, "week"), "1 week");
  assert.equal(habitRunLength(2, "week"), "2 weeks");
  assert.equal(habitRunLength(12, "week"), "12 weeks");
});

test("daily streak and record units follow the same rule", () => {
  assert.equal(habitRunLength(0, "day"), "0 days");
  assert.equal(habitRunLength(1, "day"), "1 day");
  assert.equal(habitRunLength(3, "day"), "3 days");
});
