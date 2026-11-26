"use client";

import { useQuery } from "@tanstack/react-query";
import { ThemeChrome } from "@/lib/theme-chrome";
import { ThemeFonts } from "./theme-fonts";
import { defaultThemeSelection, ThemeSelectionProvider } from "./theme-selection";

export const themeOverrideKey = ["theme-override"] as const;

export function StoredThemeOverride({ children }: { children?: React.ReactNode }) {
  const { data } = useQuery({
    queryKey: themeOverrideKey,
    queryFn: async () => {
      const response = await fetch("/api/preferences/theme", { cache: "no-store" });
      if (!response.ok) throw new Error("Unable to load imported theme.");
      return response.json() as Promise<{ css: string }>;
    },
  });
  const css = data?.css ?? "";
  const selection = css ? ThemeChrome.read(css) : defaultThemeSelection;
  const chrome = ThemeChrome.rules(selection.style);

  return (
    <ThemeSelectionProvider value={selection}>
      {css ? (
        <style data-theme-override {...(selection.style ? { "data-create-style": selection.style } : {})}>
          {css}
          {chrome}
        </style>
      ) : null}
      <ThemeFonts selection={selection} />
      {children}
    </ThemeSelectionProvider>
  );
}
