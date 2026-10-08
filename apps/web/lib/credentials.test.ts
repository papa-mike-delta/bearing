import assert from "node:assert/strict";
import { randomBytes, scryptSync } from "node:crypto";
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

test("the hash stores OWASP-level scrypt parameters", async () => {
  const stored = await hashPassword("correct horse");
  assert.match(stored, /^scrypt\$131072\$8\$1\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
});

test("hashes in the earlier salt:key format still verify", async () => {
  const salt = randomBytes(16);
  const legacy = `${salt.toString("hex")}:${scryptSync("old pass", salt, 64).toString("hex")}`;
  assert.equal(await verifyPassword("old pass", legacy), true);
  assert.equal(await verifyPassword("wrong", legacy), false);
});

test("a malformed stored hash never verifies", async () => {
  for (const stored of ["x:y", "abcd:zz", "", "scrypt$1$1$1$00$00", ":"]) {
    assert.equal(await verifyPassword("", stored), false, stored);
    assert.equal(await verifyPassword("anything", stored), false, stored);
  }
});
