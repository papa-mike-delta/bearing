// Drizzle schema and client. Postgres on Neon, read from POSTGRES_URL.
// Product rules live in @repo/domain and do not import this package.

import { attachDatabasePool } from "@vercel/functions";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.ts";

export * from "./schema.ts";

// Neon's setup for Vercel Fluid compute: a TCP pool that Vercel closes when
// idle. Connections open on the first query, so builds need no database.
const pool = new Pool({ connectionString: process.env.POSTGRES_URL });
attachDatabasePool(pool);

export const db = drizzle({ client: pool, schema });
