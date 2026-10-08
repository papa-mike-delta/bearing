import type { db } from "@repo/db";

// What the lib functions need from a database handle. The default is the
// app's pool; tests and transactions pass their own.
export type Db = Pick<
  typeof db,
  "select" | "insert" | "update" | "transaction"
>;

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Ids come from forms and requests. Anything that isn't a uuid can't match a
// row.
export function isUuid(id: unknown): id is string {
  return typeof id === "string" && uuidPattern.test(id);
}
