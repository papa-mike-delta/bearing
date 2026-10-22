import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultNextDateRule, nextDate, nextDatePhrase, parseNextDateRule, type NextDateRule } from "./next-date.ts";

test("phrases are derived from the stored shape", () => {
  const cases: [NextDateRule, string][] = [
    [{ every: 1, unit: "months" }, "every month"],
    [{ every: 1, unit: "weeks", on: "friday" }, "every Friday"],
    [{ every: 3, unit: "weeks", on: "tuesday" }, "every 3 weeks on Tuesday"],
    [{ every: 2, unit: "days" }, "every 2 days"],
    [{ every: 1, unit: "days" }, "every day"],
    [{ every: 2, unit: "weeks" }, "every 2 weeks"],
    [{ every: 1, unit: "months", on: 8 }, "every month on the 8th"],
    [{ every: 1, unit: "months", on: 1 }, "every month on the 1st"],
    [{ every: 2, unit: "months", on: 22 }, "every 2 months on the 22nd"],
    [{ every: 1, unit: "months", on: 13 }, "every month on the 13th"],
    [{ every: 1, unit: "months", on: "last" }, "every month on the last day"],
  ];
  for (const [rule, phrase] of cases) {
    assert.deepEqual(parseNextDateRule(rule), rule);
    assert.equal(nextDatePhrase(rule), phrase);
  }
});

test("a new rule starts at every month", () => {
  assert.deepEqual(defaultNextDateRule, { every: 1, unit: "months" });
  assert.equal(nextDatePhrase(defaultNextDateRule), "every month");
});

test("bad shapes are rejected", () => {
  const bad: unknown[] = [
    { every: 2, unit: "days", on: "monday" },
    { every: 2, unit: "days", on: 3 },
    { every: 2, unit: "months", on: "tuesday" },
    { every: 1, unit: "weeks", on: 8 },
    { every: 1, unit: "weeks", on: "last" },
    { every: 1, unit: "weeks", on: ["monday", "friday"] },
    [{ every: 1, unit: "weeks" }],
    { every: 1, unit: "months", on: "march" },
    { every: 1, unit: "months", start: "2026-01-01" },
    { every: 1, unit: "months", end: "2026-12-31" },
    { every: 0, unit: "days" },
    { every: -1, unit: "days" },
    { every: 1.5, unit: "weeks" },
    { every: "2", unit: "days" },
    { every: 1, unit: "years" },
    { every: 1, unit: "months", on: 0 },
    { every: 1, unit: "months", on: 32 },
    { every: 1, unit: "months", on: 8.5 },
    { every: 1, unit: "months", on: undefined },
    { unit: "months" },
    "every month",
    null,
  ];
  for (const shape of bad) assert.equal(parseNextDateRule(shape), null, JSON.stringify(shape));
});

test("next date is strictly after the anchor", () => {
  assert.equal(nextDate({ every: 2, unit: "days" }, "2026-12-31"), "2027-01-02");
  assert.equal(nextDate({ every: 2, unit: "weeks" }, "2026-10-21"), "2026-11-04");
  assert.equal(nextDate({ every: 1, unit: "months" }, "2026-10-21"), "2026-11-21");
  // 2026-10-21 is a Wednesday.
  assert.equal(nextDate({ every: 1, unit: "weeks", on: "friday" }, "2026-10-21"), "2026-10-23");
  assert.equal(nextDate({ every: 3, unit: "weeks", on: "tuesday" }, "2026-10-21"), "2026-11-10");
  assert.equal(nextDate({ every: 1, unit: "months", on: 8 }, "2026-10-21"), "2026-11-08");
  assert.equal(nextDate({ every: 1, unit: "months", on: 25 }, "2026-10-21"), "2026-10-25");
  assert.equal(nextDate({ every: 2, unit: "months", on: 25 }, "2026-10-21"), "2026-11-25");
  assert.equal(nextDate({ every: 1, unit: "months", on: "last" }, "2026-10-21"), "2026-10-31");
});

test("an anchor already on the on-day moves to the following match", () => {
  assert.equal(nextDate({ every: 1, unit: "weeks", on: "wednesday" }, "2026-10-21"), "2026-10-28");
  assert.equal(nextDate({ every: 3, unit: "weeks", on: "wednesday" }, "2026-10-21"), "2026-11-11");
  assert.equal(nextDate({ every: 1, unit: "months", on: 21 }, "2026-10-21"), "2026-11-21");
  assert.equal(nextDate({ every: 1, unit: "months", on: "last" }, "2026-10-31"), "2026-11-30");
});

test("a month without the day clamps to its last day", () => {
  assert.equal(nextDate({ every: 1, unit: "months" }, "2026-01-31"), "2026-02-28");
  assert.equal(nextDate({ every: 1, unit: "months" }, "2028-01-31"), "2028-02-29");
  assert.equal(nextDate({ every: 1, unit: "months", on: 31 }, "2026-01-31"), "2026-02-28");
  assert.equal(nextDate({ every: 1, unit: "months", on: 31 }, "2026-02-10"), "2026-02-28");
  assert.equal(nextDate({ every: 1, unit: "months", on: 30 }, "2026-02-28"), "2026-03-30");
  assert.equal(nextDate({ every: 1, unit: "months", on: "last" }, "2028-01-31"), "2028-02-29");
  assert.equal(nextDate({ every: 3, unit: "months" }, "2026-11-30"), "2027-02-28");
});

test("a bad anchor or rule gives no date", () => {
  assert.equal(nextDate({ every: 1, unit: "months" }, "2026-02-30"), null);
  assert.equal(nextDate({ every: 1, unit: "days", on: 3 } as unknown as NextDateRule, "2026-02-03"), null);
});
