# shadcn/ui integration and quick theme switching

## Question

How should Bearing add shadcn/ui so that (a) components from the shadcn library can be added with the CLI or pasted in, and (b) themes Paul designs on https://ui.shadcn.com/create can be pulled in with a link or one command, and switched out and back quickly?

- Asked by: Paul, 2026-10-08.
- Researched by: Bearing Research. Repo state read at `main` `7496675` (after #18 and #19).
- Criteria the requester named:
  - what /create produces today, and whether the CLI can apply a theme to an existing project and cleanly overwrite it with another;
  - shadcn's official monorepo setup, and whether `packages/ui` or `apps/web` should hold the components;
  - Tailwind version and what shadcn needs;
  - the Radix / Base UI choice;
  - a concrete quick-switch mechanism that keeps light and dark working;
  - whether a custom registry is worth it;
  - what changes in the current UI, and in which order.

## Constraints from the glossary and ADRs

Constraints are taken from the spec, the README and the code.

| # | Constraint | Source |
| --- | --- | --- |
| C1 | `packages/ui` holds "sober components. No product logic." | `docs/research/spec.md` §11.1; `README.md` ("`packages/ui` — components. No product logic.") |
| C2 | Visual direction: Things 3 density, Linear chrome. One accent; status is type and position. A neutral grotesque for UI at 13–14px. Almost no motion. No emoji in product UI. | spec §9 |
| C3 | Don't put business rules in React components. Don't copy Lunatask's icons or empty states. | spec §11.7 |
| C4 | npm workspaces, npm 10.9.9, Node >= 24. Exact version pins are the convention. Turborepo 2.11.7, with agent rules in `AGENTS.md`. | root `package.json`, `AGENTS.md` at `7496675` |
| C5 | No Tailwind anywhere. `apps/web/app/globals.css` is about 200 lines of plain, unlayered CSS: element selectors (`button`, `input`, `form`, `li`, `header`…), three classes (`.thread`, `.composer`, `.complete`), and its own tokens `--background`, `--foreground`, `--muted`, `--line`, `--accent`. Dark mode follows `prefers-color-scheme`. | `apps/web/app/globals.css` |
| C6 | Fonts are local Geist and Geist Mono via `next/font/local` (`--font-geist-sans`, `--font-geist-mono`). | `apps/web/app/layout.tsx` |
| C7 | `packages/ui` (`@repo/ui`) is the unused create-turbo starter: `button.tsx` (alerts "Hello from your app"), `card.tsx`, `code.tsx`, exports `./* -> ./src/*.tsx`. `apps/web` depends on it but imports nothing from it. | `packages/ui/*`; `rg '@repo/ui' apps/web` |
| C8 | `apps/web/next.config.js` returns `{}` (plus the migration check). `apps/web/tsconfig.json` has no `paths`. | `apps/web/next.config.js`, `tsconfig.json` |
| C9 | Screens touched: Tasks (`app/page.tsx`), Inbox, Coach (`coach/chat.tsx`), sign-in (`sign-in/page.tsx`, `submit-buttons.tsx`) and `header.tsx`. Vocabulary: Area, Task, Priority List, Inbox, Draft, Coach. | `apps/web/app/*`; issue #1 |

## Candidates

**A. Official shadcn monorepo layout, with `packages/ui` repurposed** [2].
- Components, `cn`, the shared `globals.css` and the theme live in `packages/ui`. Each of `packages/ui` and `apps/web` gets a `components.json`.
- `shadcn add` run in `apps/web` writes into `packages/ui` and fixes imports.
- Theme switching uses the CLI's own `shadcn apply <preset> --only theme`, wrapped in two npm scripts. A dev/preview-only `data-theme` attribute flips imported themes live.

**B. Single-app layout: components in `apps/web/components/ui`**, ignoring `packages/ui`. This is the plain Next.js install [11]. It's simpler on paper, but it contradicts C1 (spec puts components in `packages/ui`) and leaves the starter package dead.

**C. A Bearing shadcn registry** (`registry.json` plus `shadcn build`, or a GitHub source registry) to hold Bearing's themes and components [14][15][16]. This could sit on top of A or B.

**D. Keep the CLI out of theming:** copy the raw CSS from /create's "Theme" tab by hand [5]. This is a fallback, not a workflow.

## What /create produces today (verified)

Checked against `shadcn@4.21.4` (`latest`, published 2026-10-07) [1] and its source at tag `shadcn@4.21.4` [6].

- **A preset code.** /create bit-packs its choices into a short base62 code with a version prefix. Example: `b5owWMfJ8l` = style mira, baseColor mauve, theme mauve, chartColor amber, icons hugeicons, font inter, heading font oxanium, radius large, menu subtle / inverted-translucent [7][8].
  - The code covers style, baseColor, theme (accent), chartColor, iconLibrary, font, fontHeading, radius, menuAccent and menuColor, each from a fixed list [7]. It cannot hold arbitrary colours.
  - It does not include the component library (Base UI / Radix / React Aria). `apply` keeps the project's own [6][9].
- **A share URL:** `https://ui.shadcn.com/create?preset=<code>` (Share button; `shadcn preset url <code>`) [5][8].
- **Copy-ready commands**, in three tabs [5]:
  - New project: `npx shadcn@4.21.4 init --preset <code>` plus base/template/monorepo flags.
  - Existing project: `shadcn apply --preset <code>` with "Full preset", "Theme only" (`--only theme`) or "Fonts only" (`--only font`).
  - Theme: copy the raw `:root { … } .dark { … }` CSS variables.
- **A registry item behind the scenes.** The CLI turns the code into `https://ui.shadcn.com/init?…` and fetches a `registry:base` JSON. Fetched for `b5owWMfJ8l&only=theme` on 2026-10-08: `cssVars.light` (32 vars), `cssVars.dark` (31) and `config` (`baseColor`, `menuColor`, `menuAccent`) [6][T1]. This endpoint is undocumented, so Bearing shouldn't call it directly.
- **CLI helpers:** `shadcn preset decode|url|open|resolve` [8]. `shadcn/preset` exports `encodePreset`/`decodePreset` [6].

### Can the CLI re-theme an existing project? Yes: `shadcn apply`

`shadcn apply [preset] [--preset <code|url|name>] [--only theme,font] [-y]` (added 2026-04, partial apply 2026-04-22) [3][9][10].

- It needs an existing `components.json` and refuses to run without one [6].
- **Full apply rewrites components.** It "will overwrite existing UI components, fonts, and CSS variables": every installed component is re-installed in the new style, and fonts are rewritten in `layout.tsx` [6][9]. That's a branch-and-review operation, not a quick switch.
- **`--only theme`** changes only:
  - the `:root` / `.dark` CSS variables (colours, `--radius`, charts, sidebar);
  - `tailwind.baseColor`, `menuColor` and `menuAccent` in both workspaces' `components.json`.
  - Components and `layout.tsx` are untouched [5][6][T3].
- **A share URL is not accepted.** `apply "https://ui.shadcn.com/create?preset=…"` fails with "Unexpected token '<' … not valid JSON": it fetches the HTML page. Pass the code itself [T4]. Only `/init` URLs, codes and the named presets (`nova`, `vega`, `maia`, `lyra`, …) are valid [6].

## Primary-source comparison

| Criterion | A. Monorepo, `packages/ui` | B. Components in `apps/web` | C. Bearing registry | D. Hand-copied CSS |
| --- | --- | --- | --- | --- |
| Officially supported | Yes. Documented monorepo flow: `add` from the app installs into `packages/ui` and rewrites imports [2]. | Yes, the plain Next.js install [11]. | Yes [14][15][16]. | /create offers the copy button [5]. |
| Fits spec C1 | Yes. | No: components leave `packages/ui`. | Neutral. | Neutral. |
| `shadcn add` lands correctly | Yes. In a scaffolded monorepo, `add card input` from `apps/web` wrote `packages/ui/src/components/{card,input}.tsx` [T2]. Same in a Bearing copy (`button`) [T5]. | Yes [11]. | `add <owner>/<repo>/<item>` from a private repo works via `gh` [16]. | n/a |
| Apply a /create theme to the existing app | `apply <code> --only theme`. Round trip tested clean: neutral → mauve → neutral leaves no diff except an inert `"registries": {}` key [T3]. Also tested in a Bearing copy [T6]. | Same command [10]. | `add` of a `registry:theme` item does **not** replace existing variables; only missing ones are added (`overwriteCssVars` defaults to false). Tested: no diff [T7][6]. | Manual edit; error-prone. |
| Live flip between themes without redeploy | Yes, with generated `[data-theme]` files (see below). Variables stay runtime `var()`s, e.g. `.bg-primary{background-color:var(--primary)}` in the built CSS [T8]. | Same mechanism possible. | No: registries install files, not runtime switches. | No. |
| Extra infrastructure | None. | None. | `registry.json` (+ `shadcn build` if hosted). Earns its keep only when another project consumes Bearing items [14][15]. | None. |

### Tests (throwaway, on the box, never committed)

- **T1:** `curl` the `/init` URL for `b5owWMfJ8l` with `only=theme`. Result: `registry:base` named `base-mira-theme`, with `cssVars.light/dark` and `config`.
- **T2:** `npx shadcn@4.21.4 init --monorepo -t next -b base --preset nova -n fresh-mono -y` in an empty directory. The CLI turned the pnpm template into npm workspaces with `packageManager: npm@10.9.9`. `add card input` from `apps/web` landed in `packages/ui`.
- **T3:** In that monorepo, from `apps/web`:
  - `apply b5owWMfJ8l --only theme -y` changed only `globals.css` (86 lines of variables) and both `components.json` files.
  - `apply nova --only theme -y` restored the original files exactly, apart from the `"registries": {}` key.
  - A **full** `apply b5owWMfJ8l -y` rewrote `button.tsx`, `card.tsx`, `input.tsx` and `layout.tsx`.
- **T4:** `apply` with the /create share URL failed with the JSON parse error above.
- **T5:** A Bearing copy (`7496675`) with the layout below. Results:
  - `apply --preset nova -y` worked from `apps/web` but **not** from `packages/ui` ("could not detect a supported framework").
  - It also wrote a stray `apps/web/lib/utils.ts`, and edited `layout.tsx` to add a second Geist from `next/font/google` plus `cn("font-sans", …)`. The official monorepo does the same on a full apply (T3); it's the open upstream issue #10093 [12].
  - `npx next build` passed (Next 16.3.4, React 19.2.8, Tailwind 4.3.3).
- **T6:** In the Bearing copy, `apply b5Kc6P0Vc --only theme` then `apply nova --only theme` gave no diff. The extra `@import "./themes/index.css";` line in `globals.css` survived both.
- **T7:** A `registry:theme` JSON built from the T1 variables, run through `add <file> -y` and then `add <file> -y --overwrite` in the T2 monorepo, changed nothing.
- **T8:** Prototype `theme:import` (below) imported `b5owWMfJ8l` as `mauve` and `b5Kc6P0Vc` as `olive` in about 4 s each.
  - It runs the official `apply --only theme` in a temporary stub project, with no `node_modules` and no `/init` call of its own.
  - The built CSS contains `:root[data-theme=mauve]{…}` and `:root[data-theme=mauve].dark{…}`, with mauve's `--radius:.875rem`.
- **T9 (conflict):** In the T5 build, Bearing's unlayered `button{…background:0 0;border-radius:6px;padding:…}` rules sit outside Tailwind's `@layer utilities`. Its `:root{--muted:#6b6b6b;--accent:#2f5fd0}` comes after shadcn's `--muted`/`--accent` and wins.
  - Unlayered declarations beat layered ones regardless of specificity [17].
  - So today's `globals.css` would override shadcn components' padding, background and radius, and repaint `bg-muted` and `bg-accent` with Bearing's text grey and brand blue.

## Recommendation

**Use A: repurpose `packages/ui` as the official shadcn UI workspace, on Tailwind v4 and Base UI.**

- Make one deliberate Bearing default preset, applied once with the CLI.
- Switch themes with the CLI's own `shadcn apply <code> --only theme`, wrapped in two npm scripts that take a /create link.
- For trying themes side by side, generate scoped `[data-theme="<name>"]` copies of each imported theme. A dev/preview-only `?theme=` switch flips them live, with no rebuild.
- No custom registry for now.

Why:

- It is shadcn's documented monorepo shape [2] and matches spec C1.
- `apply --only theme` is the first-party tool for exactly this job. It leaves components alone, and its round trip is byte-clean (T3, T6).
- `data-theme` previews work because every shadcn token is a runtime CSS variable (T8).
- A registry adds a build or hosting step, and doesn't switch themes at all (T7).

Known risks:

- **The current `globals.css` fights shadcn** (T9). Its rules must move into `@layer base` and its tokens be renamed before any shadcn component looks right [17][18].
- **Full-preset apply is destructive.** Changing style, font or icons re-installs every component and edits `layout.tsx` (T3). Hand edits inside `packages/ui/src/components/*` would be lost. Do it only on a branch.
- **Upstream quirk #10093** [12]: a full apply or init writes `apps/web/lib/utils.ts` and adds Google Geist to `layout.tsx`. Build deletes the file and keeps local Geist.
- **Live preview covers colours and radius only.** menuColor and fonts need a real apply. Style needs a full apply.
- **next-themes 0.4.6 is from 2025-03** [19], but it's the dependency shadcn's own docs and monorepo template use [4][T2].
- **Base is effectively locked once components exist.** Moving between Base UI and Radix later is a per-component migration (shadcn ships a migration skill) [13].

### How the quick switch works for Paul

1. **Design** at https://ui.shadcn.com/create and click **Share** (copies `https://ui.shadcn.com/create?preset=<code>`).
2. **Import:** `npm run theme:import -- "<that URL>" mauve` saves `packages/ui/src/styles/themes/mauve.css` and records `mauve → <code>` in `themes.json`. Commit it and push to a branch.
3. **Preview live:** on that branch's Vercel preview or locally, open any page with `?theme=mauve`. Flip with `?theme=olive`; go back with `?theme=default`. Light/dark keeps following the system. Production ignores the switch.
4. **Adopt it:** `npm run theme:apply -- mauve` runs `shadcn apply <code> --only theme -y` in `apps/web` and rewrites the real default. Deploy that.
5. **Go back:** `npm run theme:apply -- bearing` (the saved default), or `git restore`/`git revert` the commit. Both are clean (T3, T6).

### Decisions for Paul / Spec

1. **The component library: Base UI (recommended), Radix or React Aria.**
   - Base UI has been shadcn's default since 2026-07-02, and the docs open on it. Radix is supported, not deprecated [13].
   - React Aria became a first-class base on 2026-07-17 [20].
   - This is hard to change later.
2. **Bearing's default preset.** Paul designs it on /create.
   - Suggestion for spec §9: `b1D23xSa` = style mira (compact, "made for dense interfaces"), neutral base, blue accent (today's accent is blue), Geist, lucide icons, small radius, subtle menus. Decoded with `shadcn preset decode` [8][21].
   - Keep fonts as the local Geist files unless Paul picks another face.
3. **Where the live switch is allowed.** Recommend previews and local only (`VERCEL_ENV !== "production"`), and not a user setting. A user-facing theme picker would be a product feature for Spec.
4. **Icon library:** lucide (shadcn default) vs another. This is part of the preset (C3: don't copy Lunatask's icons).
5. **Registry later:** revisit only if a second app or project needs Bearing's components or themes (then use a private GitHub source registry, no build step) [15][16].

## What Build should wrap

### Versions

Registry `latest`, checked 2026-10-08 [1][22]. Pin exact, per C4. The CLI writes caret ranges, so pin after it runs.

| Package | Version | Workspace |
| --- | --- | --- |
| `shadcn` (CLI, and runtime `shadcn/tailwind.css`) | 4.21.4 | `@repo/ui` dependency (the CLI adds it) |
| `tailwindcss`, `@tailwindcss/postcss` | 4.3.3 | `@repo/ui` devDependency; `@tailwindcss/postcss` also in `web`, as in the template |
| `@base-ui/react` | 1.8.0 (peer `react ^17 \|\| ^18 \|\| ^19`) | `@repo/ui` |
| `class-variance-authority` | 0.7.1 | `@repo/ui` |
| `cn` | 0.4.0 (replaces clsx + tailwind-merge since 2026-09) [23] | `@repo/ui` |
| `tw-animate-css` | 1.4.0 | `@repo/ui` |
| `lucide-react` | 1.53.0 | `@repo/ui` and `web` |
| `next-themes` | 0.4.6 | `web` (provider) |

React stays at 19.2.8 (the template uses 19.3.0, but every peer range accepts 19.2.8). Next stays at 16.3.4.

### File layout

```
packages/ui/
  package.json        "type": "module"; exports:
                        "./globals.css": "./src/styles/globals.css",
                        "./postcss.config": "./postcss.config.mjs",
                        "./components/*": "./src/components/*.tsx",
                        "./lib/*": "./src/lib/*.ts", "./hooks/*": "./src/hooks/*.ts"
                      drop the starter "./*" export and "generate:component"
  components.json     aliases @repo/ui/{components,lib/utils,hooks,lib}; tailwind.css "src/styles/globals.css"
  postcss.config.mjs  { plugins: { "@tailwindcss/postcss": {} } }
  tsconfig.json       + "paths": { "@repo/ui/*": ["./src/*"] }
  src/components/     shadcn components only (CLI-owned; no product logic, C1)
  src/lib/utils.ts    export { cn } from "cn"
  src/styles/globals.css         @import "tailwindcss"; tw-animate-css; shadcn/tailwind.css;
                                 @import "./themes/index.css"; @source "../../../../apps/web/**/*.{ts,tsx}";
                                 the CLI-managed :root/.dark/@theme inline blocks
  src/styles/themes/index.css    generated: one @import per theme
  src/styles/themes/<name>.css   generated: :root[data-theme="<name>"] {…} and :root[data-theme="<name>"].dark {…}
  src/styles/themes/themes.json  { "<name>": { "preset": "<code>", "url": "…/create?preset=<code>" } }, incl. "bearing"
  scripts/theme-import.mjs, scripts/theme-apply.mjs
apps/web/
  components.json     aliases components "@/components", ui "@repo/ui/components", utils "@repo/ui/lib/utils",
                      lib "@/lib", hooks "@/hooks"; tailwind.css "../../packages/ui/src/styles/globals.css"
  postcss.config.mjs  export { default } from "@repo/ui/postcss.config";
  tsconfig.json       + "paths": { "@/*": ["./*"], "@repo/ui/*": ["../../packages/ui/src/*"] }
  next.config.js      return { transpilePackages: ["@repo/ui"] }  (keep the migration check)
  components/theme-provider.tsx   next-themes wrapper, as in shadcn's docs [4]
  app/layout.tsx      import "@repo/ui/globals.css" before "./globals.css";
                      <html lang="en" suppressHydrationWarning data-theme={previewTheme}>;
                      Geist local font with variable "--font-sans" on <html>;
                      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
root package.json     "theme:import": "node packages/ui/scripts/theme-import.mjs",
                      "theme:apply": "node packages/ui/scripts/theme-apply.mjs"
```

- **`components.json` shape:** same `style`, `iconLibrary` and `baseColor` in both files, `tailwind.config: ""` for v4 [2][T5].
- **Running the CLI:** always run `add` and `apply` from `apps/web` (T5). `components.json`, the `paths` entries and `transpilePackages` match shadcn's monorepo template [2][24].

### Commands

```sh
# once, from apps/web, after the files above exist; <code> = Bearing's default preset
npx shadcn@4.21.4 apply <code> -y
rm lib/utils.ts            # upstream #10093; utils live in packages/ui
# undo the CLI's next/font/google Geist edit in app/layout.tsx; map the local Geist to --font-sans
npm install --save-exact next-themes@0.4.6 -w web
# pin the caret ranges the CLI wrote in packages/ui/package.json to the versions above

# adding components later, always from apps/web
npx shadcn@4.21.4 add button input textarea label
```

### `theme:import <create URL | code> <name>`

About 40 lines, prototyped in T8.

1. Take `preset` from the URL (or the bare code). Check it with `shadcn preset decode <code> --json`.
2. In `os.tmpdir()`, create a stub project:
   - `package.json` listing `next` and `tailwindcss` (nothing installed);
   - an empty `next.config.mjs`;
   - `tsconfig.json` with `@/*` paths;
   - `app/layout.tsx`;
   - `components.json`;
   - `globals.css` containing `@import "tailwindcss";`.
3. Run the installed CLI there: `shadcn apply <code> --only theme -y -s`.
4. Copy the `:root {…}` and `.dark {…}` bodies into `themes/<name>.css` as `:root[data-theme="<name>"]` and `:root[data-theme="<name>"].dark`.
   - Specificity (0,2,0) and (0,3,0) beat `:root` / `.dark`.
5. Regenerate `themes/index.css`, add the entry to `themes.json`, and delete the stub.

### `theme:apply <name | code | create URL>`

Resolve a name through `themes.json`, then run `shadcn apply <code> --only theme -y` with `cwd: apps/web`, then print `git diff --stat`.

### Preview switch

`?theme=<name>` sets a `bearing-theme` cookie; `?theme=default` clears it.

- The root layout reads the cookie with `await cookies()` [25], only when `process.env.VERCEL_ENV !== "production"`. It renders `data-theme` on `<html>` server-side, so there's no flash.
- next-themes only touches `<html>`'s `class` when `attribute="class"` [19], so the two attributes don't collide.
- No user-facing UI and no database column; this is a review tool.

### Moving the existing UI, in order (one PR each)

1. **Foundation, no visual change intended.**
   - Do the layout above and apply Bearing's default preset.
   - Wrap every rule left in `apps/web/app/globals.css` in `@layer base` [18].
   - Rename its tokens to shadcn's: `--muted` (text) → `var(--muted-foreground)`, `--line` → `var(--border)`, `--accent` (brand) → `var(--primary)`. Delete Bearing's `:root` and `@media (prefers-color-scheme: dark)` token blocks; next-themes `system` replaces the media query.
   - Delete the starter `button.tsx`, `card.tsx` and `code.tsx`.
   - Check: `next build` passes and the Tasks, Inbox, Coach and sign-in screens look as before in light and dark.
2. **Theme tooling:** the two scripts, `themes/`, `themes.json` with `bearing`, and the preview switch.
3. **Header and sign-in:** shadcn `Button` and `Input`/`Label` (`Field` where it fits). Remove the matching element rules from `globals.css`.
4. **Tasks (Priority List rows) and Inbox (Draft rows):** Button variants for complete/move, `Textarea`/`Input`. Keep row layout in app code (`apps/web`), not in `packages/ui` (C1, C3).
5. **Coach thread and composer:** `Input`/`Textarea`, `Button`. Consider shadcn's chat components only if they fit `useChat` (not evaluated here).
6. **Clean-up:** remove whatever element CSS is left.

## What Build must not reinvent

- **Theme tooling:**
  - Preset encoding and decoding: `shadcn preset decode|url`, `shadcn/preset` [6][8].
  - Applying or reverting a theme: `shadcn apply --only theme`. Never hand-edit the `:root`/`.dark` blocks the CLI manages [9][10].
  - Theme CSS generation: `theme:import` runs the CLI and copies its output. It must not call `ui.shadcn.com/init` or rebuild colour scales itself.
- **Components and wiring:**
  - Component source and monorepo routing: `shadcn add` from `apps/web` [2].
  - Light/dark: next-themes with `attribute="class"` [4]. No custom toggle script or `prefers-color-scheme` CSS.
  - `cn`: the `cn` package via `@repo/ui/lib/utils` [23]. No local clsx + tailwind-merge helper.
- **Not needed:**
  - A registry, `shadcn build`, or a theme server for Bearing's own app [14].
  - A Tailwind config file: Tailwind v4 is CSS-first, and shadcn needs `tailwind.config` empty [2][11].

## Sources

All checked 2026-10-08.

1. `shadcn` on the npm registry (4.21.4 `latest`, modified 2026-10-07T11:12Z; `engines.node >=20.18.1`; `exports` incl. `./preset`, `./tailwind.css`). https://registry.npmjs.org/shadcn
2. shadcn/ui docs, Monorepo. https://ui.shadcn.com/docs/monorepo
3. shadcn/ui docs, CLI (`apply`, `--only theme|font`). https://ui.shadcn.com/docs/cli
4. shadcn/ui docs, Dark mode: Next.js (next-themes, `attribute="class"`). https://ui.shadcn.com/docs/dark-mode/next
5. shadcn/create page, and its source `apps/v4/app/(app)/(create)/components/{project-form,share-button,copy-preset}.tsx` at tag `shadcn@4.21.4`. https://ui.shadcn.com/create
6. shadcn CLI source at tag `shadcn@4.21.4` (commit 3464245, 2026-10-07): `packages/shadcn/src/commands/{apply,init,preset}.ts`, `src/preset/{presets,defaults}.ts`, `src/templates/next.ts`, `packages/registry/src/preset/preset.ts`, `src/registry/add.ts`, `src/utils/updaters/update-css-vars.ts`. https://github.com/shadcn-ui/ui/tree/shadcn%404.21.4/packages
7. Preset fields and value lists: `packages/registry/src/preset/preset.ts`. https://github.com/shadcn-ui/ui/blob/shadcn%404.21.4/packages/registry/src/preset/preset.ts
8. shadcn changelog, April 2026: shadcn preset. https://ui.shadcn.com/docs/changelog/2026-04-preset-commands
9. shadcn changelog, April 2026: shadcn apply. https://ui.shadcn.com/docs/changelog/2026-04-shadcn-apply
10. shadcn changelog, April 2026: Partial Preset Apply. https://ui.shadcn.com/docs/changelog/2026-04-partial-preset-apply
11. shadcn/ui docs, Tailwind v4 and components.json. https://ui.shadcn.com/docs/tailwind-v4 and https://ui.shadcn.com/docs/components-json
12. shadcn-ui/ui issue #10093 (open): "init --preset -c apps/web creates duplicate lib/utils.ts, ignores workspace alias". https://github.com/shadcn-ui/ui/issues/10093
13. shadcn changelog, July 2026: Base UI as the Default. https://ui.shadcn.com/docs/changelog/2026-07-base-ui-default
14. shadcn/ui docs, Registry and registry-item.json (`registry:theme`, `registry:base`). https://ui.shadcn.com/docs/registry and https://ui.shadcn.com/docs/registry/registry-item-json
15. shadcn changelog, June 2026: GitHub Registries (no `shadcn build` needed). https://ui.shadcn.com/docs/changelog/2026-06-github-registries
16. shadcn changelog, August 2026: Private GitHub Registries (via `gh`). https://ui.shadcn.com/docs/changelog/2026-08-private-github-registries
17. W3C, CSS Cascading and Inheritance Level 5, cascade layers (unlayered beats layered). https://www.w3.org/TR/css-cascade-5/
18. Tailwind CSS docs, Adding custom styles (`@layer base`). https://tailwindcss.com/docs/adding-custom-styles
19. next-themes 0.4.6, README (`attribute`, `themes`, `value`) and registry (modified 2025-03-11). https://github.com/pacocoursey/next-themes and https://registry.npmjs.org/next-themes
20. shadcn changelog, July 2026: React Aria. https://ui.shadcn.com/docs/changelog/2026-07-react-aria
21. shadcn changelog, December 2025: `npx shadcn create` (style descriptions). https://ui.shadcn.com/docs/changelog/2025-12-shadcn-create
22. npm registry, `latest` of tailwindcss 4.3.3, @tailwindcss/postcss 4.3.3, @base-ui/react 1.8.0, class-variance-authority 0.7.1, cn 0.4.0, tw-animate-css 1.4.0, lucide-react 1.53.0, next-themes 0.4.6. https://registry.npmjs.org/
23. shadcn changelog, September 2026: cn. https://ui.shadcn.com/docs/changelog/2026-09-cn
24. shadcn `templates/next-monorepo` (tsconfig `paths`, `transpilePackages`, postcss re-export). https://github.com/shadcn-ui/ui/tree/main/templates/next-monorepo
25. Next.js docs, `cookies()` (async) and `transpilePackages`. https://nextjs.org/docs/app/api-reference/functions/cookies and https://nextjs.org/docs/app/api-reference/config/next-config-js/transpilePackages
