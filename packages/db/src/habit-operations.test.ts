import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { after, before, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const url = process.env.TEST_POSTGRES_URL;
if (!url && process.env.CI) {
  test("habit operations migration requires Postgres in CI", () => {
    assert.fail("TEST_POSTGRES_URL missing");
  });
}

type Journal = { entries: { idx: number; tag: string }[] };

function statements(sql: string) {
  return sql
    .split("--> statement-breakpoint")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function databaseUrl(base: string, database: string) {
  const parsed = new URL(base);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}

const migrationSql = (tag: string) =>
  readFileSync(fileURLToPath(new URL(`../drizzle/${tag}.sql`, import.meta.url)), "utf8");

describe("habit operations ledger", { skip: !url && "TEST_POSTGRES_URL missing" }, () => {
  const dbName = `bearing_hops_${randomUUID().replaceAll("-", "")}`;
  const admin = new Client({ connectionString: url });
  let client: Client | undefined;

  before(async () => {
    await admin.connect();
    await admin.query(`create database "${dbName}"`);
    client = new Client({ connectionString: databaseUrl(url!, dbName) });
    await client.connect();
    const journal = JSON.parse(readFileSync(fileURLToPath(new URL("../drizzle/meta/_journal.json", import.meta.url)), "utf8")) as Journal;
    for (const entry of journal.entries) {
      for (const statement of statements(migrationSql(entry.tag))) await client.query(statement);
    }
  });

  after(async () => {
    await client?.end();
    await admin.query(`drop database if exists "${dbName}"`);
    await admin.end();
  });

  async function user() {
    const { rows } = await client!.query<{ id: string }>(
      "insert into users (email, password_hash) values ($1, 'x') returning id",
      [`${randomUUID()}@example.com`],
    );
    return rows[0]!.id;
  }

  async function habit(userId: string) {
    const { rows } = await client!.query<{ id: string }>(
      "insert into habits (user_id, name, position) values ($1, 'Walk', 0) returning id",
      [userId],
    );
    return rows[0]!.id;
  }

  test("the table exists with its columns", async () => {
    const { rows } = await client!.query<{ column_name: string; is_nullable: string }>(
      "select column_name, is_nullable from information_schema.columns where table_name = 'habit_operations' order by ordinal_position",
    );
    assert.deepEqual(rows.map((row) => `${row.column_name}:${row.is_nullable}`), [
      "id:NO", "user_id:NO", "operation_id:NO", "habit_id:YES", "kind:NO", "created_at:NO",
    ]);
  });

  test("one operation id per account; another account may reuse it", async () => {
    const owner = await user();
    const other = await user();
    const habitId = await habit(owner);
    const insert = "insert into habit_operations (user_id, operation_id, habit_id, kind) values ($1, $2, $3, $4)";
    await client!.query(insert, [owner, "call-1", habitId, "create"]);
    await assert.rejects(
      client!.query(insert, [owner, "call-1", habitId, "mark"]),
      (error: { code?: string }) => error.code === "23505",
    );
    await client!.query(insert, [other, "call-1", null, "create"]);
  });

  test("deleting the habit keeps the ledger row with a null habit", async () => {
    const owner = await user();
    const habitId = await habit(owner);
    await client!.query(
      "insert into habit_operations (user_id, operation_id, habit_id, kind) values ($1, 'call-2', $2, 'mark')",
      [owner, habitId],
    );
    await client!.query("delete from habits where id = $1", [habitId]);
    const { rows } = await client!.query<{ habit_id: string | null }>(
      "select habit_id from habit_operations where user_id = $1 and operation_id = 'call-2'",
      [owner],
    );
    assert.deepEqual(rows, [{ habit_id: null }]);
  });
});
