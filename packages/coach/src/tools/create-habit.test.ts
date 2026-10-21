import { coachWriteKey } from "../write-identity.ts";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import type { CoachData, HabitWriteState } from "../data.ts";
import { createHabit } from "./create-habit.ts";

const today = "2026-10-08";
const state: HabitWriteState = { id: randomUUID(), name: "Walk", period: "day", trackMode: "once", goalCount: null, bad: false, count: 0, done: false, due: true, streak: 0, record: 0 };
function fake() {
  const calls: { userId: string; input: Parameters<NonNullable<CoachData["createHabit"]>>[1] }[] = [];
  const data = { createHabit: async (userId, input) => { calls.push({ userId, input }); return { ...state, ...input, due: !input.bad, streak: input.bad || input.trackMode === "many" ? null : 0, record: input.bad || input.trackMode === "many" ? null : 0 }; } } satisfies Partial<CoachData>;
  return { calls, context: { userId: "owner", today, messageId: "message", toolCallId: "provider-call", habitOrdinal: 1, data: data as unknown as CoachData } };
}

test("an explicit name alone creates daily once, not Bad, with message/call provenance and listHabits state", async () => {
  const { calls, context } = fake();
  assert.deepEqual(await createHabit.run({ name: " Walk " }, context), { ...state, href: "/habits" });
  assert.deepEqual(calls, [{ userId: "owner", input: { name: "Walk", period: "day", trackMode: "once", goalCount: null, bad: false, today, source: "coach", operationId: `message:createHabit:${coachWriteKey("createHabit", { name: "Walk" }, today)}:1` } }]);
});

test("Quit smoking's inferred Bad inputs create Smoking once; counting cigarettes allows no goal", async () => {
  const { calls, context } = fake();
  for (const input of [{ name: "Smoking", bad: true }, { name: "Cigarettes", bad: true, trackMode: "many" as const }]) {
    const result = await createHabit.run(input, context);
    assert.ok(!("refused" in result));
    if ("refused" in result) return;
    assert.equal(result.bad, true);
    assert.equal(result.goalCount, null);
    assert.equal(result.due, false);
  }
  assert.deepEqual(calls.map(({ input }) => [input.name, input.trackMode, input.bad, input.goalCount]), [["Smoking", "once", true, null], ["Cigarettes", "many", true, null]]);
});

test("many-times without a non-Bad goal asks and writes nothing", async () => {
  const { calls, context } = fake();
  const result = await createHabit.run({ name: "Water", trackMode: "many" }, context);
  assert.deepEqual(result, { refused: true, clarification: "What goal would you like for each day or week?" });
  assert.equal(calls.length, 0);
});

test("above 99 without a period asks instead of guessing Weekly", async () => {
  const { calls, context } = fake();
  const result = await createHabit.run({ name: "Pages", trackMode: "many", goalCount: 200 }, context);
  assert.ok("refused" in result && result.refused);
  assert.match("clarification" in result ? result.clarification : "", /daily or weekly.*99.*999/);
  assert.equal(calls.length, 0);
});

for (const [period, cap] of [["day", 99], ["week", 999]] as const) {
  test(`${period} above its maximum refuses naming ${cap}, without a write`, async () => {
    const { calls, context } = fake();
    for (const bad of [false, true]) {
      const result = await createHabit.run({ name: "Pages", period, trackMode: "many", goalCount: cap + 1, bad }, context);
      assert.deepEqual(result, { refused: true, clarification: `The ${period === "day" ? "daily" : "weekly"} maximum is ${cap}.` });
    }
    assert.equal(calls.length, 0);
  });
}

test("weekly goal 200 and both exact caps are allowed", async () => {
  const { calls, context } = fake();
  for (const [period, goalCount] of [["week", 200], ["day", 99], ["week", 999]] as const) {
    const result = await createHabit.run({ name: "Pages", period, trackMode: "many", goalCount }, context);
    assert.ok(!("refused" in result));
  }
  assert.deepEqual(calls.map(({ input }) => [input.period, input.goalCount]), [["week", 200], ["day", 99], ["week", 999]]);
});

test("invalid names, goals and browser Today never reach the adapter", async () => {
  const { calls, context } = fake();
  for (const input of [{ name: "" }, { name: "a".repeat(201) }, { name: "Water", goalCount: 0 }, { name: "Water", goalCount: 1.2 }]) await assert.rejects(createHabit.run(input, context));
  for (const today of [undefined, "2026-02-31"]) await assert.rejects(createHabit.run({ name: "Walk" }, { ...context, today }), /browser's Today/);
  assert.equal(calls.length, 0);
});

test("equivalent creation defaults share identity; changed content and occurrences do not", async () => {
  const { calls, context } = fake();
  await createHabit.run({ name: " Walk " }, context);
  await createHabit.run({ name: "Walk", period: "day", trackMode: "once", goalCount: null, bad: false }, context);
  await createHabit.run({ name: "Run" }, context);
  await createHabit.run({ name: "Walk" }, { ...context, habitOrdinal: 2 });
  const ids = calls.map(call => call.input.operationId);
  assert.equal(ids[0], ids[1]);
  assert.equal(new Set(ids).size, 3);
});
