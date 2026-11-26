"use client";

import { createContext, useContext } from "react";
import type { ThemeSelection } from "@/lib/theme-chrome";

export const defaultThemeSelection: ThemeSelection = {
  base: "radix",
  style: "",
  iconLibrary: "lucide",
  font: "geist",
  fontHeading: "inherit",
};

const ThemeSelectionContext = createContext<ThemeSelection>(defaultThemeSelection);

export function ThemeSelectionProvider({
  value,
  children,
}: {
  value: ThemeSelection;
  children: React.ReactNode;
}) {
  return <ThemeSelectionContext.Provider value={value}>{children}</ThemeSelectionContext.Provider>;
}

export function useThemeSelection() {
  return useContext(ThemeSelectionContext);
}
