import { decodePreset, isPresetCode } from "shadcn/preset";
import { expandPreset } from "./expand-preset.ts";

// The Account's theme. One of the six built-in names, or "imported".
// "grayscale" is the default. An import's variables stay on the row when a
// built-in is chosen, so the import can be restored.
export type AccountTheme = {
  choice: string;
  code: string | null;
  light: string | null;
  dark: string | null;
};

export const defaultAccountTheme: AccountTheme = {
  choice: "grayscale",
  code: null,
  light: null,
  dark: null,
};

// Names and codes from the spec. Grayscale's code uses base color gray,
// which the theme service no longer serves.
export const builtInThemes = [
  { name: "grayscale", code: "bxIOtxcO" },
  { name: "navy", code: "b1ZzrZeXA" },
  { name: "phthalo", code: "b5de5C2oi" },
  { name: "old gold", code: "b1GdgzJaa" },
  { name: "royal purple", code: "b4ODOqh2O" },
  { name: "maroon", code: "b50vk1MvY" },
] as const;

// Same kit as the six (Mira, Geist, Lucide, small radius), neutral instead
// of gray. Used only while bxIOtxcO does not expand. Chroma 0, so it is not
// one of the colored five and not the old blue.
const achromatic = "b1D0dxoG";

// The paste box, and the variable block stored on the user row.
export const maxPresetInputLength = 512;
export const maxStoredThemeLength = 8192;

const errors: Record<string, string> = {
  theme: "That isn't a theme link or a preset code.",
  "theme-failed": "The theme couldn't be imported. Nothing was changed.",
};

export function importError(key: string | undefined) {
  return key && Object.hasOwn(errors, key) ? errors[key]! : null;
}

// What the Account page says after a successful import. Only the colour
// custom properties and --radius are applied.
export function importNotice(code: string | null) {
  if (!code || !decodePreset(code)) return null;
  return "Theme imported. Bearing uses its colours and corner radius.";
}

export function takeImport(
  account: AccountTheme,
  input: string,
  blocks: { light: string; dark: string } | null,
) {
  const code = readPreset(input);
  if (!code) return { account, error: "rejected" as const, notice: null };
  const light = sanitizeBlock(blocks?.light);
  const dark = sanitizeBlock(blocks?.dark);
  if (!light || !dark) {
    return { account, error: "failed" as const, notice: null };
  }
  return {
    account: { choice: "imported", code, light, dark },
    error: null,
    notice: importNotice(code),
  };
}

// The declarations to put on this Account's document. A built-in is painted
// from its preset. An import is painted from the stored blocks. A missing
// choice, or an import with no usable blocks, paints grayscale.
export function themeDeclarations(
  account: AccountTheme,
  scheme: "light" | "dark",
) {
  return resolved(account)[scheme];
}

export function themeCss(account: AccountTheme) {
  const light = themeDeclarations(account, "light");
  const dark = themeDeclarations(account, "dark");
  if (!light || !dark) return null;
  return `:root{${light}}.dark{${dark}}`;
}

export function themeChoices(account: AccountTheme) {
  const choices: { id: string; name: string; selected: boolean }[] =
    builtInThemes.map((theme) => ({
      id: theme.name,
      name: theme.name,
      selected: account.choice === theme.name,
    }));
  if (account.code) {
    choices.push({
      id: "imported",
      name: "Imported",
      selected: account.choice === "imported",
    });
  }
  return choices;
}

// A known built-in, or the stored import. Anything else leaves the Account
// as it was. Choosing a built-in does not clear the import.
export function chooseTheme(account: AccountTheme, name: string) {
  if (name === "imported") {
    if (!account.code) return { account, error: "rejected" as const };
    if (account.choice === "imported") return { account, error: null };
    return {
      account: { ...account, choice: "imported" },
      error: null,
    };
  }
  if (!builtInThemes.some((theme) => theme.name === name)) {
    return { account, error: "rejected" as const };
  }
  if (account.choice === name) return { account, error: null };
  return { account: { ...account, choice: name }, error: null };
}

function resolved(account: AccountTheme) {
  if (account.choice === "imported") {
    const light = sanitizeBlock(account.light);
    const dark = sanitizeBlock(account.dark);
    if (light && dark) return { light, dark };
  }
  const name = builtInThemes.some((theme) => theme.name === account.choice)
    ? account.choice
    : "grayscale";
  return blocksFor(name) ?? blocksFor("grayscale") ?? { light: "", dark: "" };
}

function blocksFor(name: string) {
  const theme = builtInThemes.find((item) => item.name === name);
  if (!theme) return null;
  const direct = expandPreset(theme.code);
  if (direct) return direct;
  if (name !== "grayscale") return null;
  return expandPreset(achromatic);
}

// Current-format codes start with "b". Older "a…" codes still decode, and are
// refused. decodePreset accepts almost any "b…" string, so isPresetCode does
// the real check. The import then checks that the code expands.
const currentPresetCode = /^b[0-9A-Za-z]+$/;

function acceptedPreset(code: string) {
  if (!currentPresetCode.test(code) || !isPresetCode(code)) return null;
  return code;
}

export function readPreset(input: string) {
  if (input.length > maxPresetInputLength) return null;
  const text = input.trim();
  if (!text || /[{}<>]/.test(text) || text.includes("--")) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(text) || text.startsWith("//")) {
    let url: URL;
    try {
      url = new URL(text);
    } catch {
      return null;
    }
    if (url.protocol !== "https:" || url.hostname !== "ui.shadcn.com") {
      return null;
    }
    if (url.pathname !== "/create") return null;
    const preset = url.searchParams.get("preset");
    if (!preset) return null;
    return acceptedPreset(preset);
  }
  if (text.includes("/") || /\s/.test(text)) return null;
  return acceptedPreset(text);
}

const name = /^--[a-z0-9-]+$/i;
const value = /^[a-z0-9.%()/,+\s-]+$/i;

export function sanitizeBlock(body: string | null | undefined) {
  if (!body || body.length > maxStoredThemeLength) return null;
  if (/[{}<>]|url\s*\(|expression\s*\(|@import|<\/|["'`\\]/i.test(body)) {
    return null;
  }
  const decls = body
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);
  if (decls.length === 0) return null;
  const out: string[] = [];
  for (const decl of decls) {
    const splitAt = decl.indexOf(":");
    if (splitAt === -1) return null;
    const property = decl.slice(0, splitAt).trim();
    const propertyValue = decl.slice(splitAt + 1).trim();
    if (!name.test(property) || !value.test(propertyValue)) return null;
    out.push(`${property}: ${propertyValue}`);
  }
  return `${out.join("; ")};`;
}
