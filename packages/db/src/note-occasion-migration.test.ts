import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("0022 adds only a nullable date to Notes, preserving Task, Journal, people and links", async () => {
  const read = (name: string) => readFile(new URL(`../drizzle/${name}`, import.meta.url), "utf8");
  assert.equal((await read("0022_note_occasion.sql")).trim(), 'ALTER TABLE "notes" ADD COLUMN "occasion_date" date;');
  const before = JSON.parse(await read("meta/0021_snapshot.json"));
  const after = JSON.parse(await read("meta/0022_snapshot.json"));
  assert.equal(after.prevId, before.id);
  assert.deepEqual(after.tables["public.notes"].columns.occasion_date, {
    name: "occasion_date", type: "date", primaryKey: false, notNull: false,
  });
  delete after.tables["public.notes"].columns.occasion_date;
  for (const snapshot of [before, after]) { delete snapshot.id; delete snapshot.prevId; }
  assert.deepEqual(after, before);
  const journal = JSON.parse(await read("meta/_journal.json"));
  assert.equal(journal.entries.at(-1).tag, "0022_note_occasion");
  assert.equal(journal.entries.at(-1).idx, 22);
});
