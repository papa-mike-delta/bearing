import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

// Drop @layer blocks so the assertion sees only the unlayered field rule.
function withoutLayers(css: string): string {
  let out = "";
  let i = 0;
  while (i < css.length) {
    const at = css.indexOf("@layer", i);
    if (at === -1) {
      out += css.slice(i);
      break;
    }
    out += css.slice(i, at);
    const open = css.indexOf("{", at);
    assert.notEqual(open, -1);
    let depth = 0;
    let j = open;
    for (; j < css.length; j++) {
      if (css[j] === "{") depth += 1;
      else if (css[j] === "}") {
        depth -= 1;
        if (depth === 0) {
          j += 1;
          break;
        }
      }
    }
    i = j;
  }
  return out;
}

function mediaBody(css: string, query: string): string | undefined {
  const re = /@media\s*\(([^)]*)\)\s*\{/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(css))) {
    if (!match[1]!.includes(query)) continue;
    const start = match.index + match[0].length;
    let depth = 1;
    let j = start;
    for (; j < css.length && depth > 0; j++) {
      if (css[j] === "{") depth += 1;
      else if (css[j] === "}") depth -= 1;
    }
    return css.slice(start, j - 1);
  }
  return undefined;
}

function classTokens(source: string): string[] {
  const match = source.match(/className=\{cn\(\s*"([^"]*)"/);
  assert.ok(match, "kit class string");
  return match[1]!.split(/\s+/);
}

// A bare text-sm is the utility itself, not a variant such as md:text-sm.
function bareTextSm(token: string): boolean {
  return /^(?:!)?text-sm(?:\/|$)/.test(token);
}

test("fields are 16px below md and the kit uses text-base", () => {
  const css = readFileSync(join(here, "../app/globals.css"), "utf8");
  const unlayered = withoutLayers(css);
  assert.match(unlayered, /@media\s*\(\s*max-width:\s*767\.98px\s*\)/);
  const body = mediaBody(unlayered, "max-width: 767.98px");
  assert.ok(body);
  assert.match(body, /\[data-slot="input"\]/);
  assert.match(body, /\[data-slot="textarea"\]/);
  assert.match(body, /\[data-slot="native-select"\]/);
  assert.match(body, /\[data-slot="input-group-control"\]/);
  assert.match(body, /font-size:\s*16px/);

  for (const file of ["input.tsx", "textarea.tsx"]) {
    const source = readFileSync(
      join(here, "../../../packages/ui/src/components", file),
      "utf8",
    );
    const tokens = classTokens(source);
    assert.ok(tokens.includes("text-base"), file);
    assert.ok(tokens.includes("md:text-xs/relaxed"), file);
    assert.equal(tokens.some(bareTextSm), false, `${file} has a bare text-sm`);
  }
});
