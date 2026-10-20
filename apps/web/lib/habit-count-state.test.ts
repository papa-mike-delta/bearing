import assert from "node:assert/strict";
import { test } from "node:test";
import { finishHabitCountEdit } from "./habit-count-state.ts";

for (const event of ["Enter", "blur"] as const) test(`${event} saves a changed Habit count only once`, () => {
  const result = finishHabitCountEdit({ text: "8", stored: 2, active: true }, event, 99);
  assert.equal(result.save, 8);
  assert.equal(finishHabitCountEdit(result.state, "blur", 99).save, undefined);
});
for (const text of ["", "2.5", "-1", "2", "100"]) test(`invalid or unchanged '${text}' writes nothing and closes`, () => {
  const result = finishHabitCountEdit({ text, stored: 2, active: true }, "Enter", 99);
  assert.equal(result.save, undefined);
  assert.equal(result.state.active, false);
  assert.equal(result.error, text === "100" ? "Up to 99" : undefined);
});
test("Escape cancels a changed count before blur", () => {
  const result = finishHabitCountEdit({ text: "8", stored: 2, active: true }, "Escape", 99);
  assert.equal(result.save, undefined);
  assert.equal(finishHabitCountEdit(result.state, "blur", 99).save, undefined);
});
test("weekly cap and clearing", () => {
  assert.equal(finishHabitCountEdit({ text: "1000", stored: 200, active: true }, "blur", 999).error, "Up to 999");
  assert.equal(finishHabitCountEdit({ text: "0", stored: 200, active: true }, "Enter", 999).save, 0);
});
