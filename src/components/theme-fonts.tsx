"use client";

import { useEffect } from "react";
import { ThemeCatalog } from "@/lib/theme-catalog";
import type { ThemeSelection } from "@/lib/theme-chrome";

const loaders: Record<string, () => Promise<unknown>> = {
  inter: () => import("@fontsource-variable/inter/wght.css"),
  "noto-sans": () => import("@fontsource-variable/noto-sans/wght.css"),
  "nunito-sans": () => import("@fontsource-variable/nunito-sans/wght.css"),
  figtree: () => import("@fontsource-variable/figtree/wght.css"),
  roboto: () => import("@fontsource-variable/roboto/wght.css"),
  raleway: () => import("@fontsource-variable/raleway/wght.css"),
  "dm-sans": () => import("@fontsource-variable/dm-sans/wght.css"),
  "public-sans": () => import("@fontsource-variable/public-sans/wght.css"),
  outfit: () => import("@fontsource-variable/outfit/wght.css"),
  oxanium: () => import("@fontsource-variable/oxanium/wght.css"),
  manrope: () => import("@fontsource-variable/manrope/wght.css"),
  "space-grotesk": () => import("@fontsource-variable/space-grotesk/wght.css"),
  montserrat: () => import("@fontsource-variable/montserrat/wght.css"),
  "ibm-plex-sans": () => import("@fontsource-variable/ibm-plex-sans/wght.css"),
  "source-sans-3": () => import("@fontsource-variable/source-sans-3/wght.css"),
  "instrument-sans": () => import("@fontsource-variable/instrument-sans/wght.css"),
  "jetbrains-mono": () => import("@fontsource-variable/jetbrains-mono/wght.css"),
  "noto-serif": () => import("@fontsource-variable/noto-serif/wght.css"),
  "roboto-slab": () => import("@fontsource-variable/roboto-slab/wght.css"),
  merriweather: () => import("@fontsource-variable/merriweather/wght.css"),
  lora: () => import("@fontsource-variable/lora/wght.css"),
  "playfair-display": () => import("@fontsource-variable/playfair-display/wght.css"),
  "eb-garamond": () => import("@fontsource-variable/eb-garamond/wght.css"),
  "instrument-serif": () => import("@fontsource/instrument-serif/index.css"),
};

let ticket = 0;

function bare(family: string) {
  return family.replace(/^["']|["']$/g, "");
}

async function matchingFace(family: string) {
  const wanted = bare(family);
  const faces = await document.fonts.load(`16px ${family.includes(" ") && !family.startsWith('"') ? `"${family}"` : family}`);
  return faces.some((face) => face.status === "loaded" && bare(face.family) === wanted);
}

async function loadFace(id: string): Promise<"loaded" | "failed"> {
  if (id === "geist" || id === "geist-mono") {
    const variable = id === "geist" ? "--font-geist-sans" : "--font-geist-mono";
    const family = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
    if (!family) return "failed";
    return (await matchingFace(family)) ? "loaded" : "failed";
  }
  const load = loaders[id];
  const family = ThemeCatalog.fontFamily(id);
  if (!load || !family) return "failed";
  try {
    await load();
    return (await matchingFace(family)) ? "loaded" : "failed";
  } catch (error) {
    console.error(`Unable to load font ${id}`, error);
    return "failed";
  }
}

/** Loads only the active body and heading faces and records whether that exact face loaded. */
export function ThemeFonts({ selection }: { selection: ThemeSelection }) {
  useEffect(() => {
    const mine = ++ticket;
    const root = document.documentElement;
    root.dataset.fontId = selection.font;
    root.dataset.fontBody = "pending";
    root.dataset.fontHeading = "pending";
    let cancelled = false;
    (async () => {
      const body = await loadFace(selection.font);
      const headingId = selection.fontHeading === "inherit" ? selection.font : selection.fontHeading;
      const heading = headingId === selection.font ? body : await loadFace(headingId);
      if (cancelled || mine !== ticket) return;
      root.dataset.fontBody = body;
      root.dataset.fontHeading = heading;
    })();
    return () => {
      cancelled = true;
    };
  }, [selection.font, selection.fontHeading]);
  return null;
}
