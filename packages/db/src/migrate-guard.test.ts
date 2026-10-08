import assert from "node:assert/strict";
import { test } from "node:test";
import { dbHost, decide } from "./migrate-guard.ts";

const prodUrl =
  "postgres://u:secret@ep-prod-123.us-east-2.aws.neon.tech/neondb?sslmode=require";
const previewUrl =
  "postgres://u:secret@ep-preview-456.us-east-2.aws.neon.tech/neondb?sslmode=require";
const vercel = { vercel: true };
const local = { vercel: false };

test("the build hook does nothing outside Vercel", () => {
  assert.equal(
    decide({ POSTGRES_URL_NON_POOLING: prodUrl }, vercel).action,
    "skip",
  );
  assert.equal(decide({}, vercel).action, "skip");
});

test("only production and preview Vercel builds migrate", () => {
  for (const VERCEL_ENV of ["production", "preview"]) {
    const d = decide(
      {
        VERCEL: "1",
        VERCEL_ENV,
        POSTGRES_URL_NON_POOLING: previewUrl,
        PRODUCTION_DB_HOST: "ep-prod-123.us-east-2.aws.neon.tech",
      },
      vercel,
    );
    assert.equal(d.action, "migrate", VERCEL_ENV);
  }
  assert.equal(
    decide(
      {
        VERCEL: "1",
        VERCEL_ENV: "development",
        POSTGRES_URL_NON_POOLING: previewUrl,
      },
      vercel,
    ).action,
    "skip",
  );
  for (const VERCEL_ENV of [undefined, "", "staging", "Production"]) {
    const d = decide(
      { VERCEL: "1", VERCEL_ENV, POSTGRES_URL_NON_POOLING: previewUrl },
      vercel,
    );
    assert.equal(d.action, "refuse", String(VERCEL_ENV));
  }
});

test("the direct connection is required; the pooled URL is never used", () => {
  const d = decide({ POSTGRES_URL: prodUrl }, local);
  assert.equal(d.action, "refuse");
  assert.equal(
    decide(
      { VERCEL: "1", VERCEL_ENV: "production", POSTGRES_URL: prodUrl },
      vercel,
    ).action,
    "refuse",
  );
  assert.equal(
    decide({ POSTGRES_URL_NON_POOLING: "not a url" }, local).action,
    "refuse",
  );
});

test("a preview pointed at the production database is refused", () => {
  for (const PRODUCTION_DB_HOST of [
    "ep-prod-123.us-east-2.aws.neon.tech",
    "EP-PROD-123.us-east-2.aws.neon.tech",
    "ep-prod-123-pooler.us-east-2.aws.neon.tech",
    "ep-prod-123.us-east-2.aws.neon.tech:5432",
  ]) {
    const d = decide(
      {
        VERCEL: "1",
        VERCEL_ENV: "preview",
        POSTGRES_URL_NON_POOLING: prodUrl,
        PRODUCTION_DB_HOST,
      },
      vercel,
    );
    assert.equal(d.action, "refuse", PRODUCTION_DB_HOST);
  }
});

test("production may target the production host", () => {
  const d = decide(
    {
      VERCEL: "1",
      VERCEL_ENV: "production",
      POSTGRES_URL_NON_POOLING: prodUrl,
      PRODUCTION_DB_HOST: "ep-prod-123.us-east-2.aws.neon.tech",
    },
    vercel,
  );
  assert.equal(d.action, "migrate");
});

test("a preview without PRODUCTION_DB_HOST warns but still migrates", () => {
  const d = decide(
    {
      VERCEL: "1",
      VERCEL_ENV: "preview",
      POSTGRES_URL_NON_POOLING: previewUrl,
    },
    vercel,
  );
  assert.equal(d.action, "migrate");
  assert.ok(d.action === "migrate" && d.warnings.length === 1);
});

test("local runs migrate whatever VERCEL_ENV says", () => {
  const d = decide(
    { POSTGRES_URL_NON_POOLING: "postgres://u:p@localhost:5432/bearing" },
    local,
  );
  assert.deepEqual(d.action === "migrate" && d.host, "localhost");
});

test("hosts compare without the pooler suffix, port or case", () => {
  assert.equal(dbHost("ep-a-1-pooler.x.neon.tech"), "ep-a-1.x.neon.tech");
  assert.equal(
    dbHost("postgres://u:p@EP-A-1.x.neon.tech:5432/db"),
    "ep-a-1.x.neon.tech",
  );
});
