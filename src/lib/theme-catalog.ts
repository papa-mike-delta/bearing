/** Live ui.shadcn.com/create enums. Theme lists the base neutrals plus the expanded accent set. */
export type ThemeVariables = {
  light: Record<string, string>;
  dark: Record<string, string>;
};

export type CreateSelection = {
  base: string;
  style: string;
  baseColor: string;
  theme: string;
  chartColor: string;
  iconLibrary: string;
  font: string;
  fontHeading: string;
  radius: string;
  menuAccent: string;
  menuColor: string;
  rtl: boolean;
  pointer: boolean;
};

export type ThemePreset = {
  id: string;
  title: string;
  detail: string;
  swatch: string;
  selection?: CreateSelection;
  variables?: ThemeVariables;
};

/** Family names match the live shadcn font registry. Geist stays on next/font. */
const fontFaces: Record<string, { family: string; fallback: string }> = {
  geist: { family: "var(--font-geist-sans)", fallback: "sans-serif" },
  inter: { family: '"Inter Variable"', fallback: "var(--font-geist-sans), sans-serif" },
  "noto-sans": { family: '"Noto Sans Variable"', fallback: "var(--font-geist-sans), sans-serif" },
  "nunito-sans": { family: '"Nunito Sans Variable"', fallback: "var(--font-geist-sans), sans-serif" },
  figtree: { family: '"Figtree Variable"', fallback: "var(--font-geist-sans), sans-serif" },
  roboto: { family: '"Roboto Variable"', fallback: "var(--font-geist-sans), sans-serif" },
  raleway: { family: '"Raleway Variable"', fallback: "var(--font-geist-sans), sans-serif" },
  "dm-sans": { family: '"DM Sans Variable"', fallback: "var(--font-geist-sans), sans-serif" },
  "public-sans": { family: '"Public Sans Variable"', fallback: "var(--font-geist-sans), sans-serif" },
  outfit: { family: '"Outfit Variable"', fallback: "var(--font-geist-sans), sans-serif" },
  oxanium: { family: '"Oxanium Variable"', fallback: "var(--font-geist-sans), sans-serif" },
  manrope: { family: '"Manrope Variable"', fallback: "var(--font-geist-sans), sans-serif" },
  "space-grotesk": { family: '"Space Grotesk Variable"', fallback: "var(--font-geist-sans), sans-serif" },
  montserrat: { family: '"Montserrat Variable"', fallback: "var(--font-geist-sans), sans-serif" },
  "ibm-plex-sans": { family: '"IBM Plex Sans Variable"', fallback: "var(--font-geist-sans), sans-serif" },
  "source-sans-3": { family: '"Source Sans 3 Variable"', fallback: "var(--font-geist-sans), sans-serif" },
  "instrument-sans": { family: '"Instrument Sans Variable"', fallback: "var(--font-geist-sans), sans-serif" },
  "jetbrains-mono": { family: '"JetBrains Mono Variable"', fallback: "var(--font-geist-mono), ui-monospace, monospace" },
  "geist-mono": { family: "var(--font-geist-mono)", fallback: "ui-monospace, monospace" },
  "noto-serif": { family: '"Noto Serif Variable"', fallback: 'Georgia, "Iowan Old Style", Palatino, serif' },
  "roboto-slab": { family: '"Roboto Slab Variable"', fallback: 'Georgia, "Iowan Old Style", Palatino, serif' },
  merriweather: { family: '"Merriweather Variable"', fallback: 'Georgia, "Iowan Old Style", Palatino, serif' },
  lora: { family: '"Lora Variable"', fallback: 'Georgia, "Iowan Old Style", Palatino, serif' },
  "playfair-display": { family: '"Playfair Display Variable"', fallback: 'Georgia, "Iowan Old Style", Palatino, serif' },
  "eb-garamond": { family: '"EB Garamond Variable"', fallback: 'Georgia, "Iowan Old Style", Palatino, serif' },
  "instrument-serif": { family: '"Instrument Serif"', fallback: 'Georgia, "Iowan Old Style", Palatino, serif' },
};

export class ThemeCatalog {
  static readonly options = {
    base: ["radix", "base", "aria"],
    style: ["vega", "nova", "maia", "lyra", "mira", "luma", "sera", "rhea"],
    baseColor: ["neutral", "stone", "zinc", "mauve", "olive", "mist", "taupe"],
    theme: [
      "neutral",
      "stone",
      "zinc",
      "mauve",
      "olive",
      "mist",
      "taupe",
      "amber",
      "blue",
      "cyan",
      "emerald",
      "fuchsia",
      "green",
      "indigo",
      "lime",
      "orange",
      "pink",
      "purple",
      "red",
      "rose",
      "sky",
      "teal",
      "violet",
      "yellow",
    ],
    iconLibrary: ["lucide", "tabler", "hugeicons", "phosphor", "remixicon"],
    font: [
      "geist",
      "inter",
      "noto-sans",
      "nunito-sans",
      "figtree",
      "roboto",
      "raleway",
      "dm-sans",
      "public-sans",
      "outfit",
      "oxanium",
      "manrope",
      "space-grotesk",
      "montserrat",
      "ibm-plex-sans",
      "source-sans-3",
      "instrument-sans",
      "jetbrains-mono",
      "geist-mono",
      "noto-serif",
      "roboto-slab",
      "merriweather",
      "lora",
      "playfair-display",
      "eb-garamond",
      "instrument-serif",
    ],
    radius: ["default", "none", "small", "medium", "large"],
    menuAccent: ["subtle", "bold"],
    menuColor: ["default", "inverted", "default-translucent", "inverted-translucent"],
  } as const;

  static readonly swatches: Record<string, string> = {
    neutral: "#52525b",
    stone: "#78716c",
    zinc: "#71717a",
    mauve: "#8d7b8a",
    olive: "#6b705c",
    mist: "#6e7f88",
    taupe: "#8a7563",
    amber: "#d97706",
    blue: "#2563eb",
    cyan: "#0891b2",
    emerald: "#059669",
    fuchsia: "#c026d3",
    green: "#16a34a",
    indigo: "#4f46e5",
    lime: "#65a30d",
    orange: "#ea580c",
    pink: "#db2777",
    purple: "#9333ea",
    red: "#dc2626",
    rose: "#e11d48",
    sky: "#0284c7",
    teal: "#0f766e",
    violet: "#7c3aed",
    yellow: "#ca8a04",
    bearing: "#f0c779",
  };

  static headingFonts(): readonly string[] {
    return ["inherit", ...ThemeCatalog.options.font];
  }

  static label(value: string): string {
    return value.replaceAll("-", " ").replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
  }

  /**
   * A :root custom property cannot reference --font-geist-sans: that variable is
   * defined on body, and a missing var() makes the whole property invalid.
   * Family names here are quoted literals. Body CSS adds the loaded fallback.
   */
  static fontStack(name: string): string {
    if (name === "geist" || name === "inherit") return "sans-serif";
    if (name === "geist-mono") return "ui-monospace, monospace";
    const face = fontFaces[name] ?? fontFaces.geist;
    const generic = face.fallback.includes("monospace") ? "ui-monospace, monospace" : face.fallback.includes("serif") ? "Georgia, serif" : "sans-serif";
    return `${face.family}, ${generic}`;
  }

  static fontFamily(name: string): string | undefined {
    const family = (fontFaces[name] ?? fontFaces.geist).family;
    return family.startsWith("var(") ? undefined : family;
  }

  static allowedTheme(baseColor: string, theme: string): boolean {
    const bases = ThemeCatalog.options.baseColor as readonly string[];
    return !bases.includes(theme) || theme === baseColor;
  }

  static defaults(): CreateSelection {
    return {
      base: "radix",
      style: "nova",
      baseColor: "neutral",
      theme: "teal",
      chartColor: "amber",
      iconLibrary: "lucide",
      font: "geist",
      fontHeading: "inherit",
      radius: "medium",
      menuAccent: "subtle",
      menuColor: "default",
      rtl: false,
      pointer: false,
    };
  }

  static createUrl(selection: CreateSelection): string {
    const pick = (key: keyof typeof ThemeCatalog.options, value: string) => {
      const allowed = ThemeCatalog.options[key] as readonly string[];
      if (!allowed.includes(value)) throw new Error(`Unknown ${key}: ${value}`);
      return value;
    };
    const fontHeading = selection.fontHeading || "inherit";
    if (fontHeading !== "inherit" && !(ThemeCatalog.options.font as readonly string[]).includes(fontHeading)) {
      throw new Error(`Unknown fontHeading: ${fontHeading}`);
    }
    const baseColor = pick("baseColor", selection.baseColor);
    const theme = pick("theme", selection.theme);
    const chartColor = pick("theme", selection.chartColor || theme);
    if (!ThemeCatalog.allowedTheme(baseColor, theme)) {
      throw new Error(`Theme ${theme} is only available with base color ${theme}.`);
    }
    if (!ThemeCatalog.allowedTheme(baseColor, chartColor)) {
      throw new Error(`Chart color ${chartColor} is only available with base color ${chartColor}.`);
    }
    const url = new URL("https://ui.shadcn.com/create");
    const params: Record<string, string> = {
      base: pick("base", selection.base),
      style: pick("style", selection.style),
      baseColor,
      theme,
      chartColor,
      iconLibrary: pick("iconLibrary", selection.iconLibrary),
      font: pick("font", selection.font),
      radius: pick("radius", selection.radius),
      menuAccent: pick("menuAccent", selection.menuAccent),
      menuColor: pick("menuColor", selection.menuColor),
      rtl: selection.rtl ? "true" : "false",
      pointer: selection.pointer ? "true" : "false",
    };
    if (fontHeading !== "inherit") params.fontHeading = fontHeading;
    for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
    return url.toString();
  }

  static #cached: readonly ThemePreset[] | undefined;

  static get presets(): readonly ThemePreset[] {
    return (ThemeCatalog.#cached ??= ThemeCatalog.assemble());
  }

  static importInput(id: string): string {
    const preset = ThemeCatalog.presets.find((item) => item.id === id);
    if (!preset) throw new Error(`Unknown theme preset: ${id}`);
    if (preset.variables) return JSON.stringify(preset.variables);
    if (!preset.selection) throw new Error(`Unknown theme preset: ${id}`);
    return ThemeCatalog.createUrl(preset.selection);
  }

  private static bearing(): ThemePreset {
    const light = {
      "--background": "#f4efe4",
      "--foreground": "#223b35",
      "--card": "#fffaf0",
      "--card-foreground": "#223b35",
      "--popover": "#fffaf0",
      "--popover-foreground": "#223b35",
      "--primary": "#f0c779",
      "--primary-foreground": "#172c28",
      "--secondary": "#e7efe6",
      "--secondary-foreground": "#223b35",
      "--muted": "#e7efe6",
      "--muted-foreground": "#5a6e65",
      "--accent": "#e1ebe2",
      "--accent-foreground": "#223b35",
      "--destructive": "oklch(0.577 0.245 27.325)",
      "--border": "#d5ddd4",
      "--input": "#d5ddd4",
      "--ring": "#9a7433",
      "--sidebar": "#efe6d4",
      "--sidebar-foreground": "#223b35",
      "--sidebar-primary": "#f0c779",
      "--sidebar-primary-foreground": "#172c28",
      "--sidebar-accent": "#e1ebe2",
      "--sidebar-accent-foreground": "#223b35",
      "--sidebar-border": "#d5ddd4",
      "--sidebar-ring": "#9a7433",
      "--chart-1": "#c4923e",
      "--chart-2": "#486b5c",
      "--chart-3": "#d7a08a",
      "--chart-4": "#7d9a86",
      "--chart-5": "#8a6238",
      "--radius": "0.875rem",
      "--page-mark-bg": "color-mix(in oklab, #f0c779 32%, #fffaf0)",
      "--page-mark-fg": "#6d5424",
      "--font-sans": "var(--font-geist-sans), sans-serif",
      "--font-heading": 'Georgia, "Iowan Old Style", Palatino, serif',
      "--direction": "ltr",
      "--pointer": "default",
      "--field-image": "radial-gradient(ellipse at 100% -8%, #e1ebe2 0, transparent 46%)",
    };
    const dark = {
      "--background": "#101e20",
      "--foreground": "#f5f1e7",
      "--card": "#1b3330",
      "--card-foreground": "#f5f1e7",
      "--popover": "#142523",
      "--popover-foreground": "#f5f1e7",
      "--primary": "#f0c779",
      "--primary-foreground": "#172c28",
      "--secondary": "#243f3a",
      "--secondary-foreground": "#f5f1e7",
      "--muted": "#1c3430",
      "--muted-foreground": "#bac9c5",
      "--accent": "#264b44",
      "--accent-foreground": "#f5f1e7",
      "--destructive": "oklch(0.704 0.191 22.216)",
      "--border": "#ffffff1f",
      "--input": "#ffffff29",
      "--ring": "#f0c779",
      "--sidebar": "#0d191b",
      "--sidebar-foreground": "#f5f1e7",
      "--sidebar-primary": "#f0c779",
      "--sidebar-primary-foreground": "#172c28",
      "--sidebar-accent": "#1c3430",
      "--sidebar-accent-foreground": "#f5f1e7",
      "--sidebar-border": "#ffffff14",
      "--sidebar-ring": "#f0c779",
      "--chart-1": "#f0c779",
      "--chart-2": "#8fb3a4",
      "--chart-3": "#e9bb98",
      "--chart-4": "#f5f1e7",
      "--chart-5": "#6e8f7c",
      "--radius": "0.875rem",
      "--page-mark-bg": "color-mix(in oklab, #f0c779 22%, #1b3330)",
      "--page-mark-fg": "#f0c779",
      "--font-sans": "var(--font-geist-sans), sans-serif",
      "--font-heading": 'Georgia, "Iowan Old Style", Palatino, serif',
      "--direction": "ltr",
      "--pointer": "default",
      "--field-image": "radial-gradient(ellipse 70% 55% at 88% 0%, #2d5c52 0%, transparent 62%), radial-gradient(ellipse 45% 40% at 0% 100%, #1a3c36 0%, transparent 70%)",
    };
    return {
      id: "bearing",
      title: "Bearing",
      detail: "Cream, teal, and amber",
      swatch: ThemeCatalog.swatches.bearing,
      variables: { light, dark },
    };
  }

  private static assemble(): ThemePreset[] {
    const seed = (id: string, title: string, detail: string, selection: Partial<CreateSelection> & Pick<CreateSelection, "style" | "theme">): ThemePreset => {
      const theme = selection.theme;
      const filled: CreateSelection = {
        ...ThemeCatalog.defaults(),
        ...selection,
        chartColor: selection.chartColor ?? theme,
      };
      return { id, title, detail, swatch: ThemeCatalog.swatches[theme] ?? ThemeCatalog.swatches.bearing, selection: filled };
    };
    const styles = [
      seed("vega", "Vega", "Classic neutral", { style: "vega", baseColor: "neutral", theme: "neutral", font: "inter", radius: "medium" }),
      seed("nova", "Nova", "Geist on zinc", { style: "nova", baseColor: "zinc", theme: "zinc", font: "geist", radius: "default" }),
      seed("maia", "Maia", "Soft rose, bold menu", { style: "maia", baseColor: "mauve", theme: "rose", font: "figtree", radius: "large", menuAccent: "bold", menuColor: "inverted", iconLibrary: "hugeicons" }),
      seed("lyra", "Lyra", "Sharp mono", { style: "lyra", base: "base", baseColor: "olive", theme: "green", font: "jetbrains-mono", radius: "none", iconLibrary: "phosphor" }),
      seed("mira", "Mira", "Compact indigo", { style: "mira", base: "aria", baseColor: "mist", theme: "indigo", font: "dm-sans", radius: "small", iconLibrary: "tabler" }),
      seed("luma", "Luma", "Large blue", { style: "luma", baseColor: "neutral", theme: "blue", font: "outfit", radius: "large", iconLibrary: "remixicon" }),
      seed("sera", "Sera", "Editorial taupe", { style: "sera", baseColor: "taupe", theme: "taupe", font: "noto-sans", fontHeading: "playfair-display", radius: "default", menuColor: "default-translucent" }),
      seed("rhea", "Rhea", "Stone and amber", { style: "rhea", baseColor: "stone", theme: "amber", chartColor: "yellow", font: "inter", radius: "medium" }),
    ];
    const used = new Set(styles.map((preset) => preset.selection!.theme));
    const { theme: themes, base, style, font, radius, menuAccent, menuColor, iconLibrary } = ThemeCatalog.options;
    const colors = themes.filter((theme) => !used.has(theme)).map((theme, index): ThemePreset => {
      const baseColor = (ThemeCatalog.options.baseColor as readonly string[]).includes(theme)
        ? theme
        : ThemeCatalog.options.baseColor[index % ThemeCatalog.options.baseColor.length];
      let chartColor = theme === "teal" ? "amber" : themes[(index + 5) % themes.length];
      if (!ThemeCatalog.allowedTheme(baseColor, chartColor)) chartColor = theme;
      return seed(theme, ThemeCatalog.label(theme), `${style[index % style.length]} · ${radius[index % radius.length]}`, {
        base: base[index % base.length],
        style: style[index % style.length],
        baseColor,
        theme,
        chartColor,
        iconLibrary: iconLibrary[index % iconLibrary.length],
        font: font[index % font.length],
        fontHeading: index % 5 === 0 ? "playfair-display" : "inherit",
        radius: radius[index % radius.length],
        menuAccent: menuAccent[index % menuAccent.length],
        menuColor: menuColor[index % menuColor.length],
      });
    });
    const extras = [
      seed("inverted-violet", "Inverted violet", "Bold inverted menu", {
        style: "vega", baseColor: "zinc", theme: "violet", chartColor: "fuchsia", font: "inter", radius: "small", menuAccent: "bold", menuColor: "inverted",
      }),
      seed("glass-sky", "Glass sky", "Translucent menu", {
        style: "luma", baseColor: "mist", theme: "sky", chartColor: "cyan", font: "outfit", radius: "large", menuColor: "default-translucent",
      }),
      seed("rtl-rose", "RTL rose", "Right to left", {
        style: "maia", baseColor: "mauve", theme: "rose", font: "noto-sans", radius: "medium", rtl: true, pointer: true,
      }),
    ];
    return [ThemeCatalog.bearing(), ...styles, ...colors, ...extras];
  }
}
