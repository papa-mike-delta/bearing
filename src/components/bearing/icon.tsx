"use client";

import * as React from "react";
import { useEffect, useState } from "react";
import { useThemeSelection } from "@/components/theme-selection";
import { ThemeIcons, type IconLibraryName } from "@/lib/theme-icons";
import { cn } from "@/lib/utils";

type IconComponent = React.ComponentType<React.SVGProps<SVGSVGElement> & { className?: string }>;

const modules = new Map<IconLibraryName, Promise<Record<string, unknown>>>();

function moduleFor(library: IconLibraryName) {
  const cached = modules.get(library);
  if (cached) return cached;
  const pending =
    library === "lucide" ? import("lucide-react")
    : library === "phosphor" ? import("@phosphor-icons/react")
    : library === "tabler" ? import("@tabler/icons-react")
    : library === "remixicon" ? import("@remixicon/react")
    : Promise.all([import("@hugeicons/react"), import("@hugeicons/core-free-icons")]).then(([ui, icons]) => ({ HugeiconsIcon: ui.HugeiconsIcon, icons }));
  modules.set(library, pending as Promise<Record<string, unknown>>);
  return pending as Promise<Record<string, unknown>>;
}

async function resolveIcon(library: IconLibraryName, exportName: string): Promise<IconComponent | undefined> {
  const loaded = await moduleFor(library);
  if (library === "hugeicons") {
    const icons = loaded.icons as Record<string, unknown>;
    const icon = icons[exportName];
    const HugeiconsIcon = loaded.HugeiconsIcon as React.ComponentType<{ icon: unknown; className?: string } & React.SVGProps<SVGSVGElement>>;
    if (!icon || !HugeiconsIcon) return undefined;
    return function HugeIcon(props) {
      return <HugeiconsIcon icon={icon} {...props} />;
    };
  }
  const component = loaded[exportName];
  return component ? (component as IconComponent) : undefined;
}

interface IconProps extends React.SVGProps<SVGSVGElement> {
  name: string;
  className?: string;
}

export function Icon({ name, className, ...rest }: IconProps) {
  const { iconLibrary } = useThemeSelection();
  const library = (ThemeCatalogLibraries.has(iconLibrary) ? iconLibrary : "lucide") as IconLibraryName;
  const exportName = ThemeIcons.resolve(library, name);
  const [Comp, setComp] = useState<IconComponent | null>(null);
  const labeled = Boolean(rest["aria-label"] || rest["aria-labelledby"]);

  useEffect(() => {
    let live = true;
    if (!exportName) {
      console.error(`Unmapped icon "${name}" for ${library}`);
      Promise.resolve().then(() => {
        if (live) setComp(null);
      });
      return () => {
        live = false;
      };
    }
    resolveIcon(library, exportName).then((component) => {
      if (!live) return;
      if (!component) console.error(`Icon export ${exportName} is missing from ${library}`);
      setComp(() => component ?? null);
    }).catch((error) => {
      if (!live) return;
      console.error(`Unable to load ${library} icon ${name}`, error);
      setComp(null);
    });
    return () => {
      live = false;
    };
  }, [exportName, library, name]);

  const box = cn("inline-block h-4 w-4 shrink-0", className);
  if (!Comp) {
    return <span aria-hidden={labeled ? undefined : true} data-icon-missing={exportName ? undefined : name} className={box} />;
  }
  return <Comp aria-hidden={labeled ? undefined : true} focusable="false" className={box} {...rest} />;
}

const ThemeCatalogLibraries = new Set<string>(["lucide", "phosphor", "tabler", "hugeicons", "remixicon"]);
