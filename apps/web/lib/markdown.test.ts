import assert from "node:assert/strict";
import { test } from "node:test";
import { markdownUrl, remarkHighlight } from "./markdown.ts";

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
