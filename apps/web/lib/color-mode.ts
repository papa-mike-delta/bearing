// Light or dark for this browser. next-themes stores the choice and sets the
// `.dark` class that every palette (built-in or imported) already styles.
export const colorModes = [
  { id: "light", name: "Light" },
  { id: "dark", name: "Dark" },
  { id: "system", name: "System" },
] as const;

export type ColorMode = (typeof colorModes)[number]["id"];

// Anything unknown or not yet read from storage follows the system.
export function colorModeChoice(theme: string | undefined): ColorMode {
  return colorModes.some((mode) => mode.id === theme) ? (theme as ColorMode) : "system";
}
