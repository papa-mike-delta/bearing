"use client";
import { useState } from "react";
import { useTheme } from "next-themes";
import { useQueryClient } from "@tanstack/react-query";
import { themeOverrideKey } from "@/components/theme-override";
import { Button } from "@/components/ui/button";
import {
  ThemeCatalog,
  type CreateSelection,
} from "@/lib/theme-catalog";
import { useWorkspace, fieldClass } from "./context";

const optionFields = [
  ["base", "Base"],
  ["style", "Style"],
  ["baseColor", "Base color"],
  ["theme", "Theme"],
  ["chartColor", "Chart color"],
  ["iconLibrary", "Icon library"],
  ["font", "Font"],
  ["fontHeading", "Heading"],
  ["radius", "Radius"],
  ["menuAccent", "Menu accent"],
  ["menuColor", "Menu color"],
] as const;

function choices(key: (typeof optionFields)[number][0]): readonly string[] {
  if (key === "fontHeading") return ThemeCatalog.headingFonts();
  if (key === "chartColor") return ThemeCatalog.options.theme;
  return ThemeCatalog.options[key];
}

/** Same theme parser, persistence and override layer as the existing Settings page. */
export function Appearance() {
  const { userId } = useWorkspace(),
    { theme, setTheme } = useTheme(),
    client = useQueryClient();
  const [input, setInput] = useState(""),
    [selection, setSelection] = useState<CreateSelection>(() => ThemeCatalog.defaults()),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");

  async function save(next?: string) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/preferences/theme", {
        method: next === undefined ? "DELETE" : "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Bearing-Account": userId,
        },
        ...(next === undefined ? {} : { body: JSON.stringify({ input: next }) }),
      });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error);
      await client.cancelQueries({ queryKey: themeOverrideKey });
      client.setQueryData(themeOverrideKey, value);
      if (next !== undefined) setInput("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function applyOptions() {
    try {
      void save(ThemeCatalog.createUrl(selection));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="space-y-4">
      <label className="block text-sm text-muted-foreground">
        Theme
        <select
          aria-label="Theme"
          className={`${fieldClass} mt-1 max-w-xs`}
          value={theme || "system"}
          onChange={(e) => setTheme(e.target.value)}
        >
          <option value="system">System</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </label>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-foreground">Presets</legend>
        <p className="text-xs text-muted-foreground">
          Applying a preset writes the override used by Graph, Today, and Journal.
        </p>
        <div className="grid max-h-72 grid-cols-2 gap-1.5 overflow-y-auto sm:grid-cols-3">
          {ThemeCatalog.presets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              disabled={busy}
              className="flex min-h-11 items-center gap-2 rounded-lg border border-border/80 bg-card/80 px-2 py-1.5 text-left text-xs disabled:opacity-50"
              onClick={() => void save(`preset:${preset.id}`)}
            >
              <span
                aria-hidden="true"
                className="h-4 w-4 shrink-0 rounded-full border border-border"
                style={{ background: preset.swatch }}
              />
              <span className="min-w-0">
                <span className="block truncate font-medium text-foreground">{preset.title}</span>
                <span className="block truncate text-muted-foreground">{preset.detail}</span>
              </span>
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-foreground">Create options</legend>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {optionFields.map(([key, label]) => (
            <label key={key} className="block text-sm text-muted-foreground">
              {label}
              <select
                aria-label={label}
                className={`${fieldClass} mt-1`}
                value={selection[key]}
                disabled={busy}
                onChange={(e) => setSelection((current) => ({ ...current, [key]: e.target.value }))}
              >
                {choices(key).map((value) => (
                  <option key={value} value={value}>
                    {ThemeCatalog.label(value)}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="inline-flex min-h-11 items-center gap-2">
            <input
              type="checkbox"
              checked={selection.rtl}
              disabled={busy}
              onChange={(e) => setSelection((current) => ({ ...current, rtl: e.target.checked }))}
            />
            Right to left
          </label>
          <label className="inline-flex min-h-11 items-center gap-2">
            <input
              type="checkbox"
              checked={selection.pointer}
              disabled={busy}
              onChange={(e) => setSelection((current) => ({ ...current, pointer: e.target.checked }))}
            />
            Pointer cursor
          </label>
        </div>
        <Button disabled={busy} onClick={applyOptions}>
          Apply create options
        </Button>
      </fieldset>

      <label className="block text-sm text-muted-foreground">
        Import theme
        <textarea
          className={`${fieldClass} mt-1`}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={2}
          maxLength={100000}
          placeholder="CSS, JSON, preset:name, or a ui.shadcn.com/create URL"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy || !input.trim()} onClick={() => void save(input)}>
          Import theme
        </Button>
        <Button variant="outline" disabled={busy} onClick={() => void save()}>
          Reset imported theme
        </Button>
      </div>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
