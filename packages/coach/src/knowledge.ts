import { habitsMarkdown, journalingMarkdown } from "./knowledge-articles.generated.ts";
import { searchKnowledgeArticles } from "./knowledge-search.ts";

// The article text is embedded at build time (see scripts/generate-knowledge.ts),
// so the pages and the Coach route never read traced files at runtime.

const habitsHref = "/coach/knowledge/habits";
const journalingHref = "/coach/knowledge/journaling";

export type KnowledgeArticles = { habits: string; journaling: string };

const embedded = async (): Promise<KnowledgeArticles> => ({ habits: habitsMarkdown, journaling: journalingMarkdown });

export async function journalingArticle() {
  return { title: "Journaling: evidence and limits", body: journalingMarkdown, href: journalingHref };
}

export async function habitsArticle() {
  return { title: "Habits", body: habitsMarkdown, href: habitsHref };
}

const hrefForTitle: Record<string, string> = {
  Habits: habitsHref,
  "Journaling: evidence and limits": journalingHref,
};

export async function searchKnowledge(query: string, load: () => Promise<KnowledgeArticles> = embedded) {
  const { habits, journaling } = await load();
  const found = searchKnowledgeArticles([{ markdown: habits }, { markdown: journaling }], query);
  if (!found) return { match: false as const };
  return { match: true as const, ...found, href: hrefForTitle[found.title] };
}
