"use client";

import { useState } from "react";
import CodeMirror, { EditorView } from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { Button } from "@repo/ui/components/button";
import { markdownUrl, remarkHighlight } from "../lib/markdown";

// Replaces the light fallback highlighter so markdown marks can read --md-meta.
// Dark mode sets that to --muted-foreground; light keeps the previous grey.
const markdownHighlight = syntaxHighlighting(HighlightStyle.define([
  { tag: tags.meta, color: "var(--md-meta, #404740)" },
  { tag: tags.link, textDecoration: "underline" },
  { tag: tags.heading, textDecoration: "underline", fontWeight: "bold" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strong, fontWeight: "bold" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: tags.keyword, color: "#708" },
  { tag: [tags.atom, tags.bool, tags.url, tags.contentSeparator, tags.labelName], color: "#219" },
  { tag: [tags.literal, tags.inserted], color: "#164" },
  { tag: [tags.string, tags.deleted], color: "#a11" },
  { tag: [tags.regexp, tags.escape, tags.special(tags.string)], color: "#e40" },
  { tag: tags.definition(tags.variableName), color: "#00f" },
  { tag: tags.local(tags.variableName), color: "#30a" },
  { tag: [tags.typeName, tags.namespace], color: "#085" },
  { tag: tags.className, color: "#167" },
  { tag: [tags.special(tags.variableName), tags.macroName], color: "#256" },
  { tag: tags.definition(tags.propertyName), color: "#00c" },
  { tag: tags.comment, color: "#940" },
  { tag: tags.invalid, color: "#f00" },
]));

const extensions = [markdown(), markdownHighlight, EditorView.lineWrapping, EditorView.contentAttributes.of({ "aria-label": "Markdown body" }), EditorView.theme({
  "&": { backgroundColor: "transparent", color: "var(--foreground)", fontSize: "14px" },
  "&.cm-focused": { outline: "none" },
  ".cm-content": { fontFamily: "var(--font-mono), monospace", minHeight: "20rem", outline: "none" },
  ".cm-gutters": { backgroundColor: "transparent", color: "var(--muted-foreground)", border: "none" },
  ".cm-cursor": { borderLeftColor: "var(--foreground)" },
  ".cm-activeLine, .cm-activeLineGutter": { backgroundColor: "var(--muted)" },
})];

export function MarkdownPreview({ value }: { value: string }) {
  return <div className="markdown-preview"><Markdown skipHtml remarkPlugins={[remarkGfm, remarkHighlight]} rehypePlugins={[rehypeHighlight]} urlTransform={markdownUrl}
    components={{ a: ({ children, href }) => <a href={href} rel="noreferrer noopener">{children}</a>, img: ({ src, alt }) => typeof src === "string" && src ? <RemoteImage key={src} src={src} alt={alt ?? ""} /> : <span>{alt || "Image unavailable"}</span> }}
  >{value}</Markdown></div>;
}

function RemoteImage({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <span>{alt || "Image unavailable"}</span>;
  // Remote markdown images load only in the browser, never through the image proxy.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
}

export function MarkdownEditor({ value, onChange, disabled }: { value: string; onChange(value: string): void; disabled?: boolean }) {
  const [preview, setPreview] = useState(false);
  return <section className="flex min-w-0 flex-col gap-3" aria-label="Markdown editor">
    <div className="flex items-center justify-between">
      <span>Markdown body</span><Button type="button" variant="outline" aria-pressed={preview} onClick={() => setPreview(!preview)}>{preview ? "Edit source" : "Preview"}</Button>
    </div>
    {preview ? <MarkdownPreview value={value} /> : <CodeMirror className="markdown-field" value={value} onChange={onChange} extensions={extensions} editable={!disabled} theme="none" basicSetup={{ lineNumbers: false, foldGutter: false }} />}
    <details><summary>Markdown help</summary><p>Headings, lists, checklists, tables, fenced code, links and horizontal rules are supported. Use <code>==highlight==</code> for highlights and <code>{"![description](https://…)"}</code> for images. Raw HTML is disabled. Press Escape, then Tab to leave the editor.</p></details>
  </section>;
}
