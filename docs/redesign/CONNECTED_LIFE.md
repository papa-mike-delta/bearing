# Connected life (#46)

This slice extends the opt-in V1 workflow from #44/#45. It reuses the existing
Next.js app, rich editor, draft owner, expected-account request boundary, audited
write transactions, Focus Timer UI and force-directed Graph explorer. The pre-V1
shell and its Focus/Graph data adapters are removed ([ADR 0005](../adr/0005-sunset-legacy-domain-and-coach.md)).
V1 passes workspace data into the shared timer and explorer.
No production migration, database reset or deployment is part of this change.

## People, Me and references

Library can create and edit all seven canonical Item types. Person fields include
email, phone, birthday, relationship and labeled important dates. Person pages
project explicit linked work/references, Journal mentions, planned follow-up Tasks
and confirmed interaction Activity into separate sections. Quick Capture can
mention People, and a profile can link an existing Journal moment. Neither action
fabricates contact. A separate explicit confirmation records an interaction with
an optional note and stable retry identity.

The one protected Me Person is supplied by the existing self-profile relationship.
Health/medication references remain ordinary private Notes linked to Me. No medical
tracking or advice feature is introduced. Tenant-scoped workspace queries and
ownership checks apply to references, moments, activities and graph edges.

Upcoming birthdays/labeled annual dates within 30 days and due follow-up Tasks
appear in Today. These are quiet in-app context, with no scoring, guilt messages,
push notifications or inferred contact frequency.

Bookmark templates are Media, Place, Web and File. Media format is an extensible
text field with suggestions, creator and optional URL; File stores an external
reference/URL. Place stores an optional address or coordinate pair and opens an
explicit external maps navigation URL. GPS is requested only after pressing
“Use my location for a Place” and browser permission. Coordinates go through the
same durable capture outbox, with original text and idempotency identity. Permission
failure retains the text. There is no venue lookup dependency, passive tracking,
visit Activity, upload service or media-progress tracker.

Goals are desired outcomes with existing semantic Links to canonical work.
Connections can be added/removed in Item details and are read by People and Graph.
Tasks retain distinct delegated/in_progress states, optional quantities, delegation
Person, follow-up, due deadline, scheduled work and existing checklist promotion.
Event forms save start/end instants and optional location. Calendar/Agenda continue
projecting these canonical Items once, retaining both due and scheduled labels.

## Habits and Routines

Routine is a Habit template with ordinary Markdown checkboxes in content. No step
creates another Item. The Habit timezone anchors daily, Monday-based weekly or
calendar-month occurrences. The cadence is included in the occurrence key, so
changing cadence cannot collide with a prior occurrence on the same date.

Occurrence drafts are account Preferences keyed by Habit, cadence and period;
they are separate from the template and survive reload. Each captures its Markdown
snapshot, checkbox array, numeric completion value and optimistic revision. A new
period starts unchecked even if the template source contains checked Markdown.
Saving steps does not complete the Habit. “Complete Habit” creates one structured
Activity under the same audit transaction and saves the completed snapshot.
Repeated completion requests return the saved occurrence; conflicting rewrites
are refused. Historical checkmarks/values remain available via the occurrence date.
Today offers the same occurrence controls inside each Habit's expandable section.

No schema migration is needed: existing Preferences, Activity and links provide
storage, and existing V1 backup/restore includes them. Habit completion Activity
adds optional snapshot content/period fields; old Activity remains valid.

## Focus, check-ins and Graph

The Focus component is a reusable timer. V1 supplies tasks, habits and an Activity
completion callback. Presets, custom duration, pause/reset/skip, sound, ring and
optional Task/Habit selection remain. A wall-clock deadline handles background/suspended tabs and
completion occurs outside React state updaters, guarded by a stable session id.
Breaks, reset, skipping and unfinished timers never create completed Focus Activity.
A completed V1 session creates one Focus Activity without silently completing its
Task or Habit. Today statistics come from server Activity rather than browser-only
counters. Pause before leaving the Focus view; unfinished timers are not persisted.

Completed sessions awaiting acknowledgement are retained in per-account device
storage and retried on opening Focus, reconnect, or an explicit Retry. Original
session time/timezone/id survive retries; the expected-account header prevents
upload into another account. Device storage is not an encrypted vault. Storage
failure displays a warning and retains the session in memory while the view stays
open. Sound preference and today's counters stay on this device.

Mood/energy 1–5 check-ins can be recorded repeatedly in Today and are timestamped
Activity. They do not replace Journal text, guided Reviews or prior check-ins.
Activity replay comparisons canonicalize object keys because PostgreSQL JSONB may
return key order differently from an HTTP request.

`/app/graph` reuses the existing force simulation, search, type filter, zoom/pan and
node navigation. Its V1 adapter supplies canonical Items, Projects, semantic links
and Project membership edges. New Person/Bookmark types have filters. Nodes can be
opened with Enter/Space as well as click. Library links to Graph. Focus has its own
`/app/focus` navigation entry. No graph-editing system is introduced.

## Validation

Unit tests cover cadence/timezone boundaries, external navigation, strict mention
versus interaction projection, canonical graph edges, Event midnight boundaries,
calendar deduplication, upcoming dates and JSONB replay comparisons. Disposable
PostgreSQL tests cover capture coordinates, People/Me isolation, canonical linked
work, independent Routine steps/completion, concurrent retries, fresh periods,
Focus idempotency and multiple check-ins separate from Reviews.

`npm run test:e2e` includes `v1-connected.spec.ts` on desktop
Chromium and configured mobile WebKit, alongside existing V1 journeys. The connected
journeys exercise profile creation and mentions, references to Me, Routine reset,
permission-gated coordinates, Focus completion, repeated check-ins, Graph navigation
and canonical Calendar links. Chromium phone emulation is useful local evidence;
it is not a claim of native Safari or screen-reader certification.
