import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { markdownUrl, remarkHighlight, renderMarkdownPreview } from "./markdown.ts";

test("preview fades missing journal days and keeps saved days and external links solid", () => {
  const source = "[Saved](/journal/2026-10-01) [Past](/journal/2026-10-02) [Today](/journal/2026-10-11) [Future](/journal/2099-01-01) [External](https://example.com/journal/2026-10-02)";
  const preview = renderMarkdownPreview(source, ["2026-10-01"]);
  const html = renderToStaticMarkup(preview.content);
  assert.deepEqual(preview.journalDays, ["2026-10-01", "2026-10-02", "2026-10-11", "2099-01-01"]);
  assert.match(html, /<a href="\/journal\/2026-10-01" rel="noreferrer noopener">Saved<\/a>/);
  for (const day of ["2026-10-02", "2026-10-11", "2099-01-01"]) {
    assert.match(html, new RegExp(`<a href="/journal/${day}" class="journal-link-unresolved" rel="noreferrer noopener">`));
  }
  assert.match(html, /<a href="https:\/\/example.com\/journal\/2026-10-02" rel="noreferrer noopener">External<\/a>/);
});

test("only exact valid journal anchors are resolved, including references; unsafe URLs remain blocked", () => {
  const source = [
    "[Leap][day] [Again](/journal/2024-02-29)",
    "[day]: /journal/2024-02-29",
    "`[Code](/journal/2026-10-01)`",
    "```md\n[Code block](/journal/2026-10-02)\n```",
    "![Image](/journal/2026-10-03)",
    '<a href="/journal/2026-10-04">HTML</a>',
    "[[2026-10-05]]",
    "[Invalid](/journal/2026-02-29) [Zero](/journal/0000-01-01)",
    "[Query](/journal/2024-02-29?x=1) [Hash](/journal/2024-02-29#heading) [Slash](/journal/2024-02-29/)",
    "[Relative](journal/2024-02-29) [Mail](mailto:a@example.com)",
    "[Unsafe](javascript:alert%281%29) [Protocol relative](//evil.test/journal/2024-02-29)",
    "[Backslash](/journal/2024-02-29%5Cevil)",
  ].join("\n\n");
  const preview = renderMarkdownPreview(source);
  const html = renderToStaticMarkup(preview.content);
  assert.deepEqual(preview.journalDays, ["2024-02-29"]);
  assert.equal((html.match(/class="journal-link-unresolved"/g) ?? []).length, 2);
  assert.match(html, /href="\/journal\/2024-02-29" class="journal-link-unresolved" rel="noreferrer noopener">Leap/);
  assert.match(html, /href="\/journal\/2024-02-29\?x=1" rel="noreferrer noopener">Query/);
  assert.match(html, /href="mailto:a@example.com" rel="noreferrer noopener">Mail/);
  assert.match(html, /href="" rel="noreferrer noopener">Unsafe/);
  assert.match(html, /href="" rel="noreferrer noopener">Protocol relative/);
  assert.doesNotMatch(html, /<a[^>]*>HTML/);
  assert.match(html, /\[\[2026-10-05\]\]/);
});

test("preview caps resolution at the first 100 distinct linked days", () => {
  const links = Array.from({ length: 101 }, (_, index) => `[Day](/journal/${2000 + index}-01-01)`);
  const preview = renderMarkdownPreview([links[0], ...links].join(" "));
  assert.equal(preview.journalDays.length, 100);
  assert.equal(preview.journalDays[0], "2000-01-01");
  assert.equal(preview.journalDays[99], "2099-01-01");
  assert.match(renderToStaticMarkup(preview.content), /href="\/journal\/2100-01-01" class="journal-link-unresolved"/);
});

test("markdown denies unsafe schemes and only loads HTTPS images", () => {
  for (const url of ["javascript:alert(1)", "data:text/html,bad", "vbscript:x", "//evil.test", "java\nscript:alert(1)", "\\evil.test"]) {
    assert.equal(markdownUrl(url, "href"), "");
    assert.equal(markdownUrl(url, "src"), "");
  }
  assert.equal(markdownUrl("http://example.com/a.png", "src"), "");
  assert.equal(markdownUrl("https://example.com/a.png", "src"), "https://example.com/a.png");
  assert.equal(markdownUrl("/notes", "href"), "/notes");
});

test("highlight syntax transforms only prose, never code or HTML", () => {
  const tree = { type: "root", children: [{ type: "text", value: "plain ==bright== tail" }, { type: "code", value: "==code==" }, { type: "html", value: "<script>alert(1)</script>" }] };
  remarkHighlight()(tree);
  assert.deepEqual(tree.children[1], { type: "highlight", data: { hName: "mark" }, children: [{ type: "text", value: "bright" }] });
  assert.equal(tree.children[3]?.value, "==code==");
});
