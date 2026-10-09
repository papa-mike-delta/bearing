import assert from "node:assert/strict";
import { test } from "node:test";
import {
  defaultAccountTheme,
  importError,
  importNotice,
  takeImport,
  themeBlocks,
  themeCss,
  type AccountTheme,
} from "./account-theme.ts";

// Light and dark blocks from `shadcn apply b1sACkXE8 --only theme` (shadcn 4.21.4).
// The code decodes to Nova, Inter, Lucide, fuchsia on mauve. Not a hand-built scale.
const cliCss = `
:root {
    --background: oklch(1 0 0);
    --foreground: oklch(0.145 0.008 326);
    --primary: oklch(0.518 0.253 323.949);
    --primary-foreground: oklch(0.977 0.017 320.058);
    --muted-foreground: oklch(0.542 0.034 322.5);
    --border: oklch(0.922 0.005 325.62);
    --radius: 0.625rem;
    --chart-1: oklch(0.865 0.127 207.078);
}
.dark {
    --background: oklch(0.145 0.008 326);
    --foreground: oklch(0.985 0 0);
    --primary: oklch(0.452 0.211 324.591);
    --primary-foreground: oklch(0.977 0.017 320.058);
    --muted-foreground: oklch(0.711 0.019 323.02);
    --border: oklch(1 0 0 / 10%);
    --chart-1: oklch(0.865 0.127 207.078);
}
`;

const fuchsia = themeBlocks(cliCss)!;

const otherCss = `
:root { --background: oklch(1 0 0); --radius: 0.45rem; }
.dark { --background: oklch(0.145 0 0); --radius: 0.45rem; }
`;
const other = themeBlocks(otherCss)!;

function imported(account: AccountTheme = defaultAccountTheme) {
  return takeImport(
    account,
    "https://ui.shadcn.com/create?preset=b1sACkXE8",
    fuchsia,
  );
}

test("a create link and a preset code become the stored code and the CLI's variables", () => {
  const fromLink = imported();
  const fromCode = takeImport(defaultAccountTheme, "b1sACkXE8", fuchsia);
  assert.equal(fromLink.error, null);
  assert.equal(fromLink.account.choice, "imported");
  assert.equal(fromLink.account.code, "b1sACkXE8");
  assert.equal(fromCode.account.code, "b1sACkXE8");
  assert.equal(fromLink.account.light, fromCode.account.light);
  assert.match(fromLink.account.light ?? "", /oklch\(0\.518 0\.253 323\.949\)/);
  assert.match(fromLink.account.dark ?? "", /oklch\(1 0 0 \/ 10%\)/);
  assert.equal(fromLink.account.light?.includes("https://"), false);
});

test("a preset with a different style or type keeps the colors and says what was left out", () => {
  const result = imported();
  assert.match(result.notice ?? "", /style/);
  assert.match(result.notice ?? "", /type/);
  assert.doesNotMatch(result.notice ?? "", /icons/);
  assert.match(importNotice("b1sACkXE8") ?? "", /style/);
});

test("a second import replaces the code and both variable sets", () => {
  const first = imported();
  const second = takeImport(first.account, "b1D0dxoG", other);
  assert.equal(second.error, null);
  assert.equal(second.account.code, "b1D0dxoG");
  assert.equal(second.account.light, other.light);
  assert.equal(second.account.dark, other.dark);
  assert.equal(second.notice, "Theme imported.");
});

test("another account is unchanged", () => {
  const them = { ...defaultAccountTheme };
  const mine = imported();
  assert.deepEqual(them, defaultAccountTheme);
  assert.equal(themeCss(them), null);
  assert.match(themeCss(mine.account) ?? "", /323\.949/);
  assert.doesNotMatch(themeCss(mine.account) ?? "", /0\.45rem/);
});

test("a bad paste is rejected and the theme stays", () => {
  const current = imported().account;
  for (const input of [
    ":root { --background: oklch(1 0 0); }",
    "<html></html>",
    "https://ui.shadcn.com/init?preset=b1sACkXE8",
    "https://example.com/create?preset=b1sACkXE8",
    "not a code",
    "",
  ]) {
    const result = takeImport(current, input, fuchsia);
    assert.equal(result.error, "rejected", input);
    assert.deepEqual(result.account, current);
    assert.equal(result.notice, null);
  }
  assert.match(importError("theme") ?? "", /isn't a theme link/);
});

test("a failed expand changes nothing", () => {
  const current = imported().account;
  const result = takeImport(current, "b1D0dxoG", null);
  assert.equal(result.error, "failed");
  assert.deepEqual(result.account, current);
  assert.match(importError("theme-failed") ?? "", /Nothing was changed/);
});

test("an import without variables falls back to the shared theme", () => {
  const broken: AccountTheme = {
    choice: "imported",
    code: "b1sACkXE8",
    light: null,
    dark: null,
  };
  assert.equal(themeCss(broken), null);
  assert.equal(themeCss(defaultAccountTheme), null);
});

test("stored variables are custom properties from the CLI, not injected CSS", () => {
  const dirty = `
:root { --background: oklch(1 0 0); --primary: url(https://evil.test); }
.dark { --background: oklch(0.145 0 0); }
`;
  assert.equal(themeBlocks(dirty), null);
  assert.equal(
    themeCss({
      choice: "imported",
      code: "b1sACkXE8",
      light: "--background: oklch(1 0 0); --x: </style>",
      dark: "--background: oklch(0.145 0 0);",
    }),
    null,
  );
});
