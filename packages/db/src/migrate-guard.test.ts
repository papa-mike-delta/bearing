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

test("a Vercel build without the system env vars is refused", () => {
  assert.equal(
    decide(
      { BEARING_VERCEL_BUILD: "1", POSTGRES_URL_NON_POOLING: prodUrl },
      vercel,
    ).action,
    "refuse",
  );
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
  for (const POSTGRES_URL_NON_POOLING of [
    "not a url",
    "postgres://bad host/db",
    "postgres:///db",
    "https://ep-preview-456.us-east-2.aws.neon.tech/neondb",
  ]) {
    for (const [env, mode] of [
      [{}, local],
      [
        {
          VERCEL: "1",
          VERCEL_ENV: "preview",
          PRODUCTION_DB_HOST: "ep-prod-123.us-east-2.aws.neon.tech",
        },
        vercel,
      ],
    ] as const) {
      const d = decide({ ...env, POSTGRES_URL_NON_POOLING }, mode);
      assert.equal(d.action, "refuse", POSTGRES_URL_NON_POOLING);
      assert.match(d.action === "refuse" ? d.reason : "", /not a valid/);
    }
  }
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

const preview = (env: Record<string, string | undefined>) =>
  decide({ VERCEL: "1", VERCEL_ENV: "preview", ...env }, vercel);

test("a preview without PRODUCTION_DB_HOST is refused", () => {
  for (const PRODUCTION_DB_HOST of [undefined, "", "  ", "\n"]) {
    const d = preview({
      POSTGRES_URL_NON_POOLING: previewUrl,
      PRODUCTION_DB_HOST,
    });
    assert.equal(d.action, "refuse", JSON.stringify(PRODUCTION_DB_HOST));
    assert.match(d.action === "refuse" ? d.reason : "", /is not set/);
  }
});

test("production builds don't need PRODUCTION_DB_HOST", () => {
  const d = decide(
    {
      VERCEL: "1",
      VERCEL_ENV: "production",
      POSTGRES_URL_NON_POOLING: prodUrl,
    },
    vercel,
  );
  assert.equal(d.action, "migrate");
});

test("a PRODUCTION_DB_HOST that isn't a bare hostname is refused", () => {
  for (const PRODUCTION_DB_HOST of [
    '"ep-prod-123.us-east-2.aws.neon.tech"',
    "'ep-prod-123.us-east-2.aws.neon.tech'",
    "ep-prod-123.us-east-2.aws.neon.tech/neondb",
    "u:secret@ep-prod-123.us-east-2.aws.neon.tech",
    "postgres://u:secret@ep-prod-123.us-east-2.aws.neon.tech/neondb",
    "postgres://not a url",
    "ep-prod-123.us-east-2.aws.neon.tech.",
    "ep-prod-123",
    "ep-prod-123 .us-east-2.aws.neon.tech",
    "ep-prod-123.us-east-2.aws.neon.tech:",
    "ep-prod-123.us-east-2.aws.neon.tech:port",
  ]) {
    // Pointed at a preview branch, so only the format check can refuse.
    const d = preview({
      POSTGRES_URL_NON_POOLING: previewUrl,
      PRODUCTION_DB_HOST,
    });
    assert.equal(d.action, "refuse", PRODUCTION_DB_HOST);
    assert.match(
      d.action === "refuse" ? d.reason : "",
      /not a bare hostname/,
      PRODUCTION_DB_HOST,
    );
  }
});

test("PRODUCTION_DB_HOST is trimmed before it's checked", () => {
  for (const PRODUCTION_DB_HOST of [
    "ep-prod-123.us-east-2.aws.neon.tech ",
    "ep-prod-123.us-east-2.aws.neon.tech\n",
    " \tep-prod-123.us-east-2.aws.neon.tech\r\n",
  ]) {
    const env = { PRODUCTION_DB_HOST };
    assert.equal(
      preview({ ...env, POSTGRES_URL_NON_POOLING: previewUrl }).action,
      "migrate",
      JSON.stringify(PRODUCTION_DB_HOST),
    );
    const d = preview({ ...env, POSTGRES_URL_NON_POOLING: prodUrl });
    assert.equal(d.action, "refuse", JSON.stringify(PRODUCTION_DB_HOST));
    assert.match(d.action === "refuse" ? d.reason : "", /production database/);
  }
});

test("a preview on production's pooled host is refused", () => {
  const d = preview({
    POSTGRES_URL_NON_POOLING: prodUrl.replace(
      "ep-prod-123",
      "ep-prod-123-pooler",
    ),
    PRODUCTION_DB_HOST: "ep-prod-123.us-east-2.aws.neon.tech",
  });
  assert.equal(d.action, "refuse");
  assert.match(d.action === "refuse" ? d.reason : "", /production database/);
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
