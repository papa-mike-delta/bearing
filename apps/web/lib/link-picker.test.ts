import assert from "node:assert/strict";
import { test } from "node:test";
import { acceptResponse, matchesQuery } from "./link-picker.ts";

const book = { kind: "task" as const, id: "a", label: "Book venue" };
const plan = { kind: "task" as const, id: "b", label: "Plan the party" };
const day = {
  kind: "journal" as const,
  id: "2026-10-12",
  label: "Monday, Oct 12, 2026",
};

test("an out-of-order response is ignored", () => {
  assert.equal(acceptResponse(3, 1), false);
  assert.equal(acceptResponse(3, 2), false);
  assert.equal(acceptResponse(3, 3), true);
});

test('"Plan" filters out "Book venue"', () => {
  assert.equal(matchesQuery(book, "Plan"), false);
  assert.equal(matchesQuery(plan, "Plan"), true);
  assert.equal(matchesQuery(plan, "plan"), true);
});

test("an empty query keeps all", () => {
  assert.equal(matchesQuery(book, ""), true);
  assert.equal(matchesQuery(plan, "   "), true);
});

test("a Journal day matches its label or its ISO date", () => {
  assert.equal(matchesQuery(day, "Oct 12"), true);
  assert.equal(matchesQuery(day, "2026-10"), true);
  assert.equal(matchesQuery(day, "Plan"), false);
});
