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

test("optimistic plus/minus show immediately, settle server counts, and roll back refusals or failures", async () => {
  const { optimisticHabitCount, settleHabitCount } = await import("./habit-count-state.ts");
  for (const delta of [1, -1] as const) {
    const change = optimisticHabitCount(4, delta, 99);
    assert.equal(change.count, 4 + delta);
    assert.deepEqual(settleHabitCount(change, { count: 7 }), { count: 7, error: "" });
    assert.deepEqual(settleHabitCount(change, { error: "Could not save" }), { count: 4, error: "Could not save" });
  }
  assert.equal(optimisticHabitCount(99, 1, 99).count, 99);
  assert.equal(optimisticHabitCount(0, -1, 99).count, 0);
  assert.equal(optimisticHabitCount(998, 1, 999).count, 999);
});

test("a cap error expires on the next count-control interaction and a later refusal can show again", async () => {
  const { currentHabitCountError } = await import("./habit-count-state.ts");
  const result = finishHabitCountEdit({ text: "100", stored: 99, active: true }, "Enter", 99);
  const feedback = { message: result.error!, interaction: 1 };
  assert.equal(currentHabitCountError(feedback, 1), "Up to 99");
  for (const interaction of [2, 3, 4]) assert.equal(currentHabitCountError(feedback, interaction), "");
  assert.equal(currentHabitCountError({ message: "Up to 99", interaction: 4 }, 4), "Up to 99");
});
