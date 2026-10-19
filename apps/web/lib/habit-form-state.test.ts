import assert from "node:assert/strict";
import { test } from "node:test";
import { editHabitRules, type HabitEdit, type HabitTracking } from "@repo/domain";
import { habitErrorField, habitFormValues, type HabitErrorField } from "./habit-form-state.ts";

const current: HabitTracking & { name: string } = { name: "Water", period: "day", trackMode: "many", goalCount: 5, bad: false };

const refusals: [string, HabitEdit, HabitErrorField][] = [
  ["many-to-once conversion", { trackMode: "once", goalCount: null }, "trackMode"],
  ["invalid tracking mode", { trackMode: "other" as "once" }, "trackMode"],
  ["period conversion with history", { period: "week" }, "period"],
  ["invalid period", { period: "other" as "day" }, "period"],
  ["daily goal", { goalCount: 100 }, "goal"],
  ["weekly goal", { period: "week", goalCount: 1000 }, "goal"],
  ["Bad limit", { bad: true, goalCount: 0 }, "goal"],
  ["blank name", { name: " " }, "name"],
  ["long name", { name: "a".repeat(201) }, "name"],
  ["invalid Bad", { bad: "yes" as unknown as boolean }, "bad"],
];

for (const [label, changes, field] of refusals) test(`${label} associates the server refusal with ${field}`, () => {
  const marks = label === "weekly goal" ? [] : [{ count: 2 }];
  const result = editHabitRules(current, marks, changes);
  assert.ok("error" in result);
  assert.equal(habitErrorField(result.error), field);
});

test("a once-habit goal error belongs to Goal", () => {
  const result = editHabitRules({ ...current, trackMode: "once", goalCount: null }, [], { goalCount: 1 });
  assert.ok("error" in result);
  assert.equal(habitErrorField(result.error), "goal");
});

test("general save failures don't mark an unrelated field invalid", () => {
  assert.equal(habitErrorField("Could not save the habit. Please try again."), null);
  assert.equal(habitErrorField("That habit is unavailable. Refresh and try again."), null);
  assert.equal(habitErrorField(""), null);
});

test("add starts and resets to empty, Daily, once, non-Bad, no goal", () => {
  const values = habitFormValues({ ...current, period: "week", bad: true });
  assert.deepEqual(values, { name: "Water", period: "week", trackMode: "many", bad: true, goal: "5" });
  Object.assign(values, habitFormValues());
  assert.deepEqual(values, { name: "", period: "day", trackMode: "once", bad: false, goal: "" });
  // Each initialization/reset is independent.
  values.name = "Changed";
  assert.equal(habitFormValues().name, "");
});
