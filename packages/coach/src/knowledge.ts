import { readFile } from "node:fs/promises";
import { URL as NodeURL } from "node:url";
import { searchKnowledgeArticles } from "./knowledge-search.ts";

// Server-only file access: keep it out of the package's client-safe index.

const habitsHref = "/coach/knowledge/habits";
const journalingHref = "/coach/knowledge/journaling";

async function readArticle(file: string) {
  return readFile(new NodeURL(file, import.meta.url), "utf8");
}

export async function journalingArticle() {
  return {
    title: "Journaling: evidence and limits",
    body: await readArticle("../knowledge/journaling.md"),
    href: journalingHref,
  };
}

export async function habitsArticle() {
  return {
    title: "Habits",
    body: await readArticle("../knowledge/habits.md"),
    href: habitsHref,
  };
}

const hrefForTitle: Record<string, string> = {
  Habits: habitsHref,
  "Journaling: evidence and limits": journalingHref,
};

export async function searchKnowledge(query: string) {
  const [habits, journaling] = await Promise.all([
    readArticle("../knowledge/habits.md"),
    readArticle("../knowledge/journaling.md"),
  ]);
  const found = searchKnowledgeArticles(
    [{ markdown: habits }, { markdown: journaling }],
    query,
  );
  if (!found) return { match: false as const };
  return { match: true as const, ...found, href: hrefForTitle[found.title] };
}
