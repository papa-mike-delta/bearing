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

test('People knowledge ships its product rules, boundaries and searchable section with a linked receipt', async () => {
  const {peopleArticle} = await import('./knowledge.ts');
  const article = await peopleArticle();
  assert.equal(article.href,'/coach/knowledge/people');
  assert.match(article.body,/strictly after last connected/);
  assert.match(article.body,/cannot add, rename, regroup or delete/);
  const result = await searchKnowledge('Keeping people');
  assert.equal(result.match,true);
  if(result.match) {assert.equal(result.title,'People: reach-out rules');assert.equal(result.href,article.href);}
});

test("habits.md and its generated copy state the repeat rule interval as 1–9999, not 1–999", async () => {
  const { readFile } = await import("node:fs/promises");
  const { habitsMarkdown } = await import("./knowledge-articles.generated.ts");
  const source = await readFile(new URL("../knowledge/habits.md", import.meta.url), "utf8");
  for (const text of [source, habitsMarkdown]) {
    assert.ok(text.includes("every 1–9999 days, weeks or months"));
    assert.equal(text.includes("every 1–999 days"), false);
  }
  assert.equal(habitsMarkdown, source);
});

test("Note occasion dates live in notes.md, while people.md keeps 'People have no occasion date'", async () => {
  const { readFile } = await import("node:fs/promises");
  const { notesMarkdown, peopleMarkdown } = await import("./knowledge-articles.generated.ts");
  const notes = await readFile(new URL("../knowledge/notes.md", import.meta.url), "utf8");
  const people = await readFile(new URL("../knowledge/people.md", import.meta.url), "utf8");
  assert.equal(notesMarkdown, notes);
  assert.equal(peopleMarkdown, people);
  assert.match(notes, /^## Note occasion dates/m);
  assert.doesNotMatch(people, /## Note occasion dates/);
  assert.ok(people.includes("People have no occasion date"));
  const { notesArticle } = await import("./knowledge.ts");
  const article = await notesArticle();
  assert.equal(article.href, "/coach/knowledge/notes");
  const result = await searchKnowledge("Note occasion dates");
  assert.equal(result.match, true);
  if (result.match) assert.equal(result.href, "/coach/knowledge/notes");
});
