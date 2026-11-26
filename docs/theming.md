# Theme overrides

The override flow follows ADR-0003. `ThemeOverride` is the shared boundary for
parsing CSS, JSON, or a shadcn/create URL, validating custom properties, and
serializing light and dark variable maps. It keeps the extended variable surface
(including chart, sidebar, font, radius, and shadow variables).

The generate script writes `src/app/theme-override.css`, imported after
`globals.css`. The authenticated settings route stores normalized maps in the
existing `Setting` model under `theme-<userId>`. A separate key avoids overwriting
other preferences during an import; no schema change is needed. The app loads
the stored override after the generated stylesheet and updates it immediately
after import. The existing Light/Dark/System control chooses the variant.

Only custom properties are serialized. Other rules and imports in an exported
stylesheet are discarded. Variable names and values are validated before saving
and when loading stored data. URL imports accept only HTTPS `ui.shadcn.com/create`
URLs (or its `/init` export endpoint); redirects are refused.

Generate a deployment default:

```sh
npm run theme:generate -- 'https://ui.shadcn.com/create?theme=blue&baseColor=neutral'
```

The create URL's query parameters are passed to shadcn's `/init` JSON endpoint.
Restart the development server or rebuild after generating. The script never
writes `globals.css`.

In Settings → Appearance, choose a shipped preset or the full set of
ui.shadcn.com/create options (base, style, base color, the expanded theme and
chart colors, icon library, font, heading, radius, menu accent, menu color,
direction, and pointer). **Apply** posts that choice through the same import
used for a pasted create URL, exported CSS, or JSON. A preset id is sent as
`preset:<id>`. JSON accepts `{ "light": {...}, "dark": {...} }`
or shadcn's `{ "cssVars": { "theme": {...}, "light": {...}, "dark": {...} } }`.
Names may include or omit `--`; both variants must contain variables. The
optional `theme` map provides shared variables. **Reset imported theme** restores
the deployment default. Imported font variables can reference fonts already
available in the app; imports never load external font files or stylesheets.

Tests live at the agreed `ThemeOverride` and settings route seams, with CSS/JSON
fixtures and mocked network responses. Tests never fetch live themes.

## Product colors

Product accents now consume semantic CSS variables, including badges, Item types,
status/priority, domain accents, check-ins, charts, and editor/detail gradients.
Defaults derive from the active `--primary`, `--chart-1`–`--chart-5`, and
`--foreground` palette. A normal shadcn preset needs no additional variables.
The foreground mix keeps default accent text readable in light and dark modes;
custom overrides should be checked against their intended backgrounds.

Optional overrides can use complete CSS color values such as `hsl(...)`,
`oklch(...)`, `color-mix(...)`, and `var(...)`. Existing import validation,
deployment → stored override precedence, and reset behavior remain in place.

| Meaning | Variables |
| --- | --- |
| Item types | `--type-task`, `--type-note`, etc., using each Item type key |
| Life domains | `--domain-mind-soul`, `--domain-time-action`, `--domain-health`, `--domain-wealth`, `--domain-network`, `--domain-growth`, `--domain-creativity`, `--domain-admin` |
| Status | `--status-inbox`, `--status-active`, `--status-done`, `--status-archived`, `--status-snoozed` |
| Priority | `--priority-none`, `--priority-low`, `--priority-medium`, `--priority-high`, `--priority-urgent` |
| Item energy | `--energy-none`, `--energy-low`, `--energy-medium`, `--energy-high` |
| Check-in scales | `--mood-1`–`--mood-5`, `--checkin-energy-1`–`--checkin-energy-5` |
| Chart series | `--mood-series`, `--energy-series` |
| Financial direction | `--income`, `--expense` |
| General feedback | `--success`, `--warning`, `--info` |

For example, a JSON import may include:

```json
{
  "light": { "type-task": "hsl(210 70% 35%)", "income": "oklch(0.4 0.1 150)" },
  "dark": { "type-task": "hsl(210 70% 75%)", "income": "oklch(0.8 0.1 150)" }
}
```

`product-colors.ts` owns Item/domain/project color resolution and the
`colorWithAlpha`/`colorGradient` helpers. Consumers must never append hex opacity
suffixes: a color may be a CSS variable or a non-hex function. Tints and gradients
use `color-mix`, including for explicit user colors.

### Project overrides

Apply database migrations before serving this release (`npx prisma migrate deploy`).
The project color column is nullable with no default. The migration does not
rewrite any existing color, including the former `#71717a` default.

New projects use **Use theme default**. The project editor lets users keep/select
an explicit swatch or custom hex color, or remove it with **Use theme default**.
The effective color resolves as:

1. Valid explicit project color.
2. The owning project's domain semantic token, when available.
3. The displayed Item's type token, when available.
4. The primary theme token.

Project reads used with Items include the project's own domain key so inheritance
never accidentally uses the Item's domain. The resolver returns CSS references;
theme changes apply immediately without persisting computed values. Updating an
override refreshes reads that embed project colors, including graph and calendar.

POST omission or `null` creates an inherited color. PATCH omission preserves the
existing override; `null` clears it. Explicit overrides accept portable 3/4/6/8-digit
hex colors. Backups remain version 1, preserve explicit and null colors, and accept
legacy projects without a color field (which now inherit).

### Intentional fixed-color inventory

- Project swatches, stored project overrides, and seeded example project overrides
  represent explicit user choices and remain fixed.
- Tags keep their persisted colors; they are user labels rather than product state.
- Built-in domain seed colors no longer determine their appearance: known domain
  keys resolve to semantic tokens. Custom domain colors remain explicit fallbacks.
- QR codes retain fixed dark-on-white colors for scanner reliability.
- Public login marketing accents are outside the signed-in product color system.

Validation includes unit/API tests for resolver precedence and omitted/null values,
PostgreSQL migration/backup checks, and browser theme import/reset plus project
create/edit/reload flows. Browser screenshots cover Projects, Item detail and mood
in light and dark modes, alongside Agenda checks.
