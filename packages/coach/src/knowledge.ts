import { habitsMarkdown, journalingMarkdown, peopleMarkdown } from "./knowledge-articles.generated.ts";
import { searchKnowledgeArticles } from "./knowledge-search.ts";

// The article text is embedded at build time (see scripts/generate-knowledge.ts),
// so the pages and the Coach route never read traced files at runtime.

const habitsHref = "/coach/knowledge/habits";
const journalingHref = "/coach/knowledge/journaling";

export type KnowledgeArticles = { habits: string; journaling: string; people?: string };

const embedded = async (): Promise<KnowledgeArticles> => ({ habits: habitsMarkdown, journaling: journalingMarkdown, people: peopleMarkdown });

export async function journalingArticle() {
  return { title: "Journaling: evidence and limits", body: journalingMarkdown, href: journalingHref };
}

export async function habitsArticle() {
  return { title: "Habits", body: habitsMarkdown, href: habitsHref };
}

const hrefForTitle: Record<string, string> = {
  Habits: habitsHref,
  "People: reach-out rules": "/coach/knowledge/people",
  "Journaling: evidence and limits": journalingHref,
};

export async function searchKnowledge(query: string, load: () => Promise<KnowledgeArticles> = embedded) {
  const { habits, journaling, people } = await load();
  const found = searchKnowledgeArticles([{ markdown: habits }, { markdown: journaling }, ...(people ? [{ markdown: people }] : [])], query);
  if (!found) return { match: false as const };
  return { match: true as const, ...found, href: hrefForTitle[found.title] };
}

export async function peopleArticle() { return {title:"People: reach-out rules",body:peopleMarkdown,href:"/coach/knowledge/people"}; }
