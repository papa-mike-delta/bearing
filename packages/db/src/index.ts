// Drizzle schema and client. Postgres on Vercel, read from POSTGRES_URL.
// Product rules live in @repo/domain and do not import this package.

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.ts";

export * from "./schema.ts";

// The connection opens on the first query, so builds do not need a database.
export const db = drizzle(postgres(process.env.POSTGRES_URL ?? ""), {
  schema,
});
