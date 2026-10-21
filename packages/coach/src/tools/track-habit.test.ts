import { coachWriteKey } from "../write-identity.ts";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import type { CoachData, HabitTrackResult } from "../data.ts";
import { trackHabit } from "./track-habit.ts";

const id = randomUUID();
const state: HabitTrackResult = { id, name: "Water", period: "day", trackMode: "many", goalCount: 3, bad: false, count: 1, done: false, due: true, streak: null, record: null, action: "did", day: "2026-10-08", changed: true };
function fake() {
  const calls: unknown[] = [];
  const data = { trackHabit: async (userId, input) => { calls.push([userId, input]); return { ...state, action: input.action, day: input.day }; } } satisfies Partial<CoachData>;
  return { calls, context: { userId: "owner", messageId: "message", toolCallId: "provider-call", today: state.day, habitOrdinal: 2, data: data as CoachData } };
}

test("tracking uses the listed habit id, browser Today and normalized content and occurrence", async () => {
  const { calls, context } = fake();
  assert.deepEqual(await trackHabit.run({ habitId: id, action: "did" }, context), { ...state, href: "/habits" });
  assert.deepEqual(calls, [["owner", { habitId: id, action: "did", day: state.day, today: state.day, source: "coach", operationId: `message:trackHabit:${coachWriteKey("trackHabit", { habitId: id, action: "did" }, state.day)}:2` }]]);
});

test("two habits named Water cannot be guessed by name: the tool requires an id", async () => {
  const { calls, context } = fake();
  const byName = { name: "Water", action: "did" };
  assert.equal(trackHabit.inputSchema.safeParse(byName).success, false);
  await assert.rejects(trackHabit.run(byName as never, context));
  await assert.rejects(trackHabit.run({ habitId: "Water", action: "did" }, context));
  assert.match(trackHabit.description, /Ask which habit if names are ambiguous/);
  assert.equal(calls.length, 0);
});

test("past dates and all four explicit tracking actions reach the adapter without inventing a count", async () => {
  const { calls, context } = fake();
  for (const action of ["did", "undo", "didnt", "markDone"] as const) {
    await trackHabit.run({ habitId: id, action, day: "2026-10-01" }, context);
  }
  assert.deepEqual(calls, ["did", "undo", "didnt", "markDone"].map((action) => ["owner", { habitId: id, action, day: "2026-10-01", today: state.day, source: "coach", operationId: `message:trackHabit:${coachWriteKey("trackHabit", { habitId: id, action, day: "2026-10-01" }, state.day)}:2` }]));
});

test("a missing Today or invalid day refuses before tracking", async () => {
  const { calls, context } = fake();
  await assert.rejects(trackHabit.run({ habitId: id, action: "did" }, { ...context, today: undefined }), /browser's Today/);
  await assert.rejects(trackHabit.run({ habitId: id, action: "did", day: "2026-02-31" }, context));
  assert.equal(calls.length, 0);
});

test("setCount validates whole totals 0 through 999 before the adapter and forwards the stated total", async () => {
  const { calls, context } = fake();
  for (const count of [undefined, -1, 1.5, 1000]) {
    await assert.rejects(trackHabit.run({ habitId: id, action: "setCount", count }, context));
  }
  assert.equal(calls.length, 0);
  for (const count of [0, 8, 120, 999]) {
    await trackHabit.run({ habitId: id, action: "setCount", count }, context);
    assert.equal((calls.at(-1) as [string, {count: number}])[1].count, count);
  }
  for (const words of ["setCount", "never once", "no tool call in that reply", "N more", "None", "Daily cap 99", "weekly cap 999", "unreported lapses"]) assert.ok(trackHabit.description.includes(words), words);
});

test("tracking resolves today before identity and includes action, habit, day, count and occurrence", async () => {
  const { calls, context } = fake();
  for (const day of [undefined, "today", state.day]) await trackHabit.run({ habitId: id, action: "did", day }, context);
  for (const input of [
    { habitId: randomUUID(), action: "did" as const },
    { habitId: id, action: "undo" as const },
    { habitId: id, action: "did" as const, day: "2026-10-01" },
    { habitId: id, action: "setCount" as const, count: 2 },
    { habitId: id, action: "setCount" as const, count: 3 },
  ]) await trackHabit.run(input, context);
  await trackHabit.run({ habitId: id, action: "did" }, { ...context, habitOrdinal: 3 });
  const ids = calls.map(call => (call as [string, { operationId: string }])[1].operationId);
  assert.equal(ids[0], ids[1]);
  assert.equal(ids[0], ids[2]);
  assert.equal(new Set(ids).size, ids.length - 2);
});
