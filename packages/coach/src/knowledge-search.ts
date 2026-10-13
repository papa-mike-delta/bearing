// Heading search over the static knowledge articles. No embeddings, no user data.

export type KnowledgeSection = {
  title: string;
  heading: string;
  section: string;
};

export function words(value: string): string[] {
  return value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

export function parseKnowledge(markdown: string): {
  title: string;
  sections: { heading: string; body: string }[];
} | null {
  const lines = markdown.replace(/^\uFEFF/, "").split(/\r?\n/);
  const titleLine = lines.find((line) => line.startsWith("# "));
  if (!titleLine) return null;
  const title = titleLine.slice(2).trim();
  const sections: { heading: string; body: string }[] = [];
  let heading = "";
  let body: string[] = [];
  const flush = () => {
    if (!heading) return;
    sections.push({ heading, body: body.join("\n").trim() });
  };
  for (const line of lines) {
    if (line.startsWith("## ")) {
      flush();
      heading = line.slice(3).trim();
      body = [];
    } else if (heading) body.push(line);
  }
  flush();
  if (!title || sections.length === 0) return null;
  return { title, sections };
}

const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "of", "to", "in", "on", "at", "for", "with", "by", "from",
  "is", "are", "was", "were", "be", "been", "am", "do", "does", "did", "doing", "it", "its", "this",
  "that", "these", "those", "i", "me", "my", "we", "you", "your", "he", "she", "they", "them",
  "what", "how", "why", "when", "where", "which", "who", "can", "could", "should", "would", "will",
  "really", "actually", "just", "about", "any", "some", "there", "so", "very", "much", "many",
  "tell", "know", "need", "want", "please", "have", "has", "had", "true", "not", "no",
]);

function stem(word: string): string {
  if (/^\d+$/.test(word)) return word;
  if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

export function contentWords(value: string): string[] {
  return [...new Set(words(value).filter((word) => !STOPWORDS.has(word)).map(stem))];
}

// Score each section on query content words (stopwords dropped, plurals folded,
// numbers kept): a heading hit counts 3, a body-only hit 1, and a number counts
// double. A section matches only when at least half the query words appear in
// it and at least one appears in the heading. Highest score wins, then the
// shorter heading, then the earlier section.
export function searchKnowledgeArticles(
  articles: readonly { markdown: string }[],
  query: string,
): KnowledgeSection | null {
  const wanted = contentWords(query);
  if (wanted.length === 0) return null;
  let best: (KnowledgeSection & { score: number; extra: number; index: number }) | null = null;
  let index = 0;
  for (const article of articles) {
    const parsed = parseKnowledge(article.markdown);
    if (!parsed) continue;
    for (const section of parsed.sections) {
      const heading = new Set(contentWords(section.heading));
      const body = new Set(contentWords(section.body));
      let score = 0;
      let hits = 0;
      let headingHits = 0;
      for (const word of wanted) {
        const weight = /^\d+$/.test(word) ? 2 : 1;
        if (heading.has(word)) {
          score += 3 * weight;
          hits += 1;
          headingHits += 1;
        } else if (body.has(word)) {
          score += weight;
          hits += 1;
        }
      }
      if (headingHits > 0 && hits * 2 >= wanted.length) {
        const candidate = {
          title: parsed.title,
          heading: section.heading,
          section: section.body,
          score,
          extra: words(section.heading).length,
          index,
        };
        if (
          !best ||
          candidate.score > best.score ||
          (candidate.score === best.score && candidate.extra < best.extra)
        ) {
          best = candidate;
        }
      }
      index += 1;
    }
  }
  if (!best) return null;
  return { title: best.title, heading: best.heading, section: best.section };
}
