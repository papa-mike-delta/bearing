import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { URL } from "node:url";
import { knowledgeModuleSource } from "../scripts/generate-knowledge.ts";
import { habitsArticle, journalingArticle, searchKnowledge } from "./knowledge.ts";

test("the embedded articles match knowledge/*.md (run scripts/generate-knowledge.ts)", async () => {
  const generated = await readFile(new URL("./knowledge-articles.generated.ts", import.meta.url), "utf8");
  assert.equal(generated, await knowledgeModuleSource());
});

test("page loaders return the article bodies without reading files", async () => {
  const habits = await habitsArticle();
  assert.equal(habits.href, "/coach/knowledge/habits");
  assert.match(habits.body, /^# Habits/m);
  const journaling = await journalingArticle();
  assert.equal(journaling.href, "/coach/knowledge/journaling");
  assert.match(journaling.body, /^# Journaling/m);
});

test("searchKnowledge: a match returns the section and its link", async () => {
  const found = await searchKnowledge("21 days");
  assert.equal(found.match, true);
  if (!found.match) return;
  assert.equal(found.title, "Habits");
  assert.equal(found.href, "/coach/knowledge/habits");
  assert.ok(found.section.includes("Source:"));
});

test("searchKnowledge: no match is a normal result, not an error", async () => {
  assert.deepEqual(await searchKnowledge("quantum zebra finance"), { match: false });
});

test("searchKnowledge: a load failure rejects, so the receipt says it couldn't look up", async () => {
  await assert.rejects(searchKnowledge("21 days", async () => { throw new Error("ENOENT habits.md"); }), /ENOENT/);
});
