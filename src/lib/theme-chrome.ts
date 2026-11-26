import { ThemeCatalog } from "./theme-catalog";

type StyleName = (typeof ThemeCatalog.options.style)[number];

type Metrics = {
  radius: string;
  buttonHeight: string;
  buttonFont: string;
  buttonPad: string;
  buttonWeight: string;
  buttonTracking: string;
  buttonCase: string;
  ring: string;
  inputHeight: string;
  inputFont: string;
  inputBg: string;
  inputBorder: string;
  inputPad: string;
  cardRadius: string;
  cardShadow: string;
  cardFont: string;
  dialogRadius: string;
  dialogPad: string;
  dialogFont: string;
  dialogShadow: string;
  badgeRadius: string;
};

/** Default-size metrics taken from ui.shadcn.com/r/styles/radix-{style} button, input, card, dialog, and badge. */
const metrics: Record<StyleName, Metrics> = {
  vega: { radius: "calc(var(--radius) - 2px)", buttonHeight: "2.25rem", buttonFont: "0.875rem", buttonPad: "0.625rem", buttonWeight: "500", buttonTracking: "normal", buttonCase: "none", ring: "3px", inputHeight: "2.25rem", inputFont: "1rem", inputBg: "transparent", inputBorder: "1px solid var(--input)", inputPad: "0.625rem", cardRadius: "calc(var(--radius) + 4px)", cardShadow: "0 1px 2px rgb(0 0 0 / 0.05)", cardFont: "0.875rem", dialogRadius: "calc(var(--radius) + 4px)", dialogPad: "1.5rem", dialogFont: "0.875rem", dialogShadow: "none", badgeRadius: "2rem" },
  nova: { radius: "var(--radius)", buttonHeight: "2rem", buttonFont: "0.875rem", buttonPad: "0.625rem", buttonWeight: "500", buttonTracking: "normal", buttonCase: "none", ring: "3px", inputHeight: "2rem", inputFont: "1rem", inputBg: "transparent", inputBorder: "1px solid var(--input)", inputPad: "0.625rem", cardRadius: "calc(var(--radius) + 4px)", cardShadow: "none", cardFont: "0.875rem", dialogRadius: "calc(var(--radius) + 4px)", dialogPad: "1rem", dialogFont: "0.875rem", dialogShadow: "none", badgeRadius: "2rem" },
  maia: { radius: "2rem", buttonHeight: "2.25rem", buttonFont: "0.875rem", buttonPad: "0.75rem", buttonWeight: "500", buttonTracking: "normal", buttonCase: "none", ring: "3px", inputHeight: "2.25rem", inputFont: "1rem", inputBg: "color-mix(in oklab, var(--input) 30%, transparent)", inputBorder: "1px solid var(--input)", inputPad: "0.75rem", cardRadius: "1rem", cardShadow: "none", cardFont: "0.875rem", dialogRadius: "2rem", dialogPad: "1.5rem", dialogFont: "0.875rem", dialogShadow: "none", badgeRadius: "2rem" },
  lyra: { radius: "0", buttonHeight: "2rem", buttonFont: "0.75rem", buttonPad: "0.625rem", buttonWeight: "500", buttonTracking: "normal", buttonCase: "none", ring: "1px", inputHeight: "2rem", inputFont: "0.75rem", inputBg: "transparent", inputBorder: "1px solid var(--input)", inputPad: "0.625rem", cardRadius: "0", cardShadow: "none", cardFont: "0.75rem", dialogRadius: "0", dialogPad: "1rem", dialogFont: "0.75rem", dialogShadow: "none", badgeRadius: "0" },
  mira: { radius: "calc(var(--radius) - 2px)", buttonHeight: "1.75rem", buttonFont: "0.75rem", buttonPad: "0.5rem", buttonWeight: "500", buttonTracking: "normal", buttonCase: "none", ring: "2px", inputHeight: "1.75rem", inputFont: "0.875rem", inputBg: "color-mix(in oklab, var(--input) 20%, transparent)", inputBorder: "1px solid var(--input)", inputPad: "0.5rem", cardRadius: "var(--radius)", cardShadow: "none", cardFont: "0.75rem", dialogRadius: "calc(var(--radius) + 4px)", dialogPad: "1rem", dialogFont: "0.75rem", dialogShadow: "none", badgeRadius: "999px" },
  luma: { radius: "2rem", buttonHeight: "2.25rem", buttonFont: "0.875rem", buttonPad: "0.75rem", buttonWeight: "500", buttonTracking: "normal", buttonCase: "none", ring: "3px", inputHeight: "2.25rem", inputFont: "1rem", inputBg: "color-mix(in oklab, var(--input) 50%, transparent)", inputBorder: "1px solid transparent", inputPad: "0.75rem", cardRadius: "2rem", cardShadow: "0 4px 6px rgb(0 0 0 / 0.1)", cardFont: "0.875rem", dialogRadius: "2rem", dialogPad: "1.5rem", dialogFont: "0.875rem", dialogShadow: "0 20px 25px rgb(0 0 0 / 0.15)", badgeRadius: "1.5rem" },
  sera: { radius: "0", buttonHeight: "2.5rem", buttonFont: "0.75rem", buttonPad: "1.5rem", buttonWeight: "600", buttonTracking: "0.1em", buttonCase: "uppercase", ring: "2px", inputHeight: "2.5rem", inputFont: "1rem", inputBg: "transparent", inputBorder: "1px solid transparent", inputPad: "0", cardRadius: "0", cardShadow: "0 1px 2px rgb(0 0 0 / 0.08)", cardFont: "0.875rem", dialogRadius: "0", dialogPad: "1.5rem", dialogFont: "0.875rem", dialogShadow: "0 4px 6px rgb(0 0 0 / 0.1)", badgeRadius: "0" },
  rhea: { radius: "1rem", buttonHeight: "2rem", buttonFont: "0.875rem", buttonPad: "0.75rem", buttonWeight: "500", buttonTracking: "normal", buttonCase: "none", ring: "3px", inputHeight: "2rem", inputFont: "1rem", inputBg: "color-mix(in oklab, var(--input) 50%, transparent)", inputBorder: "1px solid transparent", inputPad: "0.625rem", cardRadius: "min(1.5rem, 24px)", cardShadow: "0 1px 2px rgb(0 0 0 / 0.08)", cardFont: "0.875rem", dialogRadius: "min(1.5rem, 24px)", dialogPad: "1.5rem", dialogFont: "0.875rem", dialogShadow: "0 20px 25px rgb(0 0 0 / 0.15)", badgeRadius: "1rem" },
};

export type ThemeSelection = {
  base: string;
  style: string;
  iconLibrary: string;
  font: string;
  fontHeading: string;
};

const field = String.raw`input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="file"]):not([type="hidden"]), textarea, select`;

export class ThemeChrome {
  static read(css: string): ThemeSelection {
    const pick = (name: string, allowed: readonly string[], fallback: string) => {
      const match = css.match(new RegExp(`${name}:\\s*([^;]+)`));
      const value = match?.[1]?.trim();
      return value && allowed.includes(value) ? value : fallback;
    };
    return {
      base: pick("--bearing-base", ThemeCatalog.options.base, "radix"),
      style: pick("--bearing-style", ThemeCatalog.options.style, ""),
      iconLibrary: pick("--bearing-icon", ThemeCatalog.options.iconLibrary, "lucide"),
      font: pick("--bearing-font", ThemeCatalog.options.font, "geist"),
      fontHeading: pick("--bearing-font-heading", ["inherit", ...ThemeCatalog.options.font], "inherit"),
    };
  }

  /** Reference chrome for the slots this app paints. Empty when no create style is active. */
  static rules(style: string): string {
    if (!(ThemeCatalog.options.style as readonly string[]).includes(style)) return "";
    const m = metrics[style as StyleName];
    const underline = style === "sera" ? "border-bottom-color: var(--input);" : "";
    return `
html.bearing-v1 .bearing-app [data-slot="button"] {
  border-radius: ${m.radius} !important;
  font-size: ${m.buttonFont};
  font-weight: ${m.buttonWeight};
  letter-spacing: ${m.buttonTracking};
  text-transform: ${m.buttonCase};
}
html.bearing-v1 [data-slot="button"][data-size="default"] {
  height: ${m.buttonHeight};
  padding-inline: ${m.buttonPad};
}
html.bearing-v1 [data-slot="button"]:focus-visible {
  box-shadow: 0 0 0 ${m.ring} color-mix(in oklab, var(--ring) 55%, transparent);
}
html.bearing-v1 [data-slot="button"]:active {
  transform: translateY(1px);
}
html.bearing-v1 .bearing-app :where(${field}),
html.bearing-v1 [data-slot="input"],
html.bearing-v1 [data-slot="textarea"],
html.bearing-v1 [data-slot="select-trigger"] {
  border-radius: ${m.radius};
  background-color: ${m.inputBg};
  border: ${m.inputBorder};
  ${underline}
  font-size: ${m.inputFont};
  padding-inline: ${m.inputPad};
}
html.bearing-v1 .bearing-app :where(input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="file"]):not([type="hidden"]), select),
html.bearing-v1 [data-slot="input"],
html.bearing-v1 [data-slot="select-trigger"] {
  height: ${m.inputHeight};
}
html.bearing-v1 [data-slot="section-card"],
html.bearing-v1 [data-slot="item-card"],
html.bearing-v1 [data-slot="journal-bar"] {
  border-radius: ${m.cardRadius};
  box-shadow: ${m.cardShadow};
  font-size: ${m.cardFont};
}
html.bearing-v1 [data-slot="dialog-content"],
html.bearing-v1 [data-slot="select-content"] {
  border-radius: ${m.dialogRadius};
  box-shadow: ${m.dialogShadow};
}
html.bearing-v1 [data-slot="dialog-content"] {
  padding: ${m.dialogPad};
  font-size: ${m.dialogFont};
  background: var(--popover);
  color: var(--popover-foreground);
}
html.bearing-v1 [data-slot="badge"],
html.bearing-v1 [data-slot="page-mark"],
html.bearing-v1 [data-slot="sidebar-link"] {
  border-radius: ${m.badgeRadius === "999px" ? m.radius : m.radius};
}
html.bearing-v1 [data-slot="badge"] { border-radius: ${m.badgeRadius}; }
html.bearing-v1 [data-slot="sidebar-link"] {
  border-radius: ${m.radius};
  font-size: ${m.buttonFont};
  font-weight: ${m.buttonWeight};
  letter-spacing: ${m.buttonTracking};
  text-transform: ${m.buttonCase};
}
html.bearing-v1 input[type="checkbox"] { border-radius: min(${m.radius}, 0.45rem); }
`.trim();
  }
}
