import assert from "node:assert/strict";
import { test } from "node:test";
import { accountError } from "./account-errors.ts";

test("a known ?error= reason gets its message", () => {
  assert.equal(
    accountError("mismatch"),
    "The new password and the confirmation don't match.",
  );
});

test("an unknown or prototype-named ?error= shows nothing", () => {
  for (const key of [
    undefined,
    "",
    "nope",
    "constructor",
    "toString",
    "__proto__",
    "hasOwnProperty",
  ]) {
    assert.equal(accountError(key), null, String(key));
  }
});
