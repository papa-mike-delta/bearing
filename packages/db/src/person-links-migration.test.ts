import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("0021 lets entity_links use 'person' for both source and target types, and nothing else", async () => {
  const read = (name: string) =>
    readFile(new URL(`../drizzle/${name}`, import.meta.url), "utf8");
  const sql = await read("0021_person_links.sql");
  for (const side of ["source", "target"]) {
    assert.match(
      sql,
      new RegExp(
        `ADD CONSTRAINT "entity_links_${side}_type" CHECK \\("entity_links"\\."${side}_type" in \\('task', 'note', 'journal', 'person'\\)\\)`,
      ),
    );
  }
  const before = JSON.parse(await read("meta/0020_snapshot.json"));
  const after = JSON.parse(await read("meta/0021_snapshot.json"));
  const checks = after.tables["public.entity_links"].checkConstraints;
  for (const side of ["source", "target"]) {
    assert.match(checks[`entity_links_${side}_type`].value, /'person'/);
    delete checks[`entity_links_${side}_type`];
    delete before.tables["public.entity_links"].checkConstraints[`entity_links_${side}_type`];
  }
  for (const s of [before, after]) {
    delete s.id;
    delete s.prevId;
  }
  assert.deepEqual(after, before);
});
