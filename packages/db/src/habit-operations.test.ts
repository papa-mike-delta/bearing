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
      "id:NO", "user_id:NO", "source:NO", "operation_id:NO", "habit_id:NO", "result:NO", "created_at:NO",
    ]);
  });

  const insert = "insert into habit_operations (user_id, source, operation_id, habit_id, result) values ($1, $2, $3, $4, $5)";

  test("a second row with the same user, source and operation id is refused", async () => {
    const owner = await user();
    const other = await user();
    const habitId = await habit(owner);
    await client!.query(insert, [owner, "coach", "call-1", habitId, { count: 1 }]);
    await assert.rejects(
      client!.query(insert, [owner, "coach", "call-1", habitId, { count: 2 }]),
      (error: { code?: string }) => error.code === "23505",
    );
    // Only the full (user, source, operation) triple is unique.
    await client!.query(insert, [owner, "screen", "call-1", habitId, {}]);
    await client!.query(insert, [other, "coach", "call-1", habitId, {}]);
  });

  test("deleting a habit leaves its operation rows", async () => {
    const owner = await user();
    const habitId = await habit(owner);
    await client!.query(insert, [owner, "coach", "call-2", habitId, { done: true }]);
    await client!.query("delete from habits where id = $1", [habitId]);
    const { rows } = await client!.query<{ habit_id: string; result: unknown }>(
      "select habit_id, result from habit_operations where user_id = $1 and operation_id = 'call-2'",
      [owner],
    );
    assert.deepEqual(rows, [{ habit_id: habitId, result: { done: true } }]);
  });

  test("deleting the account removes its operation rows", async () => {
    const owner = await user();
    const habitId = await habit(owner);
    await client!.query(insert, [owner, "coach", "call-3", habitId, {}]);
    await client!.query("delete from users where id = $1", [owner]);
    const { rows } = await client!.query("select 1 from habit_operations where user_id = $1", [owner]);
    assert.equal(rows.length, 0);
  });
});

describe("0018 on existing once-habits", { skip: !url && "TEST_POSTGRES_URL missing" }, () => {
  const dbName = `bearing_h18_${randomUUID().replaceAll("-", "")}`;
  const admin = new Client({ connectionString: url });
  let client: Client | undefined;

  before(async () => {
    await admin.connect();
    await admin.query(`create database "${dbName}"`);
    client = new Client({ connectionString: databaseUrl(url!, dbName) });
    await client.connect();
  });

  after(async () => {
    await client?.end();
    await admin.query(`drop database if exists "${dbName}"`);
    await admin.end();
  });

  test("existing habits stay daily once-habits and marks become count 1", async () => {
    const journal = JSON.parse(readFileSync(fileURLToPath(new URL("../drizzle/meta/_journal.json", import.meta.url)), "utf8")) as Journal;
    for (const entry of journal.entries.filter((entry) => entry.idx < 18)) {
      for (const statement of statements(migrationSql(entry.tag))) await client!.query(statement);
    }
    const { rows: [account] } = await client!.query<{ id: string }>(
      "insert into users (email, password_hash) values ($1, 'x') returning id", [`${randomUUID()}@example.com`],
    );
    const { rows: [walk] } = await client!.query<{ id: string }>(
      "insert into habits (user_id, name, position) values ($1, 'Walk', 0) returning id", [account!.id],
    );
    await client!.query("insert into habit_marks (habit_id, day) values ($1, '2026-10-10'), ($1, '2026-10-11')", [walk!.id]);
    for (const statement of statements(migrationSql("0018_habit_counts"))) await client!.query(statement);
    const { rows: habits } = await client!.query("select period, track_mode, goal_count, bad from habits");
    assert.deepEqual(habits, [{ period: "day", track_mode: "once", goal_count: null, bad: false }]);
    const { rows: marks } = await client!.query("select count from habit_marks order by day");
    assert.deepEqual(marks, [{ count: 1 }, { count: 1 }]);
  });
});
