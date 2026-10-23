import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("0020 adds only a nullable Task rule, with no links, occasion or streak schema", async () => {
  const read = (name: string) =>
    readFile(new URL(`../drizzle/${name}`, import.meta.url), "utf8");
  assert.equal(
    (await read("0020_task_rule.sql")).trim(),
    'ALTER TABLE "tasks" ADD COLUMN "rule" jsonb;',
  );
  const before = JSON.parse(await read("meta/0019_snapshot.json"));
  const after = JSON.parse(await read("meta/0020_snapshot.json"));
  assert.deepEqual(after.tables["public.tasks"].columns.rule, {
    name: "rule",
    type: "jsonb",
    primaryKey: false,
    notNull: false,
  });
  delete after.tables["public.tasks"].columns.rule;
  delete before.id;
  delete after.id;
  delete before.prevId;
  delete after.prevId;
  assert.deepEqual(after, before);
});
