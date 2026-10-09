// Preset codes expand to light and dark custom properties for one Account.
//
// shadcn-themes.json is a snapshot of the pinned shadcn CLI's theme endpoint,
// produced by apps/web/scripts/generate-shadcn-themes.ts. Regenerate it with
// `npm run themes:generate -w web` after bumping shadcn. A request only
// decodes the code and reads this table. It does not run a CLI, spawn a
// child process, or call the network.

import { decodePreset } from "shadcn/preset";
import table from "./shadcn-themes.json" with { type: "json" };
import { sanitizeBlock } from "./sanitize-block.ts";
import {
  presetInput,
  renderDeclarations,
  themeVars as composeThemeVars,
  type ThemeInput,
  type ThemeTable,
} from "./theme-vars.ts";

const themes = table as ThemeTable;

// Light and dark custom properties for a decoded preset, or null when this
// table has no such base, theme, chart, radius, or menu accent.
export function themeVars(config: ThemeInput) {
  return composeThemeVars(config, themes);
}

// The preset's variables, already passed through sanitizeBlock.
// Unknown combinations, and codes decodePreset rejects, expand to null.
// Never throws.
export function expandPreset(code: string) {
  // Non-canonical codes are kept: the init server accepts them and returns the decoded preset.
  try {
    const config = decodePreset(code);
    if (!config) return null;
    const vars = themeVars(presetInput(config));
    if (!vars) return null;
    const light = sanitizeBlock(renderDeclarations(vars.light));
    const dark = sanitizeBlock(renderDeclarations(vars.dark));
    if (!light || !dark) return null;
    return { light, dark };
  } catch {
    return null;
  }
}
