import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transformSync } from "next/dist/build/swc/index.js";

// Node strips TypeScript but not JSX. Use the app's installed compiler to
// render the real shared control without a browser or another dependency.
const hooks = registerHooks({
  load(url, context, next) {
    if (!url.endsWith("/components/next-date-rule-control.tsx"))
      return next(url, context);
    const compiled = transformSync(readFileSync(new URL(url), "utf8"), {
      filename: new URL(url).pathname,
      jsc: {
        parser: { syntax: "typescript", tsx: true },
        transform: { react: { runtime: "automatic" } },
      },
      module: { type: "es6" },
    });
    return { format: "module", source: compiled.code, shortCircuit: true };
  },
});
const { NextDateRuleControl } =
  await import("../components/next-date-rule-control.tsx");
hooks.deregister();

test("the shared control renders a number, unit and optional on-day with its derived phrase", () => {
  const html = renderToStaticMarkup(
    createElement(NextDateRuleControl, {
      value: { every: 3, unit: "weeks", on: "tuesday" },
      onChange() {},
    }),
  );
  assert.match(html, /type="number"/);
  assert.match(html, /value="3"/);
  assert.match(html, /<label class="field">Unit/);
  assert.match(html, /On day \(optional\)/);
  assert.match(html, /value="tuesday" selected=""/);
  assert.match(html, /every 3 weeks on Tuesday/);
  assert.match(html, /type="checkbox" checked=""/);
  const days = renderToStaticMarkup(
    createElement(NextDateRuleControl, {
      value: { every: 1, unit: "days" },
      onChange() {},
    }),
  );
  assert.doesNotMatch(days, /On day \(optional\)/);
  const months = renderToStaticMarkup(
    createElement(NextDateRuleControl, {
      value: { every: 1, unit: "months", on: "last" },
      onChange() {},
    }),
  );
  assert.match(months, /every month on the last day/);
});

test("Repeat creates the shared every-month default through the actual control", () => {
  let value: unknown;
  const control = NextDateRuleControl({
    value: null,
    onChange(rule) {
      value = rule;
    },
  });
  control.props.children.props.children[0].props.onChange({ target: { checked: true } });
  assert.deepEqual(value, { every: 1, unit: "months" });
});
