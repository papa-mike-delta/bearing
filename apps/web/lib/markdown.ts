import { createElement } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { isJournalDay } from "./journal-day.ts";

type MarkdownNode = { type: string; value?: string; children?: MarkdownNode[]; data?: { hName: string } };

export function remarkHighlight() {
  return (tree: MarkdownNode) => {
    function walk(node: MarkdownNode) {
      if (!node.children || node.type === "code" || node.type === "inlineCode") return;
      node.children = node.children.flatMap((child) => {
        if (child.type !== "text" || !child.value) { walk(child); return [child]; }
        return child.value.split(/(==[^=\n]+==)/g).filter(Boolean).map((value) =>
          value.startsWith("==") && value.endsWith("==")
            ? { type: "highlight", data: { hName: "mark" }, children: [{ type: "text", value: value.slice(2, -2) }] }
            : { type: "text", value },
        );
      });
    }
    walk(tree);
  };
}

export function markdownUrl(url: string, key: string) {
  if (key === "src") return /^https:\/\//i.test(url) ? url : "";
  if (/^(https?:\/\/|mailto:)/i.test(url)) return url;
  if (!url.startsWith("//") && !/[\\\u0000-\u0020]/.test(url) && !/^[^/?#]*:/.test(url)) return url;
  return "";
}

type PreviewNode = { tagName?: string; properties?: { href?: unknown; className?: string[] }; children?: PreviewNode[] };

export function renderMarkdownPreview(value: string, savedJournalDays: readonly string[] = [], images: Pick<Components, "img"> = {}) {
  const journalDays = new Set<string>();
  const saved = new Set(savedJournalDays);
  // Inspect parsed anchors: reference links count, code, images and HTML do not.
  function journalLinks() {
    return (tree: PreviewNode) => {
      function walk(node: PreviewNode) {
        const href = node.tagName === "a" ? node.properties?.href : undefined;
        if (typeof href === "string" && href.startsWith("/journal/")) {
          const day = href.slice("/journal/".length);
          if (isJournalDay(day)) {
            if (journalDays.size < 100) journalDays.add(day);
            if (!saved.has(day)) node.properties!.className = ["journal-link-unresolved"];
          }
        }
        node.children?.forEach(walk);
      }
      walk(tree);
    };
  }
  const content = Markdown({
    children: value, skipHtml: true,
    remarkPlugins: [remarkGfm, remarkHighlight],
    rehypePlugins: [rehypeHighlight, journalLinks],
    urlTransform: markdownUrl,
    components: {
      a: ({ children, href, className }) => createElement("a", { href, className, rel: "noreferrer noopener" }, children),
      img: ({ src, alt }) => typeof src === "string" && src
        ? createElement("img", { src, alt, loading: "lazy", referrerPolicy: "no-referrer" })
        : createElement("span", null, alt || "Image unavailable"),
      ...images,
    },
  });
  return { content, journalDays: [...journalDays] };
}
