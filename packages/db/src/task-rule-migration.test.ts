import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("0019 adds only a nullable Task rule, with no people, links, occasion or streak schema", async () => {
  const read = (name: string) =>
    readFile(new URL(`../drizzle/${name}`, import.meta.url), "utf8");
  assert.equal(
    (await read("0019_elite_champions.sql")).trim(),
    'ALTER TABLE "tasks" ADD COLUMN "rule" jsonb;',
  );
  const before = JSON.parse(await read("meta/0018_snapshot.json"));
  const after = JSON.parse(await read("meta/0019_snapshot.json"));
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
