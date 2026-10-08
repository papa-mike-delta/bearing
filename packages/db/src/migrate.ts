// Applies the checked-in migrations in ../drizzle, in order, each pending set
// in one transaction (drizzle's migrator). Never drops anything it wasn't
// told to by a reviewed migration file.
//
//   node src/migrate.ts           local dev and CI: always runs
//   node src/migrate.ts --vercel  the build hook: Vercel production and
//                                 preview builds only (rules and guards in
//                                 migrate-guard.ts), a no-op elsewhere
//
// Requires POSTGRES_URL_NON_POOLING, the direct connection: the advisory lock
// below is held by one session, which a transaction-mode pooler doesn't keep.

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { decide } from "./migrate-guard.ts";

const vercel = process.argv.includes("--vercel");
const lockWaitMs = 10 * 60 * 1000;
// apps/web/next.config.js reads this marker and fails a Vercel production or
// preview build that didn't run this script first. Keep the paths in step.
const marker = fileURLToPath(
  new URL("../.migrate-marker.json", import.meta.url),
);
if (vercel) rmSync(marker, { force: true });

const decision = decide(process.env, { vercel });
if (decision.action === "skip") {
  console.log(`db migrate: skipped (${decision.reason})`);
  process.exit(0);
}
if (decision.action === "refuse") {
  console.error(`db migrate: refused: ${decision.reason}`);
  process.exit(1);
}
const { url, host } = decision;
console.log(
  `db migrate: ${process.env.VERCEL_ENV ?? "local"} → ${host}${new URL(url).pathname}`,
);

const client = new Client({
  connectionString: url,
  connectionTimeoutMillis: 30_000,
});
try {
  await client.connect();
  // Don't stall production queries behind a stuck ALTER TABLE.
  await client.query("set lock_timeout = '10s'");
  // Two deploys migrating the same database take turns; the second finds
  // nothing left to apply.
  const deadline = Date.now() + lockWaitMs;
  while (true) {
    const { rows } = await client.query(
      "select pg_try_advisory_lock(hashtext('bearing.migrate')) as locked",
    );
    if (rows[0].locked) break;
    if (Date.now() > deadline) throw new Error("timed out waiting for lock");
    console.log("db migrate: another migration is running, waiting");
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  const count = async () =>
    (
      await client.query(
        "select count(*)::int as n from drizzle.__drizzle_migrations",
      )
    ).rows[0].n as number;
  const migrationsFolder = fileURLToPath(
    new URL("../drizzle", import.meta.url),
  );
  await migrate(drizzle({ client }), { migrationsFolder });
  console.log(`db migrate: done, ${await count()} migration(s) recorded`);
  if (vercel) {
    writeFileSync(
      marker,
      JSON.stringify({
        deploymentId: process.env.VERCEL_DEPLOYMENT_ID ?? null,
        commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
        env: process.env.VERCEL_ENV,
        host,
      }),
    );
  }
} catch (error) {
  console.error("db migrate: failed; see the error below");
  console.error(error);
  process.exitCode = 1;
} finally {
  try {
    await client.end(); // also releases the advisory lock
  } catch {
    // connect() never ran, or the client is already closed
  }
}
