import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { URL } from "node:url";
import { searchKnowledgeArticles } from "./knowledge-search.ts";

async function articles() {
  const habits = await readFile(new URL("../knowledge/habits.md", import.meta.url), "utf8");
  const journaling = await readFile(new URL("../knowledge/journaling.md", import.meta.url), "utf8");
  return [{ markdown: habits }, { markdown: journaling }];
}

test("habit questions hit one section, its title, and the source line", async () => {
  const corpus = await articles();
  const cases = [
    ["21 days", "How long does a habit take? Not 21 days", "Lally"],
    ["missed a day", "Missed a day? It does not reset the habit", "does not mean"],
    ["if-then", "If-then plans (implementation intentions) for getting started", "Gollwitzer"],
  ] as const;
  for (const [query, heading, needle] of cases) {
    const found = searchKnowledgeArticles(corpus, query);
    assert.equal(found?.title, "Habits");
    assert.equal(found?.heading, heading);
    assert.ok(found?.section.includes(needle));
    assert.ok(found?.section.includes("Source:"));
    assert.ok(found?.section.includes("What this does not mean"));
  }
});

test("an unrelated query does not match, and another article still can", async () => {
  const corpus = await articles();
  assert.equal(searchKnowledgeArticles(corpus, "quantum physics"), null);
  assert.equal(searchKnowledgeArticles(corpus, ""), null);
  const gratitude = searchKnowledgeArticles(corpus, "gratitude");
  assert.equal(gratitude?.title, "Journaling: evidence and limits");
  assert.equal(gratitude?.heading, "Gratitude");
});
