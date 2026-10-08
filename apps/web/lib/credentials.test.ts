import assert from "node:assert/strict";
import { test } from "node:test";
import {
  hashPassword,
  parseCredentials,
  verifyPassword,
} from "./credentials.ts";

test("the right password is accepted", async () => {
  const stored = await hashPassword("correct horse");
  assert.equal(await verifyPassword("correct horse", stored), true);
});

test("a wrong password is rejected", async () => {
  const stored = await hashPassword("correct horse");
  assert.equal(await verifyPassword("correct horsf", stored), false);
  assert.equal(await verifyPassword("", stored), false);
});

test("the stored hash is not the password", async () => {
  const stored = await hashPassword("correct horse");
  assert.ok(!stored.includes("correct horse"));
});

test("email matches the same account regardless of case and spaces", () => {
  assert.deepEqual(
    parseCredentials({ email: " Paul@Example.com ", password: "longenough" }),
    { email: "paul@example.com", password: "longenough" },
  );
});

test("a missing email or a short password cannot make an account", () => {
  assert.equal(
    parseCredentials({ email: "paul", password: "longenough" }),
    null,
  );
  assert.equal(
    parseCredentials({ email: "paul@example.com", password: "short" }),
    null,
  );
  assert.equal(parseCredentials({}), null);
});
