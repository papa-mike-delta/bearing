import assert from "node:assert/strict";
import { test } from "node:test";
import { assertMigrated } from "./migration-check.js";

const marker = (m) => () => JSON.stringify(m);
const missing = () => {
  throw new Error("ENOENT");
};
const preview = {
  VERCEL: "1",
  VERCEL_ENV: "preview",
  VERCEL_DEPLOYMENT_ID: "dpl_1",
};

test("local, CI and development builds aren't checked", () => {
  assertMigrated({}, missing);
  assertMigrated({ CI: "true" }, missing);
  assertMigrated({ VERCEL: "1", VERCEL_ENV: "development" }, missing);
});

test("a Vercel build without the system env vars fails", () => {
  assert.throws(() => assertMigrated({ BEARING_VERCEL_BUILD: "1" }, missing));
});

test("a production or preview build without the marker fails", () => {
  assert.throws(() => assertMigrated(preview, missing), /did not apply/);
  assert.throws(
    () => assertMigrated({ ...preview, VERCEL_ENV: "production" }, missing),
    /did not apply/,
  );
  assert.throws(() => assertMigrated(preview, () => "not json"));
});

test("the marker must come from this deployment and environment", () => {
  assertMigrated(preview, marker({ deploymentId: "dpl_1", env: "preview" }));
  assert.throws(() =>
    assertMigrated(preview, marker({ deploymentId: "dpl_0", env: "preview" })),
  );
  assert.throws(() =>
    assertMigrated(
      preview,
      marker({ deploymentId: "dpl_1", env: "production" }),
    ),
  );
});

test("an unknown VERCEL_ENV is checked too", () => {
  assert.throws(() =>
    assertMigrated({ ...preview, VERCEL_ENV: "staging" }, missing),
  );
});
