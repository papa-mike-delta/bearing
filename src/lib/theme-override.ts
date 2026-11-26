import postcss from "postcss";
import { ThemeCatalog, type CreateSelection } from "./theme-catalog";

export type ThemeVariables = {
  light: Record<string, string>;
  dark: Record<string, string>;
};

const VALUE_FUNCTIONS = new Set([
  "oklch", "oklab", "lch", "lab", "rgb", "rgba", "hsl", "hsla", "hwb",
  "color", "color-mix", "var", "calc", "min", "max", "clamp", "light-dark",
  "radial-gradient",
]);


export class ThemeOverride {
  static async parse(input: string): Promise<ThemeVariables> {
    if (typeof input !== "string" || !input.trim() || input.length > 100_000) {
      throw new Error("Provide a theme URL, CSS, or JSON (up to 100 KB).");
    }
    input = input.trim();
    if (/^preset:/i.test(input)) {
      return ThemeOverride.parse(ThemeCatalog.importInput(input.slice(7).trim().toLowerCase()));
    }
    let createUrl: URL | undefined;
    if (/^[a-z][a-z0-9+.-]*:/i.test(input)) {
      const url = new URL(input);
      if (url.origin !== "https://ui.shadcn.com" || url.username || url.password ||
          !["/create", "/create/", "/init", "/init/"].includes(url.pathname)) {
        throw new Error("Use an HTTPS theme URL from ui.shadcn.com/create.");
      }
      url.pathname = "/init";
      url.hash = "";
      // The builder fills these in interactively; the export endpoint requires them.
      const defaults = { base: "radix", style: "nova", baseColor: "neutral", theme: "neutral", iconLibrary: "lucide", font: "geist", radius: "default", menuAccent: "subtle", menuColor: "default" };
      for (const [name, value] of Object.entries(defaults)) {
        if (!url.searchParams.has(name)) url.searchParams.set(name, value);
      }
      createUrl = url;
      const response = await fetch(url.toString(), { redirect: "error", signal: AbortSignal.timeout(10_000) });
      if (!response.ok) throw new Error(`Theme export failed (${response.status}).`);
      input = (await response.text()).trim();
      if (!input.startsWith("{") || input.length > 100_000) throw new Error("Expected a shadcn JSON theme export.");
    }
    if (input.startsWith("{") || input.startsWith("[") || input === "null") {
      const data = JSON.parse(input);
      const variables = data?.cssVars ?? data;
      const normalize = (map: unknown): Record<string, string> => {
        if (!map || typeof map !== "object" || Array.isArray(map)) throw new Error("Expected a variable map.");
        return Object.fromEntries(Object.entries(map).map(([name, value]) => [name.startsWith("--") ? name : `--${name}`, value]));
      };
      const shared = variables?.theme === undefined ? {} : normalize(variables.theme);
      const parsed = ThemeOverride.validate({
        light: { ...shared, ...normalize(variables?.light) },
        dark: { ...shared, ...normalize(variables?.dark) },
      });
      if (createUrl) return ThemeOverride.tune(parsed, createUrl);
      const selection = ThemeOverride.selectionFromExport(data);
      return selection ? ThemeOverride.applySelection(parsed, selection) : parsed;
    }
    const theme: ThemeVariables = { light: {}, dark: {} };
    const shared: Record<string, string> = {};
    const root = postcss.parse(input);
    for (const node of root.nodes) {
      const target = node.type === "rule"
        ? node.selector === ":root" ? theme.light : node.selector === ".dark" ? theme.dark : null
        : node.type === "atrule" && node.name === "theme" && ["", "inline"].includes(node.params) ? shared : null;
      if (!target) continue;
      for (const declaration of ("nodes" in node ? node.nodes : []) ?? []) {
        if (declaration.type === "comment") continue;
        if (declaration.type !== "decl" || !declaration.prop.startsWith("--") || declaration.important) {
          throw new Error("Theme blocks may contain only CSS custom properties.");
        }
        target[declaration.prop] = declaration.value;
      }
    }
    ThemeOverride.validate(theme);
    const parsed = ThemeOverride.validate({ light: { ...shared, ...theme.light }, dark: { ...shared, ...theme.dark } });
    return createUrl ? ThemeOverride.tune(parsed, createUrl) : parsed;
  }

  /** Read base/style/icon/font from a pasted /init payload. Live cssVars do not include them. */
  static selectionFromExport(data: { config?: { style?: unknown; iconLibrary?: unknown; menuColor?: unknown; rtl?: unknown }; registryDependencies?: unknown }): CreateSelection | undefined {
    const config = data?.config;
    if (!config || typeof config.style !== "string") return undefined;
    const [base, ...styleParts] = config.style.split("-");
    const style = styleParts.join("-");
    const dependencies = Array.isArray(data.registryDependencies) ? data.registryDependencies.filter((item): item is string => typeof item === "string") : [];
    const font = dependencies.find((item) => item.startsWith("font-") && !item.startsWith("font-heading-"))?.slice(5) ?? "geist";
    const heading = dependencies.find((item) => item.startsWith("font-heading-"))?.slice("font-heading-".length) ?? "inherit";
    return ThemeOverride.checkedSelection({
      base,
      style,
      baseColor: "neutral",
      theme: "neutral",
      chartColor: "neutral",
      iconLibrary: typeof config.iconLibrary === "string" ? config.iconLibrary : "lucide",
      font,
      fontHeading: heading,
      radius: "default",
      menuAccent: "subtle",
      menuColor: typeof config.menuColor === "string" ? config.menuColor : "default",
      rtl: config.rtl === true,
      pointer: false,
    });
  }

  static checkedSelection(selection: CreateSelection): CreateSelection {
    const pick = (key: keyof typeof ThemeCatalog.options, value: string) => {
      const allowed = ThemeCatalog.options[key] as readonly string[];
      if (!allowed.includes(value)) throw new Error(`Unknown ${key}: ${value}`);
      return value;
    };
    const fontHeading = selection.fontHeading || "inherit";
    if (fontHeading !== "inherit" && !(ThemeCatalog.options.font as readonly string[]).includes(fontHeading)) {
      throw new Error(`Unknown fontHeading: ${fontHeading}`);
    }
    if (!ThemeCatalog.options.menuColor.includes(selection.menuColor as typeof ThemeCatalog.options.menuColor[number])) {
      throw new Error(`Unknown menuColor: ${selection.menuColor}`);
    }
    return {
      ...selection,
      base: pick("base", selection.base),
      style: pick("style", selection.style),
      iconLibrary: pick("iconLibrary", selection.iconLibrary),
      font: pick("font", selection.font),
      fontHeading,
      menuColor: selection.menuColor,
    };
  }

  /** Fold create options that the export omits into the same override variables. */
  static tune(theme: ThemeVariables, url: URL): ThemeVariables {
    const pick = (key: keyof typeof ThemeCatalog.options, value: string | null, fallback: string) => {
      const allowed = ThemeCatalog.options[key] as readonly string[];
      const next = value && allowed.includes(value) ? value : fallback;
      if (value && !allowed.includes(value)) throw new Error(`Unknown ${key}: ${value}`);
      return next;
    };
    const fontHeading = url.searchParams.get("fontHeading") || "inherit";
    return ThemeOverride.applySelection(theme, {
      ...ThemeCatalog.defaults(),
      base: pick("base", url.searchParams.get("base"), "radix"),
      style: pick("style", url.searchParams.get("style"), "nova"),
      iconLibrary: pick("iconLibrary", url.searchParams.get("iconLibrary"), "lucide"),
      font: pick("font", url.searchParams.get("font"), "geist"),
      fontHeading: fontHeading === "inherit" || (ThemeCatalog.options.font as readonly string[]).includes(fontHeading) ? fontHeading : (() => { throw new Error(`Unknown fontHeading: ${fontHeading}`); })(),
      radius: pick("radius", url.searchParams.get("radius"), "default"),
      menuAccent: pick("menuAccent", url.searchParams.get("menuAccent"), "subtle"),
      menuColor: pick("menuColor", url.searchParams.get("menuColor"), "default"),
      rtl: url.searchParams.get("rtl") === "true",
      pointer: url.searchParams.get("pointer") === "true",
    });
  }

  static applySelection(theme: ThemeVariables, selection: CreateSelection): ThemeVariables {
    const font = ThemeCatalog.fontStack(selection.font);
    const headingName = selection.fontHeading === "inherit" ? selection.font : selection.fontHeading;
    const heading = ThemeCatalog.fontStack(headingName);
    const menu = selection.menuColor;
    const meta: Record<string, string> = {
      "--font-sans": font,
      "--font-heading": heading,
      "--direction": selection.rtl ? "rtl" : "ltr",
      "--pointer": selection.pointer ? "pointer" : "default",
      "--bearing-base": selection.base,
      "--bearing-style": selection.style,
      "--bearing-icon": selection.iconLibrary,
      "--bearing-font": selection.font,
      "--bearing-font-heading": selection.fontHeading || "inherit",
    };
    const bodyFace = ThemeCatalog.fontFamily(selection.font);
    const headingFace = ThemeCatalog.fontFamily(headingName);
    if (bodyFace) meta["--bearing-font-family"] = bodyFace;
    if (headingFace) meta["--bearing-heading-family"] = headingFace;
    const next: ThemeVariables = {
      light: { ...theme.light, ...meta },
      dark: { ...theme.dark, ...meta },
    };
    if (menu === "inverted" || menu === "inverted-translucent") {
      const lightSidebar = theme.dark["--sidebar"] ?? theme.dark["--background"];
      const darkSidebar = theme.light["--sidebar"] ?? theme.light["--background"];
      const lightFg = theme.dark["--sidebar-foreground"] ?? theme.dark["--foreground"];
      const darkFg = theme.light["--sidebar-foreground"] ?? theme.light["--foreground"];
      if (lightSidebar && darkSidebar && lightFg && darkFg) {
        next.light["--sidebar"] = lightSidebar;
        next.light["--sidebar-foreground"] = lightFg;
        next.dark["--sidebar"] = darkSidebar;
        next.dark["--sidebar-foreground"] = darkFg;
      }
    }
    if (menu.endsWith("translucent")) {
      for (const mode of ["light", "dark"] as const) {
        const sidebar = next[mode]["--sidebar"];
        if (sidebar) next[mode]["--sidebar"] = `color-mix(in oklch, ${sidebar} 72%, transparent)`;
      }
    }
    return ThemeOverride.validate(next);
  }

  static validate(theme: ThemeVariables): ThemeVariables {
    for (const variables of [theme.light, theme.dark]) {
      if (!variables || typeof variables !== "object" || Array.isArray(variables) || !Object.keys(variables).length) {
        throw new Error("Include non-empty light and dark variable maps.");
      }
      for (const [name, value] of Object.entries(variables)) {
        if (!/^--[a-zA-Z][a-zA-Z0-9-]*$/.test(name)) throw new Error(`Invalid custom property: ${name}`);
        if (typeof value !== "string" || !value.trim() || value.length > 2000 ||
            !/^[a-zA-Z0-9\s#%.,()+*/'"_-]+$/.test(value) || /\/\*|\*\//.test(value)) {
          throw new Error(`Invalid value for ${name}`);
        }
        const allowedMeta: Record<string, readonly string[]> = {
          "--bearing-base": ThemeCatalog.options.base,
          "--bearing-style": ThemeCatalog.options.style,
          "--bearing-icon": ThemeCatalog.options.iconLibrary,
          "--bearing-font": ThemeCatalog.options.font,
          "--bearing-font-heading": ["inherit", ...ThemeCatalog.options.font],
        };
        if (allowedMeta[name] && !allowedMeta[name].includes(value)) throw new Error(`Unknown value for ${name}`);
        for (const match of value.matchAll(/([a-zA-Z_-][a-zA-Z0-9_-]*)\s*\(/g)) {
          if (!VALUE_FUNCTIONS.has(match[1].toLowerCase())) throw new Error(`Unsupported CSS function in ${name}`);
        }
        // Check balanced strings and functions as well as the restricted token set.
        postcss.parse(`:root { ${name}: ${value}; }`);
      }
    }
    return theme;
  }

  static serialize(theme: ThemeVariables): string {
    ThemeOverride.validate(theme);
    return ([ [":root", theme.light], [".dark", theme.dark] ] as const)
      .map(([selector, variables]) => `${selector} {\n${Object.entries(variables)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, value]) => `  ${name}: ${value};`).join("\n")}\n}`)
      .join("\n\n") + "\n";
  }
}
