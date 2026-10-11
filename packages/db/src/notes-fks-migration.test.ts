import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { after, before, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const url = process.env.TEST_POSTGRES_URL;
if (!url && process.env.CI) {
  test("notes foreign-key migration requires Postgres in CI", () => {
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

describe("notes foreign keys migration", { skip: !url && "TEST_POSTGRES_URL missing" }, () => {
  const dbName = `bearing_nfk_${randomUUID().replaceAll("-", "")}`;
  const admin = new Client({ connectionString: url });
  let client: Client | undefined;

  before(async () => {
    await admin.connect();
    await admin.query(`create database "${dbName}"`);
    client = new Client({ connectionString: databaseUrl(url!, dbName) });
    await client.connect();
    const journal = JSON.parse(readFileSync(fileURLToPath(new URL("../drizzle/meta/_journal.json", import.meta.url)), "utf8")) as Journal;
    for (const entry of journal.entries.filter((entry) => entry.idx < 7)) {
      for (const statement of statements(migrationSql(entry.tag))) await client.query(statement);
    }
  });

  after(async () => {
    await client?.end();
    await admin.query("select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()", [dbName]);
    await admin.query(`drop database if exists "${dbName}"`);
    await admin.end();
  });

  test("0007 nulls a missing notebook, drops a missing user, and adds foreign keys", async () => {
    const userId = randomUUID();
    const notebookId = randomUUID();
    const orphanNotebookId = randomUUID();
    const missingUser = randomUUID();
    const missingNotebook = randomUUID();
    const validNote = randomUUID();
    const looseNote = randomUUID();
    const orphanUserNote = randomUUID();
    const db = client!;
    await db.query("insert into users (id, email, password_hash) values ($1, $2, '-')", [userId, `${userId}@test.invalid`]);
    await db.query("insert into notebooks (id, user_id, name) values ($1, $2, 'Ideas'), ($3, $4, 'Orphan')", [notebookId, userId, orphanNotebookId, missingUser]);
    await db.query(
      `insert into notes (id, user_id, notebook_id, title, body) values
        ($1, $2, $3, 'Valid', 'kept'),
        ($4, $2, $5, 'Missing notebook', 'loose'),
        ($6, $7, $3, 'Missing user', 'gone')`,
      [validNote, userId, notebookId, looseNote, missingNotebook, orphanUserNote, missingUser],
    );

    for (const statement of statements(migrationSql("0007_notes_fks"))) await db.query(statement);

    const notes = await db.query<{ id: string; notebook_id: string | null; title: string; body: string }>(
      "select id, notebook_id, title, body from notes order by title",
    );
    assert.deepEqual(
      notes.rows.map((row) => ({ id: row.id, notebook_id: row.notebook_id, title: row.title, body: row.body })),
      [
        { id: looseNote, notebook_id: null, title: "Missing notebook", body: "loose" },
        { id: validNote, notebook_id: notebookId, title: "Valid", body: "kept" },
      ],
    );
    const notebooks = await db.query<{ id: string }>("select id from notebooks order by id");
    assert.deepEqual(notebooks.rows.map((row) => row.id), [notebookId]);

    const keys = await db.query<{ conname: string; def: string }>(
      `select c.conname, pg_get_constraintdef(c.oid) as def
       from pg_constraint c
       join pg_class r on r.oid = c.conrelid
       where c.contype = 'f' and r.relname in ('notes', 'notebooks')
       order by c.conname`,
    );
    const byName = Object.fromEntries(keys.rows.map((row) => [row.conname, row.def.toLowerCase()]));
    assert.match(byName.notebooks_user_id_users_id_fk ?? "", /on delete cascade/);
    assert.match(byName.notes_user_id_users_id_fk ?? "", /on delete cascade/);
    assert.match(byName.notes_notebook_id_notebooks_id_fk ?? "", /on delete set null/);
  });
});
