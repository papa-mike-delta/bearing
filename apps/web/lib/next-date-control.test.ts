import assert from "node:assert/strict";
import { test } from "node:test";
import { ruleControlChange } from "./next-date-control.ts";

test("new rule defaults to every month and can be cleared", () => {
  assert.deepEqual(ruleControlChange(null, "enable", ""), {
    every: 1,
    unit: "months",
  });
  assert.equal(
    ruleControlChange({ every: 1, unit: "months" }, "clear", ""),
    null,
  );
});
test("number, unit and optional on-day use the shared rule vocabulary", () => {
  const weeks = ruleControlChange(
    { every: 1, unit: "months", on: 31 },
    "unit",
    "weeks",
  );
  assert.deepEqual(weeks, { every: 1, unit: "weeks" });
  assert.deepEqual(ruleControlChange(weeks, "on", "tuesday"), {
    every: 1,
    unit: "weeks",
    on: "tuesday",
  });
  assert.deepEqual(ruleControlChange(weeks, "every", "3"), {
    every: 3,
    unit: "weeks",
  });
  assert.deepEqual(
    ruleControlChange({ every: 1, unit: "months" }, "on", "last"),
    { every: 1, unit: "months", on: "last" },
  );
  assert.deepEqual(ruleControlChange(weeks, "every", "0"), weeks);
  assert.deepEqual(ruleControlChange(weeks, "on", ""), weeks);
});
