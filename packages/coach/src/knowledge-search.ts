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

// Every query word must appear in the heading. The shortest matching heading
// wins, and an equal length keeps the earlier section.
export function searchKnowledgeArticles(
  articles: readonly { markdown: string }[],
  query: string,
): KnowledgeSection | null {
  const wanted = words(query);
  if (wanted.length === 0) return null;
  let best: KnowledgeSection & { extra: number; index: number } | null = null;
  let index = 0;
  for (const article of articles) {
    const parsed = parseKnowledge(article.markdown);
    if (!parsed) continue;
    for (const section of parsed.sections) {
      const headingWords = words(section.heading);
      const have = new Set(headingWords);
      const matches = wanted.every((word) => have.has(word));
      if (matches) {
        const candidate = {
          title: parsed.title,
          heading: section.heading,
          section: section.body,
          extra: headingWords.length,
          index,
        };
        if (
          !best ||
          candidate.extra < best.extra ||
          (candidate.extra === best.extra && candidate.index < best.index)
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
