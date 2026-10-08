import assert from "node:assert/strict";
import { test } from "node:test";
import { resetTarget } from "./reset-guard.ts";

const prodUrl =
  "postgres://u:secret@ep-prod-123.us-east-2.aws.neon.tech/neondb?sslmode=require";
const devUrl = "postgres://u:secret@localhost:5432/bearing";
const PRODUCTION_DB_HOST = "ep-prod-123.us-east-2.aws.neon.tech";

const reason = (d: ReturnType<typeof resetTarget>) =>
  d.action === "refuse" ? d.reason : "";

test("a reset pointed at the production database is refused without --production", () => {
  for (const env of [
    { POSTGRES_URL_NON_POOLING: prodUrl, PRODUCTION_DB_HOST },
    // The pooled fallback is checked too, and the pooler suffix doesn't hide it.
    {
      POSTGRES_URL: prodUrl.replace("ep-prod-123", "ep-prod-123-pooler"),
      PRODUCTION_DB_HOST,
    },
    {
      POSTGRES_URL_NON_POOLING: prodUrl,
      PRODUCTION_DB_HOST: " EP-PROD-123-pooler.us-east-2.aws.neon.tech:5432\n",
    },
  ]) {
    const d = resetTarget(env, { production: false });
    assert.equal(d.action, "refuse", JSON.stringify(env));
    assert.match(reason(d), /production database/);
    assert.match(reason(d), /--production/);
    assert.doesNotMatch(reason(d), /secret/);
  }
});

test("--production lets a reset reach the production database", () => {
  const d = resetTarget(
    { POSTGRES_URL_NON_POOLING: prodUrl, PRODUCTION_DB_HOST },
    { production: true },
  );
  assert.deepEqual(d, {
    action: "reset",
    url: prodUrl,
    host: "ep-prod-123.us-east-2.aws.neon.tech",
    production: true,
  });
});

test("a reset on another host runs without the flag", () => {
  const d = resetTarget(
    { POSTGRES_URL_NON_POOLING: devUrl, PRODUCTION_DB_HOST },
    { production: false },
  );
  assert.deepEqual(d, {
    action: "reset",
    url: devUrl,
    host: "localhost",
    production: false,
  });
});

test("the direct url is checked before the pooled one", () => {
  const d = resetTarget(
    {
      POSTGRES_URL_NON_POOLING: prodUrl,
      POSTGRES_URL: devUrl,
      PRODUCTION_DB_HOST,
    },
    { production: false },
  );
  assert.equal(d.action, "refuse");
});

test("without PRODUCTION_DB_HOST the reset runs, with a warning that nothing was checked", () => {
  for (const value of [undefined, "", "  "]) {
    const d = resetTarget(
      { POSTGRES_URL_NON_POOLING: prodUrl, PRODUCTION_DB_HOST: value },
      { production: false },
    );
    assert.equal(d.action, "reset", JSON.stringify(value));
    assert.match(
      d.action === "reset" ? (d.warning ?? "") : "",
      /PRODUCTION_DB_HOST is not set/,
    );
  }
});

test("a PRODUCTION_DB_HOST that isn't a bare hostname is refused, since it could never match", () => {
  for (const value of [
    "postgres://u:secret@ep-prod-123.us-east-2.aws.neon.tech/neondb",
    "ep-prod-123",
    '"ep-prod-123.us-east-2.aws.neon.tech"',
  ]) {
    for (const production of [false, true]) {
      const d = resetTarget(
        { POSTGRES_URL_NON_POOLING: devUrl, PRODUCTION_DB_HOST: value },
        { production },
      );
      assert.equal(d.action, "refuse", value);
      assert.match(reason(d), /not a bare hostname/);
      assert.doesNotMatch(reason(d), /secret/);
    }
  }
});

test("a missing or unparseable database url is refused without echoing it", () => {
  assert.match(
    reason(resetTarget({}, { production: false })),
    /Set POSTGRES_URL_NON_POOLING/,
  );
  for (const POSTGRES_URL_NON_POOLING of [
    "not a url",
    "postgres:///db",
    "https://u:secret@ep-prod-123.us-east-2.aws.neon.tech/neondb",
  ]) {
    const d = resetTarget(
      { POSTGRES_URL_NON_POOLING, PRODUCTION_DB_HOST },
      { production: true },
    );
    assert.equal(d.action, "refuse", POSTGRES_URL_NON_POOLING);
    assert.match(reason(d), /not a valid postgres:\/\/ URL/);
    assert.doesNotMatch(reason(d), /secret/);
  }
});
