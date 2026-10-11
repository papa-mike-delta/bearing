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
