import assert from "node:assert/strict";
import { test } from "node:test";
import { encodePreset } from "shadcn/preset";
import { expandPreset } from "./expand-preset.ts";
import {
  builtInThemes,
  defaultAccountTheme,
  importError,
  importNotice,
  isBuiltInThemeId,
  maxPresetInputLength,
  maxStoredThemeLength,
  readPreset,
  sanitizeBlock,
  takeImport,
  themeChoices,
  themeCss,
  themeDeclarations,
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

test("an import without variables paints grayscale, not the old blue", () => {
  const broken: AccountTheme = {
    choice: "imported",
    code: "b1sACkXE8",
    light: null,
    dark: null,
  };
  const gray = themeDeclarations(defaultAccountTheme, "light");
  assert.equal(themeDeclarations(broken, "light"), gray);
  assert.match(themeCss(defaultAccountTheme) ?? "", /^:root\{/);
  assert.doesNotMatch(themeCss(defaultAccountTheme) ?? "", /#2f5fd0/);
});

test("stored variables are custom properties, not injected CSS", () => {
  assert.equal(
    sanitizeBlock(
      "--background: oklch(1 0 0); --primary: url(https://evil.test);",
    ),
    null,
  );
  const dirty = themeCss({
    choice: "imported",
    code: "b1sACkXE8",
    light: "--background: oklch(1 0 0); --x: </style>",
    dark: "--background: oklch(0.145 0 0);",
  });
  assert.equal(dirty, themeCss(defaultAccountTheme));
  assert.doesNotMatch(dirty ?? "", /<\/style>|url\(/);
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

// Neutral, not gray: the theme service rejects base color gray, so grayscale
// paints this achromatic preset (same kit, small radius, chroma 0).
const achromatic = encodePreset({
  menuColor: "default",
  menuAccent: "subtle",
  radius: "small",
  font: "geist",
  iconLibrary: "lucide",
  style: "mira",
  fontHeading: "inherit",
  theme: "neutral",
  baseColor: "neutral",
  chartColor: "neutral",
});

test("the account lists the six themes by the names on the spec, and no import it never had", () => {
  assert.deepEqual(
    builtInThemes.map((theme) => [theme.id, theme.name, theme.code]),
    [
      ["grayscale", "grayscale", "bxIOtxcO"],
      ["navy", "navy", "b1ZzrZeXA"],
      ["phthalo", "phthalo", "b5de5C2oi"],
      ["old-gold", "old gold", "b1GdgzJaa"],
      ["royal-purple", "royal purple", "b4ODOqh2O"],
      ["maroon", "maroon", "b50vk1MvY"],
    ],
  );
  const choices = themeChoices(defaultAccountTheme);
  assert.deepEqual(
    choices.map((choice) => [choice.id, choice.name]),
    [
      ["grayscale", "grayscale"],
      ["navy", "navy"],
      ["phthalo", "phthalo"],
      ["old-gold", "old gold"],
      ["royal-purple", "royal purple"],
      ["maroon", "maroon"],
    ],
  );
  assert.equal(choices.find((choice) => choice.id === "grayscale")?.selected, true);
  assert.equal(choices.some((choice) => choice.id === "imported"), false);
});

test("each built-in paints its own light and its own dark", () => {
  const seen = new Set<string>();
  for (const theme of builtInThemes) {
    const chosen = { ...defaultAccountTheme, choice: theme.id };
    const light = themeDeclarations(chosen, "light");
    const dark = themeDeclarations(chosen, "dark");
    assert.notEqual(light, dark, theme.id);
    const direct = expandPreset(theme.code);
    if (direct) {
      assert.equal(light, direct.light, theme.id);
      assert.equal(dark, direct.dark, theme.id);
    } else {
      assert.equal(theme.id, "grayscale");
      const paint = expandPreset(achromatic);
      assert.ok(paint, "neutral preset expands");
      assert.equal(light, paint.light);
      assert.equal(dark, paint.dark);
    }
    assert.equal(seen.has(light), false, theme.id);
    seen.add(light);
  }
});

test("a missing choice paints grayscale", () => {
  const gray = themeDeclarations(defaultAccountTheme, "dark");
  assert.equal(
    themeDeclarations(
      { choice: "nope", code: null, light: null, dark: null },
      "dark",
    ),
    gray,
  );
});

test("a built-in paints over a stored import, and imported paints it again", () => {
  const imported = takeImport(
    defaultAccountTheme,
    "b1sACkXE8",
    fuchsia,
  ).account;
  const navy = { ...imported, choice: "navy" };
  assert.equal(
    themeDeclarations(navy, "light"),
    expandPreset("b1ZzrZeXA")?.light,
  );
  assert.notEqual(
    themeDeclarations(navy, "dark"),
    themeDeclarations(navy, "light"),
  );
  const back = { ...navy, choice: "imported" };
  assert.equal(themeDeclarations(back, "light"), imported.light);
  assert.equal(themeDeclarations(back, "dark"), imported.dark);
  const whileNavy = themeChoices(navy);
  assert.equal(whileNavy.find((choice) => choice.id === "imported")?.name, "Imported");
  assert.equal(whileNavy.find((choice) => choice.id === "imported")?.selected, false);
  assert.equal(whileNavy.find((choice) => choice.id === "navy")?.selected, true);
  assert.equal(
    themeChoices(back).find((choice) => choice.id === "imported")?.selected,
    true,
  );
});

test("miscased ids and display names are not built-in ids", () => {
  const gray = themeDeclarations(defaultAccountTheme, "dark");
  for (const id of ["Navy", "OLD-GOLD", "old gold"]) {
    assert.equal(isBuiltInThemeId(id), false, id);
    assert.equal(
      themeDeclarations(
        { choice: id, code: null, light: null, dark: null },
        "dark",
      ),
      gray,
      id,
    );
  }
  assert.equal(isBuiltInThemeId("navy"), true);
  assert.equal(isBuiltInThemeId("old-gold"), true);
  assert.equal(isBuiltInThemeId("imported"), false);
});

