"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Button } from "@repo/ui/components/button";
import { colorModeChoice, colorModes } from "../../lib/color-mode";

// Light, Dark or System for this browser, on top of the chosen palette.
export function ColorModeSwitch() {
  const { theme, setTheme } = useTheme();
  // The stored choice is only known in the browser; render none pressed until then.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const selected = mounted ? colorModeChoice(theme) : null;
  return (
    <div className="color-mode">
      <fieldset>
        <legend>Light or dark</legend>
        <div className="choices">
          {colorModes.map((mode) => (
            <Button
              key={mode.id}
              type="button"
              variant={selected === mode.id ? "default" : "outline"}
              aria-pressed={selected === mode.id}
              onClick={() => setTheme(mode.id)}
            >
              {mode.name}
            </Button>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
