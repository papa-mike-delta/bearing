import assert from "node:assert/strict";
import { test } from "node:test";
import { expandPreset } from "./expand-preset.ts";
import {
  defaultAccountTheme,
  importError,
  importNotice,
  maxPresetInputLength,
  maxStoredThemeLength,
  readPreset,
  sanitizeBlock,
  takeImport,
  themeCss,
  type AccountTheme,
} from "./account-theme.ts";

// Nova, Inter, Lucide, fuchsia on mauve. The variables come from the checked-in
// theme table (shadcn 4.21.4), not a hand-built scale.
const fuchsia = expandPreset("b1sACkXE8");
if (!fuchsia) throw new Error("b1sACkXE8 did not expand");

const other = {
  light: "--background: oklch(1 0 0); --radius: 0.45rem;",
  dark: "--background: oklch(0.145 0 0); --radius: 0.45rem;",
};

const importedNotice =
  "Theme imported. Bearing uses its colours and corner radius.";

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

test("a decoded preset says Bearing uses its colours and corner radius", () => {
  assert.equal(imported().notice, importedNotice);
  assert.equal(importNotice("b1sACkXE8"), importedNotice);
  assert.equal(importNotice(null), null);
  assert.equal(importNotice(""), null);
});

test("a second import replaces the code and both variable sets", () => {
  const first = imported();
  const second = takeImport(first.account, "b1D0dxoG", other);
  assert.equal(second.error, null);
  assert.equal(second.account.code, "b1D0dxoG");
  assert.equal(second.account.light, other.light);
  assert.equal(second.account.dark, other.dark);
  assert.equal(second.notice, importedNotice);
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

test("stored variables are custom properties, not injected CSS", () => {
  assert.equal(
    sanitizeBlock(
      "--background: oklch(1 0 0); --primary: url(https://evil.test);",
    ),
    null,
  );
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

test("a plain custom property is kept", () => {
  assert.notEqual(sanitizeBlock("--x: red"), null);
});

test("a property that is not a custom property is rejected", () => {
  assert.equal(sanitizeBlock("color: red"), null);
});

test("a url value is rejected", () => {
  assert.equal(sanitizeBlock("--x: url(//evil.test/a.png)"), null);
});

test("an important flag is rejected", () => {
  assert.equal(sanitizeBlock("--x: red !important"), null);
});

test("an old preset code and a create link that carries one are rejected", () => {
  assert.equal(readPreset("abc123"), null);
  assert.equal(
    readPreset("https://ui.shadcn.com/create?preset=abc123"),
    null,
  );
});

test("a b-prefixed string that isn't a preset code is rejected", () => {
  assert.equal(readPreset("bnotapreset"), null);
  assert.equal(
    readPreset("https://ui.shadcn.com/create?preset=bnotapreset"),
    null,
  );
  assert.equal(readPreset("b1sACkXE8"), "b1sACkXE8");
});

test("a preset input longer than 512 characters is rejected", () => {
  assert.equal(maxPresetInputLength, 512);
  assert.equal(readPreset("b".repeat(513)), null);
});

test("a stored block longer than 8192 characters is rejected", () => {
  assert.equal(maxStoredThemeLength, 8192);
  const piece = "--x: red; ";
  const body = piece.repeat(
    Math.ceil((maxStoredThemeLength + 1) / piece.length),
  );
  assert.ok(body.length > maxStoredThemeLength);
  assert.equal(sanitizeBlock(body), null);
});
