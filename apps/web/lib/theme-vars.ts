// Composes a preset's light and dark custom properties from the generated
// shadcn theme table. No disk, network, or process access: the caller passes
// the table in.

import { V1_CHART_COLOR_MAP } from "shadcn/preset";

export type VarMap = Record<string, string>;

export type ThemeModes = {
  light: VarMap;
  dark: VarMap;
};

export type ThemeTable = {
  bases: Record<string, ThemeModes>;
  themes: Record<string, ThemeModes>;
  // chart-1..5 for one chart color. The same values on every base that allows it.
  charts: Record<string, ThemeModes>;
  // Chart color names the init server accepts for each baseColor.
  chartColors: Record<string, string[]>;
  radii: Record<string, string>;
};

// The fields of a decoded preset that change variables. Other preset fields
// are ignored because the theme endpoint ignores them.
// A present chartColor, including "neutral", selects that chart palette.
// An omitted chartColor means the theme's own charts (no chart override).
export type ThemeInput = {
  baseColor?: string;
  theme?: string;
  chartColor?: string;
  radius?: string;
  menuAccent?: string;
};

// encodePreset always writes a chartColor, so it cannot mint an old code.
// Old "a" codes omit chartColor. With preset=<code> the init server fills
// that gap from V1_CHART_COLOR_MAP[theme] ?? theme — not the neutral palette,
// and not "charts follow the theme" (that is the no-preset response, which
// themeVars produces when chartColor is omitted).
export function presetInput(config: ThemeInput): ThemeInput {
  if (config.chartColor !== undefined) return config;
  const theme = config.theme;
  if (!theme) return config;
  return { ...config, chartColor: V1_CHART_COLOR_MAP[theme] ?? theme };
}

export type ThemeVarList = {
  light: [string, string][];
  dark: [string, string][];
};

export function themeVars(
  config: ThemeInput,
  table: ThemeTable,
): ThemeVarList | null {
  const baseColor = config.baseColor;
  const themeName = config.theme;
  if (!baseColor || !themeName) return null;

  const base = own(table.bases, baseColor);
  const theme = own(table.themes, `${baseColor}/${themeName}`);
  if (!base || !theme) return null;

  const radiusName = config.radius ?? "default";
  const radius = own(table.radii, radiusName);
  if (typeof radius !== "string" || radius.length === 0) return null;

  const menuAccent = config.menuAccent ?? "subtle";
  if (menuAccent !== "subtle" && menuAccent !== "bold") return null;

  const chartColor = config.chartColor;
  let charts: ThemeModes | undefined;
  if (chartColor !== undefined) {
    const allowed = own(table.chartColors, baseColor);
    if (!allowed?.includes(chartColor)) return null;
    charts = own(table.charts, chartColor);
    if (!charts) return null;
  }

  const light = compose(
    base.light,
    theme.light,
    charts?.light,
    radius,
    menuAccent === "bold",
  );
  const dark = compose(
    base.dark,
    theme.dark,
    charts?.dark,
    null,
    menuAccent === "bold",
  );
  if (!light || !dark) return null;
  return { light, dark };
}

// `--key: value; --key: value;` in the table's declaration order.
export function renderDeclarations(entries: [string, string][]) {
  return `${entries.map(([key, value]) => `--${key}: ${value}`).join("; ")};`;
}

function compose(
  base: VarMap,
  diff: VarMap,
  charts: VarMap | undefined,
  radius: string | null,
  bold: boolean,
) {
  const entries: [string, string][] = Object.entries(base);
  const index = new Map(entries.map(([key], at) => [key, at]));

  const set = (key: string, value: string) => {
    const at = index.get(key);
    if (at === undefined) return false;
    entries[at] = [key, value];
    return true;
  };

  for (const [key, value] of Object.entries(diff)) {
    if (!set(key, value)) return null;
  }
  if (charts) {
    for (const [key, value] of Object.entries(charts)) {
      if (!set(key, value)) return null;
    }
  }
  if (radius !== null && !set("radius", radius)) return null;
  if (bold) {
    const primary = readEntry(entries, index.get("primary"));
    const primaryForeground = readEntry(
      entries,
      index.get("primary-foreground"),
    );
    if (primary === null || primaryForeground === null) return null;
    if (!set("accent", primary) || !set("accent-foreground", primaryForeground)) {
      return null;
    }
  }
  return entries;
}

function readEntry(entries: [string, string][], at: number | undefined) {
  if (at === undefined) return null;
  return entries[at]?.[1] ?? null;
}

function own<T>(record: Record<string, T>, key: string) {
  if (!Object.hasOwn(record, key)) return undefined;
  return record[key];
}
