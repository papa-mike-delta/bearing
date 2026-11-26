# Bearing — V1 redesign product and architecture contract

Status: **Approved product decisions / proposed technical implementation**  
Source: product interview Q1–Q95, finalized 2026-10-24.  
Scope: greenfield redesign on the existing Next.js/PostgreSQL foundation. Existing demo data may be discarded. **No destructive changes to the deployed environment are authorized by this document.**

## Product principle

> Bearing captures, organizes, connects, and recalls information about a person's life. It does not try to replace specialized applications.

Build opinionated software for an audience of one **while retaining proper multi-user support**. Prioritize ease of capture, trustworthy retrieval, useful relationships, privacy, portability, and consistent cross-view behavior. Make structured fields available, not compulsory.

Other non-negotiables:
- Every user owns their own private data; no cross-account sharing in V1.
- AI reads are comparatively permissive; all AI writes require review and approval of a clear change set.
- Do not quietly reclassify, rewrite, reschedule, or overwrite user-provided information.
- Complete workflows and verify them end-to-end instead of celebrating a collection of new forms.
- Reuse proven components and domain protections; replace the old ontology and obsolete marketing claims.
- Be honest on the landing page about what is shipped and what is only planned.

## V1: navigation and views

- `/`: public landing page; feature claims match implementation.
- `/login`: sign-in and **invitation-controlled** registration.
- `/app` -> `/app/today`.
- `/app/today`: opinionated daily overview; startup view may be changed.
- `/app/journal`: chronological Daily Log, defaulting to today, navigable by date.
- `/app/inbox`: raw captures, unresolved references, and pending organization suggestions.
- `/app/projects`: flexible curated workspaces, including ongoing ones.
- `/app/library`: Notes, Goals, Habits, People, Bookmarks and other persistent Items.
- `/app/calendar`: date projection; Agenda is another projection of the same data.
- `/app/coach`: conversational read/organize experience.
- Graph is an explorer available within the product, not necessarily a top-level sidebar item.
- Universal keyword search covers structured Items, Projects, Journal moments and Reviews, with filters and relationship navigation.

**Views must not duplicate source records:** Today, Journal, Calendar, Agenda, Library, Graph, People profiles, Project pages and Search are perspectives on the same entities.

## Information model

### Entities users understand

1. **Item** — durable thing you want to manage or remember.
2. **Project** — curated workspace; does **not** need an outcome or end date. Each Item has **at most one** primary Project; other relationships use Links.
3. **Area** — enduring life responsibility, implemented as a classified Tag; zero or more direct Areas per Item and Project.
4. **Tag** — flexible topic label. Tags and Areas can both apply to Items and Projects.
5. **Activity** — timestamped observation/completion (mood, Habit, Focus, symptom, relevant Task completion).
6. **Journal moment** — timestamped freeform capture or reference to a durable Item, preserving context.
7. **Review** — optional guided daily, weekly, monthly reflection.
8. **Link** — meaningful directed relationship between Items, not a duplicate of foreign-key membership.
9. **Conversation / proposed change set** — Coach dialogue and auditable, approval-gated writes.

A Project's Areas are displayed as **inherited**, not copied to its Item children. An Item's effective Areas are its explicit Areas union its primary Project's Areas. Explain provenance in the UI. No Area, Project or Tag assignment is mandatory.

### Core Item types (V1)

| Core type | Form/template variants | Boundary |
|---|---|---|
| Task | to-do, milestone, checklist | actionable obligation; optional rich-text checklists |
| Note | note, idea, vision, affirmation, long-form writing | variants are **templates**, not tables |
| Habit | habit, **routine** | Routine = a Habit with a **simple Markdown checklist** in its description, not a separate Item type |
| Event | appointment, meeting, occasion | actual start/end; birthdays derive from People |
| Goal | personal outcome | simple definition/status/target date/links; no OKR engine |
| Person | contact, **Me** | rich profile with related Notes, Tasks, Journal mentions and Bookmarks |
| Bookmark | **Media**, **Place**, **Web**, **File** | lightweight external reference, not Goodreads/Foursquare/file storage |

**No Finance Item.** Financial obligations are Tasks, goals are Goals, resources are Bookmarks. No transaction ledger.

**Health in V1 is lightweight:** personal medical/medication reference information belongs in Notes or appropriate templates **linked to the dedicated self-Person ("Me")**; health appointments are Events, care Tasks remain Tasks, symptoms can be Activity observations. No medical advice, dosing engine or extensive health dashboard. **Me** is an ordinary Person-shaped, user-owned profile with protected self identity, not a Project and not an account-wide dumping ground for unstructured data.

A user has one canonical Me profile. Link relevant semi-permanent information to it; do not duplicate identity and health properties across the account and arbitrary Person records.

### Bookmark categories

- `media` — title, media format, optional creator, URL, notes.
- `place` — name, optional address, coordinates, website/maps URL, notes; prominent **Navigate** action.
- `web` — title, URL, notes.
- `file` — name, external URL/reference and notes; no uploads in V1.

Keep media format vocabulary extensible: book, audiobook, comic, manga, graphic novel, article, research paper, movie, TV series, documentary, video, album, song, podcast, game, course, lecture, tutorial and other. **Classification, not separate mini-apps**; no episode tracking, complicated progress/rating systems or provider integrations in V1.

One-tap GPS coordinates in Quick Capture require an explicit user gesture and browser permission. Capture coordinates even if place-name resolution fails. A saved Place is primarily for quickly opening navigation; **do not implement visit-history tracking or a location social network**. A Journal moment can mention/link the Place.

### Task contract

- Status: `inbox`, `todo`, `in_progress`, `delegated`, `done`, `archived`.
- `delegated` is a distinct stored status but INCLUDED in “In Progress” filtering.
- Priority: integer `-2..2`, default `0`, used for sorting; advanced autosorting is **V2**.
- Optional fields: due date, scheduled start, Project, direct Areas, Tags, rich text, Markdown checklists, delegation Person, follow-up date.
- Checklists are simple interactive Markdown checkboxes inside content; optionally promote a checkbox to a real Task. Do not create an Item per checkbox.
- Distinguish a due deadline from scheduled work and from an Event's actual time range.
- Overdue Tasks remain overdue; never silently move their dates.
- Recurrence: fixed calendar schedules **and** intervals from completion. Preserve completed instances/history. Correctly handle timezone and daylight saving; creation of subsequent occurrence must be idempotent.

### Habit / Routine contract

- Simple completion, optionally with a measured quantity.
- Routine is a Habit template with embedded markdown checkboxes. Steps are **not** automatic child Habits/Tasks.
- The completion of a Habit and the ticked state of a checklist step are different facts; don't infer one from the other.
- A clear reset policy for routine checkboxes between occurrences is an implementation detail: display an instance snapshot per occurrence so checkmarks from yesterday do not leak into today.
- Focus Timer **stays**. Log completed sessions as Activity, with optional Task/Habit reference; don't rely solely on browser-only daily statistics.

### Daily Journal contract

The Daily Log is a **first-class experience**, not just a Note template. Each date has a virtual page (no empty row required). It supports:
- timestamped interstitial moments (actual `occurredAt`, distinct from creation time);
- freeform long writing and terse rapid logging;
- `/task`, `/mood`, `/place`, and comparable optional capture shortcuts;
- Quick Capture of Notes, Actions, Moods, Events, People, Places and Bookmarks without forcing classification;
- references to actual Items instead of cloning their contents;
- selected automatic projections of check-ins, completed Tasks/Habits and Focus sessions, with visibility switches;
- separate planned/upcoming section rather than implying plans already happened.

Do not auto-include edits, retags, Coach searches, or every system mutation in the Journal timeline. A Journal moment may be just a moment and not a standalone Item.

**Journal != Check-in != Reflection**:
- Check-in = repeatable timestamped Activity; mood/energy 1..5, multiple per day.
- Journal = lived chronological context.
- Reflection = optional structured daily/weekly/monthly Review with prompts (wins, challenges, learnings, gratitude, priorities, notes).

### People and connections

- A Person profile is a generated rich view: contact details, dates, relationship, linked Items, Journal mentions, follow-up Tasks, and confirmed interaction history.
- Mentions, real interactions and intended follow-ups are distinct. Do not treat a mention as evidence of contact.
- Gentle opt-in relationship nudges only; no CRM scoring.
- Typed Links should represent semantic relations, not duplicate Item-to-Project, Tag, Activity or Review associations already present.

## Coach V1

Replace the manual JSON tool panel with conversational reading and organization while retaining server-side enforcement, actor audit and optimistic concurrency:
- Build on **Vercel AI SDK** with pluggable OpenRouter or Vercel AI Gateway provider; credentials live server-side.
- Internal search/reads, follow-up clarification and source-grounded answers in V1; external research is a later phase.
- For vague captures propose a classification, titles, Area/Tag/Project, Person connections and related records. Ask for missing high-value titles instead of guessing.
- When unresolved, retain the original and optionally **propose** a research Task. It is saved immediately only when this account has opted in to the create-one-open-Task trust pattern; otherwise it waits for approval.
- Batch logically related proposed writes in one editable approval card. A fresh Coach proposal is saved without that card only when the whole batch is exactly one opted-in trust pattern. Restoring a backup turns those patterns off until the account opts in again. Apply transactionally or present clear partial-failure reconciliation; do not silently claim success.
- Allow proposing create/update/archive/link; show and double-check especially destructive changes.
- Conversations persist by default, with temporary mode. Chat history is not implicitly Journal content.
- Bearing structured records are authoritative. Additional remembered preferences are inspectable, editable and deletable.
- Authorized internal reads are broadly available, but external model calls must minimize personal information transmitted and disclose provider use. No external internet research tools in V1.

## Storage / API design rules

- PostgreSQL + Prisma: canonical indexed scalar fields for identity, dates/status and relationships; **JSONB with versioned validation** for subtype-specific metadata, not arbitrary JSON strings.
- Multi-user isolation and server-side authorization on every read/write, including search, Coach and offline sync.
- Formalize typed DTOs and runtime validation for each Item kind/template; UI, API and Coach consume the **same contract**.
- Unique ID for every record and explicit ownership; timestamps are UTC instants plus a user timezone where a local calendar rule is intended.
- `Event.startAt/endAt`, Task due/scheduled, birth dates, Journal occurredAt and Activity occurredAt must all be represented correctly in Calendar and Agenda.
- Keep optimistic concurrency, durable operation receipts, audit and write authorization from the existing system.
- Project is optional and singular, Areas many-to-many on Items and Projects, Person/Me linkage is explicit.
- No attachments in V1; external links only. No dedicated Finance subsystem. No notification delivery in V1; dates and relevant badges remain visible in the UI.

## Offline capture

- This is a **required V1 feature**, not merely editor draft storage.
- PWA caches a minimal authenticated app shell capable of starting Quick Capture and the Daily Journal without connectivity after a prior authenticated visit.
- Text-only capture is stored in per-account **IndexedDB** durable outbox with a client-generated idempotency key, local capture time and optional intended type.
- On reconnection, sync automatically, idempotently and in account context. A queued entry is not removed until the server acknowledges it.
- Show pending/synced/failed states; preserve unresolved errors for retry; do not leak one account's offline queue to another. On logout, explain pending entries and protect them.
- No expectation of fully offline Item editing or rich AI assistance.

## Deployment and launch

- Vercel Hobby and external PostgreSQL; private data belongs to the account, not the browser installation.
- Multi-user support and invitation-only registration. No collaboration or sharing in V1.
- Optional, per-user demo data created against the **new schema**, clearly removable.
- Public landing page stays at `/`, app under `/app/*`; truthful product showcase for curious users, not a paywall or generic SaaS funnel.
- Update README, docs, setup, PWA manifest, metadata/schema.org, feature claims, screenshots and all landing-page copy as a **V1 release condition**.
- Export/backup must cover the complete new user data model including association and history records, and restoration must be tested.

## Acceptance journeys (release blockers)

1. Authenticated new user receives isolated empty data; invitation required to register.
2. Open PWA with no network after prior login, capture text in Journal, reconnect, observe **exactly one** persisted moment; no loss or cross-account leakage.
3. Create Task from Journal, update status elsewhere, observe the single Item reflected in Journal, Today, Search and Project.
4. Attach one Task to one Project; inherit Project Areas while showing direct vs inherited Areas.
5. Add rich-text checklist to Task; promote an individual step without creating duplicate Tasks.
6. Create a Habit from the Routine template with checklist, tick steps and complete the Habit; verify independent state and fresh instance next period.
7. Save a Place using GPS and open navigation in external Maps, without requiring a named venue.
8. Save a Book Bookmark with a chosen media format and creator; no media tracker required.
9. Create a Person, link Journal mention, Book and follow-up Task; a mere mention must not update the last interaction.
10. View Me, save a health-related Note or medication reference linked to Me; no accidental exposure to other users.
11. Make multiple mood check-ins in one day, then a separate structured Reflection.
12. Run Focus Timer, record a completed Activity, find it in Journal with no duplicate session.
13. Create recurring Task on fixed date and after-completion interval; no silent date rollover or lost completion history.
14. Search the same record across Library, Calendar/Agenda when dated, and Graph when linked.
15. Ask Coach about an existing Item; see evidence. Coach proposes multiple changes, user approves, server applies and audits. Rejection writes nothing.
16. Export, clear and restore full data; verify ownership, history, associations, Journal and Reviews.
17. Check all landing-page promises against real behavior; run unit, integration and Playwright journeys.

## Not in V1

- Finance Item/transaction accounting.
- External web research via Coach; external API integration and GoodReads-like media tracking.
- Foursquare-like visit logging; continuous location tracking.
- Full offline editor/sync of every data type.
- Uploaded file hosting; cross-user collaboration; public open registration.
- Advanced Task autosorting, dashboards/OKRs, full health analytics, autonomous AI writes or precise push notification infrastructure.
