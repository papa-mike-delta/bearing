// Applies the checked-in migrations in ../drizzle, in order, each pending set
// in one transaction (drizzle's migrator). Never drops anything it wasn't
// told to by a reviewed migration file.
//
//   node src/migrate.ts           local dev and CI: always runs
//   node src/migrate.ts --vercel  the build hook: runs only inside a Vercel
//                                 build (VERCEL=1), a no-op everywhere else
//
// Uses POSTGRES_URL_NON_POOLING, the direct connection: the advisory lock
// below is held by one session, which a transaction-mode pooler doesn't keep.

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const onVercel = process.env.VERCEL === "1";
const vercelOnly = process.argv.includes("--vercel");
const lockWaitMs = 10 * 60 * 1000;

if (vercelOnly && !onVercel) {
  console.log("db migrate: not a Vercel build, skipped");
  process.exit(0);
}

const url = vercelOnly
  ? process.env.POSTGRES_URL_NON_POOLING
  : process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;
if (!url) {
  console.error(
    vercelOnly
      ? `db migrate: POSTGRES_URL_NON_POOLING is not set for this ${process.env.VERCEL_ENV} build. ` +
          "Connect the Neon integration to this environment (Preview needs preview branching on)."
      : "db migrate: set POSTGRES_URL_NON_POOLING or POSTGRES_URL",
  );
  process.exit(1);
}

const { host, pathname } = new URL(url);
console.log(
  `db migrate: ${process.env.VERCEL_ENV ?? "local"} → ${host}${pathname}`,
);

const client = new Client({ connectionString: url });
await client.connect();
try {
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
} catch (error) {
  console.error("db migrate: failed, nothing from this run was applied");
  console.error(error);
  process.exitCode = 1;
} finally {
  await client.end(); // also releases the advisory lock
}
