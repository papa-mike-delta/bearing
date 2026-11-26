# Readable metadata and touch layouts

The signed-in application uses `text-xs` (0.75rem / 12px at the default root size)
as its metadata floor. Dates, tags, progress, counts, control labels, chart ticks
and tooltips previously using 8–11px now follow this floor. There are no retained
11px exceptions. Existing larger body and title styles remain in place.

The shell's `bearing-app` class scopes a shared policy in `globals.css`.
At widths below 768px **or** with a coarse pointer, interactive controls have
minimum 44×44 CSS-pixel layout bounds. The rule covers native controls, button-like
roles, links, navigation, editor/detail controls and popover/select/menu portals.
Shared Button and dialog/sheet close controls also carry `touch-target` so they
work outside the shell. Range inputs receive a 44px height. These are real layout
bounds, not overlapping pseudo-elements; icon drawings may remain small.
Selection checkboxes and switch tracks keep their compact drawings inside the
expanded targets. Fine-pointer desktop controls retain their existing compact sizes.

The mobile input font floor is 16px to prevent automatic iOS focus zoom. Relative
font units continue to respect user font scaling. Keyboard focus has an explicit
outline, and Item titles are real keyboard-operable buttons; their clicks do not
also activate the surrounding card. Existing completion actions stop propagation.
Link removal is visible on touch layouts and on keyboard focus within its row.

## Reflow changes

- Inbox selection, Item content and actions reflow instead of compressing into one
  row. Titles, project labels and long tags wrap; action targets remain separate.
- Item editor organization/status fields stack on narrow screens. Select triggers
  are constrained to their grid cells, and popup options can wrap.
- Journal metadata, mood buttons and action groups wrap. Detail reading controls
  wrap without hiding progress or Link actions.
- Dialogs have a viewport-based maximum height and a scrollable content path.
  Header text reserves room for the expanded close target.
- Navigation's scroll area can shrink inside the drawer, keeping Settings and
  Sign out reachable even after the navigation controls grow.
- Settings rows, segmented controls and shared section headers wrap as needed.
- Calendar's seven-column grid scrolls inside its own panel; Agenda's week strip
  scrolls locally. Neither forces horizontal scrolling of the whole application.
- Search and its popover fit narrow screens; Quick Capture retains its accessible
  name when its visual label is hidden.

## Validation

`e2e/readable-touch.mobile.spec.ts` checks 320px, 375px and 640px layouts. The 640px
case covers the effective CSS width of a 1280px desktop viewport at 200% zoom;
it is a reflow-equivalent check rather than a claim of native browser zoom.
Tests measure control bounds and computed text sizes, check for overlapping
reachable targets and application overflow, and exercise edit, archive, Link
removal, reading progress and keyboard Item navigation. Checks include long Item
titles/tags, project dialogs, Agenda, Projects, Insights, Settings and the full
journal editor. Screenshots support visual review. Existing mobile Inbox and
Item draft/write regressions remain relevant and are run separately.

The touch sizing and typography work does not change the saved data model,
explicit-save/draft policy, lease timing or browser write outcome handling.
