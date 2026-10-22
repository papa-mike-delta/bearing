import assert from "node:assert/strict";
import { test } from "node:test";
import {
  listPeople,
  readPerson,
  setPersonLastConnected,
  setPersonAgreedDay,
} from "./people.ts";
import { coachWriteKey } from "../write-identity.ts";
import type { CoachData, ToolRunContext } from "../data.ts";
function value<T>(result: T): Exclude<T, { refused: true }> {
  assert.ok(!("refused" in (result as object)));
  return result as Exclude<T, { refused: true }>;
}
const id = "11111111-1111-4111-8111-111111111111";
const ada: import("@repo/domain").PersonFields & { id: string } = {
  id,
  name: "Ada",
  group: "Family",
  rule: { every: 1, unit: "months" } as const,
  lastConnected: "2026-09-09",
  agreedDay: null,
};
function context(rows = [ada]) {
  const writes: unknown[] = [];
  const data = {
    listPeople: async (user: string) => {
      assert.equal(user, "owner");
      return rows;
    },
    setPersonDay: async (
      user: string,
      input: { personId: string; day: string | null },
    ) => {
      assert.equal(user, "owner");
      writes.push(input);
      return { id, name: "Ada", day: input.day };
    },
  };
  return {
    writes,
    ctx: {
      userId: "owner",
      messageId: id,
      toolCallId: "provider",
      today: "2026-10-21",
      data: data as unknown as CoachData,
      personOrdinal: 1,
    },
  };
}
test("people list is in page order with phrases, dates, next reach-out and due", async () => {
  const { ctx } = context();
  const result = await listPeople.run({}, ctx);
  assert.deepEqual(result.people, [
    {
      ...ada,
      rulePhrase: "every month",
      nextReachOut: "2026-10-09",
      due: true,
      href: `/people/${id}`,
    },
  ]);
});
test("one name matches ignoring case; missing and ambiguous matches ask and write nothing", async () => {
  const { ctx, writes } = context();
  assert.equal(value(await readPerson.run({ name: " aDA " }, ctx)).name, "Ada");
  assert.deepEqual(
    { ...(await readPerson.run({ name: "Nobody" }, ctx)), question: "" },
    { refused: true, name: "Nobody", question: "" },
  );
  assert.ok(
    "refused" in (await setPersonLastConnected.run({ name: "Nobody" }, ctx)),
  );
  const ambiguous = context([
    ada,
    { ...ada, id: "22222222-2222-4222-8222-222222222222" },
  ]);
  const result = await readPerson.run({ name: "Ada" }, ambiguous.ctx);
  assert.ok("refused" in result);
  assert.match(result.question, /which/i);
  assert.equal((result as { name?: string }).name, "Ada");
  assert.ok(
    "refused" in
      (await setPersonAgreedDay.run(
        { name: "Ada", day: "2026-11-03" },
        ambiguous.ctx,
      )),
  );
  assert.deepEqual(writes, []);
  assert.deepEqual(ambiguous.writes, []);
});
test("sets connected day, sets and clears agreement; validates dates and rule before storage", async () => {
  const { ctx, writes } = context();
  assert.equal(
    value(await setPersonLastConnected.run({ name: "Ada" }, ctx)).day,
    "2026-10-21",
  );
  assert.equal(
    value(
      await setPersonLastConnected.run({ name: "Ada", day: "2026-10-09" }, ctx),
    ).day,
    "2026-10-09",
  );
  assert.equal(
    value(await setPersonAgreedDay.run({ name: "Ada", day: "2026-11-03" }, ctx))
      .day,
    "2026-11-03",
  );
  assert.equal(
    value(await setPersonAgreedDay.run({ name: "Ada", day: null }, ctx)).day,
    null,
  );
  for (const run of [
    () => setPersonLastConnected.run({ name: "Ada", day: "2026-10-22" }, ctx),
    () => setPersonAgreedDay.run({ name: "Ada", day: "2026-10-20" }, ctx),
    () => setPersonAgreedDay.run({ name: "Ada", day: "2026-02-30" }, ctx),
    () => listPeople.run({}, { ...ctx, today: undefined }),
  ])
    await assert.rejects(run);
  assert.equal(writes.length, 4);
  const noRule = context([{ ...ada, rule: null }]);
  const noRuleResult = await setPersonAgreedDay.run(
    { name: "Ada", day: "2026-11-03" },
    noRule.ctx,
  );
  assert.ok("refused" in noRuleResult);
  assert.equal((noRuleResult as { name?: string }).name, "Ada");
  assert.deepEqual(noRule.writes, []);
});
test("people write identity matches normalized names and resolved today and distinguishes clear/day/tool", () => {
  assert.equal(
    coachWriteKey("setPersonLastConnected", { name: " Ada " }, "2026-10-21"),
    coachWriteKey(
      "setPersonLastConnected",
      { name: "ADA", day: "2026-10-21" },
      "2026-10-21",
    ),
  );
  assert.notEqual(
    coachWriteKey("setPersonAgreedDay", { name: "Ada", day: null }),
    coachWriteKey("setPersonAgreedDay", { name: "Ada", day: "2026-11-03" }),
  );
});
