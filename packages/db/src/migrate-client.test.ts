import assert from "node:assert/strict";
import { test } from "node:test";
import {
  migrateConnectionTimeoutMs,
  migrateLockTimeout,
} from "./migrate-client.ts";

test("the migrate client waits 30s to connect and 10s for a lock", () => {
  assert.equal(migrateConnectionTimeoutMs, 30_000);
  assert.equal(migrateLockTimeout, "10s");
});
