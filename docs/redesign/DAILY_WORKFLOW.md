# Capture → organize → recall (#45)

This slice builds on #44 and reuses the existing Next.js app, shadcn primitives,
semantic theme layer, Lucide icons, rich-text editor, draft owner, revision errors
and editor-lease lifecycle. It does not replace the repository or create another
application framework. The pre-V1 shell has been removed ([ADR 0006](../adr/0006-one-schema-one-runtime.md)).

## Routes and daily use

`/app` redirects to the account's startup preference
(default `/app/today`). Today, Journal, Inbox, Projects, Library, Calendar, Search,
Coach lookup, Settings and Review results have real `/app/*` URLs. Item and Project
links address canonical records; Search can deep-link to a particular Journal
moment/Activity and local date. Public `/` and authentication routes remain intact.

Today shows overdue Tasks with their original deadlines, In Progress including
Delegated, and the day's Event plans, scheduled work and due dates. It never treats
plans as evidence that something happened. Calendar/Agenda use the same Item ids.

The Daily Journal is a virtual local-date page. Browsing a date writes nothing.
It supports rapid text and the existing rich Markdown editor, explicit backdating,
editing with retained session drafts, and optionally projected Activity. Occurred
instants, original device capture time, server creation time, calendar date and
IANA timezone remain distinct. DST gaps are refused rather than silently changing
a manually entered time; ambiguous times use the earlier instant.

Quick Capture is available from every view and via Ctrl/⌘+K; Ctrl/⌘+Enter saves.
Plain text requires no title, Project, Area or Tag. Original whitespace is kept.
Complete explicit shortcuts create a referenced Item or Activity in the same
transaction: `/task Title`, `/note Title`, `/place Name`, `/mood 4 energy 3`.
Incomplete or unknown commands remain raw Journal/Inbox entries for clarification.
Place navigation/geolocation and connected-life forms are documented in
[CONNECTED_LIFE.md](CONNECTED_LIFE.md) (#46).

Inbox preserves original text while allowing Task/Note promotion or keeping a
Journal-only entry. Repeating promotion cannot create another Item. Every view
resolves the same Task identity, so title, status and content changes propagate.
The existing draft owner lives at the signed-in layout, so Item, Journal and unsent capture drafts survive URL navigation for that account session. Sign-out clears these unsaved editor drafts; acknowledged or pending device captures remain in the outbox. Task description checkboxes are Markdown, not child records. Explicit promotion
creates one Task, replaces that checkbox with a canonical link, and commits the
parent update, child creation and audit atomically. Stable promotion keys make a
lost acknowledgment/retry safe.

Item/Project selectors show direct Areas and inherited Project Areas separately.
Changing a Project's Areas changes filtering without copying assignments to Items.
The existing theme importer, reset and light/dark/system controls remain available.

Search is literal keyword lookup over Item text/typed metadata, Projects, Journal,
Reviews, Activity and Tags/Areas, with kind, Area and Project filters. Authorization
is applied before results are returned. There are up to 50 matches per category;
there is no embedding/model call. `/app/search` exposes keyword lookup. Conversational Coach, grounded tools and
approval proposals are documented in [CONVERSATIONAL_COACH.md](CONVERSATIONAL_COACH.md) (#47).

## Offline shell and account boundary

An authenticated V1 visit registers a service worker and prepares a small static
Journal/capture shell. It caches only `offline.html`, its CSS/modules and the logo.
It never caches authenticated HTML, React server-component responses, API records,
search results or session responses. A full offline navigation to `/app` or any
`/app/*` path uses that static shell. An explicit link also opens the device Journal.

The shell supports text capture and the local capture log after a prior verified
visit, until the remembered session expires. It does not promise the entire online
Journal archive, structured editing, AI or research while offline. Opening offline
without an active account context shows a sign-in message and no local entries.

Both shells use the same IndexedDB outbox. Each entry has an owner, immutable client
key, original text, capturedAt, occurredAt, timezone, optional intended type,
pending/error/synced status, attempts and server acknowledgment. Text is cleared
from the composer only after the IndexedDB transaction commits. A server refusal
or network/acknowledgment failure retains the entry for retry. Background reconnect
sync handles pending entries; explicit Retry also retries refused entries.

Before syncing, the client verifies the current signed-in identity. Every upload
also sends an expected-account header; the server rejects a mismatched cookie
before writing. This closes the race between identity verification and account
switch. Capture writes are serialized with the existing audit lock and identified
by the immutable client key and original input hash. A successful retry returns the
same record even after later Journal edits/organization.

Cross-tab account changes lock the former account's local context and clear its
in-memory query/draft session. Sign-out explains the unsynced count and offers to
retain device captures or stay signed in. Retained entries do not sync into another
account; signing back into the original account resumes them. Offline locking is a
device action, not a claim to have revoked a server cookie without a connection.
Browser IndexedDB is device storage, not an encrypted vault; app locking isolates
what the UI displays, rather than protecting against a person inspecting browser
storage with developer tools. No session tokens are copied into IndexedDB.

A content hash versions the offline asset cache during build. Updating an offline
module or worker produces a new cache version; activation removes prior Bearing
capture caches. The build does not deploy a database migration.

## Persistence, deployment and validation

`20261025010000_capture_identity` adds `capturedAt` and `ingestHash` only to the V1
Journal table, backfilling old capture times from createdAt. #44's backup includes
these fields, while older V1 backups default capturedAt to the original createdAt.
Promotion replay keys live in account Preferences and participate in backup/reset.
The V1 migration remains separate from `build:vercel` and requires the reviewed V1
deployment command documented in DATA_FOUNDATIONS.md. No production migration or
reset is authorized or run by implementing this slice.

Unit checks exercise shortcut parsing, clocks/DST, Markdown task handling, durable
IndexedDB states, missing/lost acknowledgments, retry behavior and account locks.
Real PostgreSQL tests exercise capture concurrency, composed receipts/rollback,
organization, canonical references, promotion, literal keyword search/filters and
cross-account refusal. Playwright covers desktop and emulated phone capture,
organization, checklist editing/promotion, Projects/Areas, startup URLs, offline
launch/reload/reconnect, error retry, account switch and explicit sign-out locking.
Native Safari, installed-PWA eviction behavior and assistive-technology certification
remain part of release validation in #48.

For local browser verification, migrate/seed a **disposable** test database first,
install Playwright's Chromium/WebKit browsers, then run
`TEST_DATABASE_URL=postgresql://… npm run test:e2e`. This tree does not contain the pre-V1 shell.
