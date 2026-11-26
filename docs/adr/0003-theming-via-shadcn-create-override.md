# Theming via shadcn/create with an override layer

We port the full Bearing theming system: a generate script that pulls from ui.shadcn.com/create, preset import, light/dark variants, and the extended variable surface. Users import a theme from a settings page (URL or exported CSS/JSON). The import writes an override layer so the base globals.css stays clean.

This gives a much larger and more maintainable variable set than the default shadcn presets while keeping the Tailwind v4 CSS-variable plumbing that already exists. The work is low-to-medium and can proceed in parallel with the rigor layer; it does not block the Coach.
