import assert from "node:assert/strict";
import { test } from "node:test";
import {
  personNextReachOut,
  personIsDue,
  peopleGroups,
  groupPeople,
  validatePerson,
} from "./person.ts";
const base = {
  name: "Ada",
  group: "Family",
  rule: { every: 1, unit: "months" } as const,
  lastConnected: "2026-01-31",
  agreedDay: null,
};
test("reach-out uses the shared strict next date, agreed day overrides, and due stays due", () => {
  assert.equal(personNextReachOut(base), "2026-02-28");
  assert.equal(personIsDue(base, "2026-02-27"), false);
  assert.equal(personIsDue(base, "2026-02-28"), true);
  assert.equal(personIsDue(base, "2026-03-10"), true);
  assert.equal(
    personNextReachOut({ ...base, agreedDay: "2026-03-03" }),
    "2026-03-03",
  );
  assert.equal(personNextReachOut({ ...base, lastConnected: null }), null);
  assert.equal(personNextReachOut({ ...base, rule: null }), null);
  assert.equal(
    personNextReachOut({
      ...base,
      rule: { every: 1, unit: "weeks", on: "friday" },
      lastConnected: "2026-10-09",
    }),
    "2026-10-16",
  );
});
test("eight ordered groups hide empties and open due groups; due ties use names, future dates sort soonest, nulls last", () => {
  assert.deepEqual(peopleGroups, [
    "Family",
    "Extended family",
    "Intimate friends",
    "Close friends",
    "Casual friends",
    "Acquaintances",
    "Business contacts",
    "Almost strangers",
  ]);
  const person = (
    name: string,
    agreedDay: string | null,
    group = "Family",
  ) => ({ ...base, name, agreedDay, group, lastConnected: null });
  const groups = groupPeople(
    [
      person("Zed", "2026-03-01"),
      person("Ada", "2026-03-02"),
      person("No date", null),
      person("Later", "2026-04-01"),
      person("Soon", "2026-03-10"),
      person("Biz", null, "Business contacts"),
    ],
    "2026-03-03",
  );
  assert.deepEqual(
    groups.map((g) => [g.group, g.open, g.people.map((p) => p.name)]),
    [
      ["Family", true, ["Ada", "Zed", "Soon", "Later", "No date"]],
      ["Business contacts", false, ["Biz"]],
    ],
  );
});
test("validation trims names, requires a group, validates all fields before saving", () => {
  assert.equal(
    validatePerson({ ...base, name: " Ada " }, "2026-03-03").name,
    "Ada",
  );
  for (const input of [
    { name: "" },
    { name: " ".repeat(3) },
    { name: "a".repeat(201) },
    { group: "" },
    { group: "Other" },
    { lastConnected: "2026-03-04" },
    { lastConnected: "2026-02-30" },
    { agreedDay: "2026-03-02" },
    { rule: null, agreedDay: "2026-03-03" },
    { rule: { every: 0, unit: "months" } },
  ])
    assert.throws(() => validatePerson({ ...base, ...input }, "2026-03-03"));
  assert.equal(
    validatePerson(
      {
        ...base,
        name: "a".repeat(200),
        lastConnected: "2026-03-03",
        agreedDay: "2026-03-03",
      },
      "2026-03-03",
    ).name.length,
    200,
  );
});
