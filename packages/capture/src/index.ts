// Draft parse and action runners. Calls @repo/domain.
// Inbox text is a draft until an action files it.

export type DraftHints = {
  tags: string[];
  area?: string;
  priority?: number;
  date?: string;
};

export function parseDraft(body: string): DraftHints {
  const tags = [...body.matchAll(/#([\w-]+)/g)].map((match) => match[1] ?? "");
  return { tags: tags.filter(Boolean) };
}
