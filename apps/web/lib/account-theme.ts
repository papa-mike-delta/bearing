import { decodePreset, isPresetCode } from "shadcn/preset";

// The Account's theme. "grayscale" is the shared default. "imported" paints
// the stored variables for that Account only.
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

// What the Account page says after a successful import. A preset can ask for
// a different style, type, or icons; theme-only apply does not change those.
export function importNotice(code: string | null) {
  if (!code || !decodePreset(code)) return null;
  const parts = ignoredParts(code);
  if (parts.length === 0) return "Theme imported.";
  const verb = parts.length === 1 ? "was" : "were";
  return `Colors, radius, charts, and menu colors were applied. The theme's ${join(parts)} ${verb} not applied.`;
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

// The declarations to put on this Account's document, or null to keep the
// shared theme. Re-checks the stored text so a bad row cannot inject CSS.
export function themeCss(account: AccountTheme) {
  if (account.choice !== "imported") return null;
  const light = sanitizeBlock(account.light);
  const dark = sanitizeBlock(account.dark);
  if (!light || !dark) return null;
  return `:root{${light}}.dark{${dark}}`;
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

function ignoredParts(code: string) {
  const decoded = decodePreset(code);
  if (!decoded) return [];
  const parts: string[] = [];
  if (decoded.style !== "mira") parts.push("style");
  if (decoded.font !== "geist" || decoded.fontHeading !== "inherit") {
    parts.push("type");
  }
  if (decoded.iconLibrary !== "lucide") parts.push("icons");
  return parts;
}

function join(parts: string[]) {
  if (parts.length <= 1) return parts[0] ?? "";
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
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
