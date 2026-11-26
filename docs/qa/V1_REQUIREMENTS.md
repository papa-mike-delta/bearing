# V1 requirement-by-requirement ledger

Source: closed issues #44–#48, retrieved 2026-10-25. Every original checklist line is preserved, including repeated acceptance criteria. See [acceptance report](V1_ACCEPTANCE.md) for steps, actual outcomes and remaining checks. A source or automated-test match is not a hosted manual pass.

## V1 / 1 — Data foundations, account isolation and canonical schemas

| Requirement | Verification |
| --- | --- |
| 44.1: Build typed, centrally validated core Item types: Task, Note, Habit (Routine **template**), Event, Goal, Person and Bookmark. Use typed PostgreSQL `JSONB` for optional subtype metadata and indexed scalar fields for dates/status/relationships. | See #44 coverage and journey evidence in the report; final hosted acceptance pending. |
| 44.2: Replace hardcoded Life Domains with classified Tags called **Areas**, plus ordinary Tags. Both may attach to Items and Projects. Items have **at most one Project**, zero or more direct Areas, and inherit their Project's Areas for filtering **without copying them**. | See #44 coverage and journey evidence in the report; final hosted acceptance pending. |
| 44.3: Keep Projects as flexible, long-lived curated workspaces; preserve semantic Links without duplicating foreign-key relationships. | See #44 coverage and journey evidence in the report; final hosted acceptance pending. |
| 44.4: Define **one canonical Me Person per account** for semi-permanent self information and health references. Design separate Activity, Journal moment, and structured Review records (these are not Item templates). | See #44 coverage and journey evidence in the report; final hosted acceptance pending. |
| 44.5: Implement Task statuses `inbox/todo/in_progress/delegated/done/archived`, integer priority `-2…2` (default 0); Delegated is a separate status included in “In Progress” filters. Distinguish due date, scheduled work, Event start/end, occurredAt, createdAt and local date/timezone. | See #44 coverage and journey evidence in the report; final hosted acceptance pending. |
| 44.6: Model recurring Tasks with both fixed-calendar schedules and completion-relative intervals, preserving per-occurrence history and idempotent next-occurrence creation. | See #44 coverage and journey evidence in the report; final hosted acceptance pending. |
| 44.7: Keep multi-user support, isolated ownership/authorization on every route and service, strict production session secrets, invite-only registration, and existing audit/revision safety rails. | See #44 coverage and journey evidence in the report; final hosted acceptance pending. |
| 44.8: Define complete user-data export, restore, reset and per-user **optional/removable** demo seeding against the new model. Include every association/history model. | See #44 coverage and journey evidence in the report; final hosted acceptance pending. |
| 44.9: Write unit and integration tests for validity, ownership, 2FA/session protections, Date/Timezone behavior, cross-account isolation, backup/restore and idempotent operations. | See #44 coverage and journey evidence in the report; final hosted acceptance pending. |
| 44.10: Inventory original components for keep/rewrite/remove. Explicitly retire Finance Item; Routine is a Habit+Markdown checklist, **not** a separate entity. | See #44 coverage and journey evidence in the report; final hosted acceptance pending. |
| 44.11: Typed runtime schemas are shared by UI/API/Coach; invalid values fail safely. | See #44 coverage and journey evidence in the report; final hosted acceptance pending. |
| 44.12: All user-scoped relationships/queries are isolation-tested; a second user cannot see another user's records. | See #44 coverage and journey evidence in the report; final hosted acceptance pending. |
| 44.13: Areas inherited via a primary Project are queryable and distinguishable from direct Areas. | See #44 coverage and journey evidence in the report; final hosted acceptance pending. |
| 44.14: One and only one Me Person profile exists per account. | See #44 coverage and journey evidence in the report; final hosted acceptance pending. |
| 44.15: Backup → reset → restore preserves all V1 records, histories and associations. | See #44 coverage and journey evidence in the report; final hosted acceptance pending. |
| 44.16: Clean/demo account can be created without manual data repairs; no unapproved production migration has run. | See #44 coverage and journey evidence in the report; final hosted acceptance pending. |
| 44.17: New model contracts and migration tests pass. | See #44 coverage and journey evidence in the report; final hosted acceptance pending. |

## V1 / 2 — Today, Daily Journal, Quick Capture, Inbox and offline sync

| Requirement | Verification |
| --- | --- |
| 45.1: Introduce real URL routes (`/app` redirects to `/app/today`; Journal, Inbox, Projects, Library, Calendar, Coach have distinct accessible URLs); preserve `/` as public site. | See #45 coverage and journey evidence in the report; final hosted acceptance pending. |
| 45.2: Build opinionated Today view with Task/Agenda context and configurable startup preference. | See #45 coverage and journey evidence in the report; final hosted acceptance pending. |
| 45.3: Make Journal a **first-class chronological Daily Log**, one virtual date page without generating empty daily records. Support rapid/interstitial logging, rich long-form writing, correct timestamps/backdating, and separate planned vs occurred sections. | See #45 coverage and journey evidence in the report; final hosted acceptance pending. |
| 45.4: Freeform-first Quick Capture from anywhere, including Journal; support optional commands `/task`, `/mood`, `/place` etc.; don't require a title, Project, Area or Tag to save an unclassified capture. | See #45 coverage and journey evidence in the report; final hosted acceptance pending. |
| 45.5: Route captures needing organization/clarification to one Inbox; preserve original text and support approval-based AI suggestions later. | See #45 coverage and journey evidence in the report; final hosted acceptance pending. |
| 45.6: Create actual Tasks from Journal without cloning Item data into Journal; changes to Task status are reflected everywhere. | See #45 coverage and journey evidence in the report; final hosted acceptance pending. |
| 45.7: Project and Area selectors with inherited vs direct Area provenance; lightweight interactive Markdown checkbox blocks for Task descriptions. | See #45 coverage and journey evidence in the report; final hosted acceptance pending. |
| 45.8: Build universal **keyword** search over Item, Project, Journal, Review and other applicable records; useful filters, linked navigation, authorization; defer embeddings. | See #45 coverage and journey evidence in the report; final hosted acceptance pending. |
| 45.9: Implement the minimum offline-capable PWA shell: after an authenticated visit, launching offline permits **text-based** Quick Capture and Journal moments. | See #45 coverage and journey evidence in the report; final hosted acceptance pending. |
| 45.10: Persist unsynced per-user captures in IndexedDB (stable client ID/idempotency key, text, capture/occurred time, optional intended type), visibly indicate pending/synced/error states, reconnect and sync automatically. | See #45 coverage and journey evidence in the report; final hosted acceptance pending. |
| 45.11: Retry without duplicates, preserve failed captures, protect other users' local queues, explicitly handle unsynced data on logout/account switch. No AI/research or full structured editor offline in V1. | See #45 coverage and journey evidence in the report; final hosted acceptance pending. |
| 45.12: Offline-open → capture → reconnect → exactly one server record, with no loss under retries/reloads. | See #45 coverage and journey evidence in the report; final hosted acceptance pending. |
| 45.13: A raw one-line entry can be saved, found in the Journal and Inbox, and classified later. | See #45 coverage and journey evidence in the report; final hosted acceptance pending. |
| 45.14: Task created from Journal retains one identity when updated via Today, Inbox, Project or Task detail. | See #45 coverage and journey evidence in the report; final hosted acceptance pending. |
| 45.15: Search returns only authorized results and navigates to real shareable app URLs. | See #45 coverage and journey evidence in the report; final hosted acceptance pending. |
| 45.16: Calendar-date grouping respects local time; occurredAt and createdAt are distinct and backdating works. | See #45 coverage and journey evidence in the report; final hosted acceptance pending. |
| 45.17: Keyboard/touch interaction, offline-state UI and account-switch error paths have Playwright coverage. | See #45 coverage and journey evidence in the report; final hosted acceptance pending. |

## V1 / 3 — Connected life: People, Bookmarks, Habits, Focus and perspectives

| Requirement | Verification |
| --- | --- |
| 46.1: Rich Person profiles aggregating contact details, important dates, **Journal mentions vs confirmed interactions vs planned follow-ups**, linked Tasks, Events, Bookmarks and Places. **Me** is a dedicated Person, not a Project. | See #46 coverage and journey evidence in the report; final hosted acceptance pending. |
| 46.2: Gentle relationship follow-ups and dates shown inside the app; no automated guilt/CRM scoring and no proactive push notifications in V1. | See #46 coverage and journey evidence in the report; final hosted acceptance pending. |
| 46.3: Lightweight Bookmark categories: **Media** (extensible format selection), **Place** (title, optional address/GPS, Navigate in external maps), **Web** (URL), **File** (external URL/reference). No uploads, media-progress system or Place visit log. | See #46 coverage and journey evidence in the report; final hosted acceptance pending. |
| 46.4: Offer on-demand browser geolocation during Quick Capture, with explicit permission and coordinate capture that does not depend on successful nearby-venue lookup. No passive GPS tracking. | See #46 coverage and journey evidence in the report; final hosted acceptance pending. |
| 46.5: Implement Goal as lightweight desired outcome with linked work, not an OKR platform. | See #46 coverage and journey evidence in the report; final hosted acceptance pending. |
| 46.6: Implement Habits with quick completion and optional numeric value, along with **Routine = Habit template containing an ordinary Markdown checklist**. Checkboxes are lightweight content; do not auto-create subtasks or independent Habit Items. | See #46 coverage and journey evidence in the report; final hosted acceptance pending. |
| 46.7: Ensure routine checkboxes have an appropriate per-occurrence/reset behavior distinct from Habit completion. | See #46 coverage and journey evidence in the report; final hosted acceptance pending. |
| 46.8: **Keep** the existing Focus Timer (reuse current code) and persist its completed sessions to structured Activity rather than only browser localStorage. | See #46 coverage and journey evidence in the report; final hosted acceptance pending. |
| 46.9: Allow multiple daily mood/energy check-ins as Activity, separate from Journaling and daily/weekly/monthly guided Reviews. | See #46 coverage and journey evidence in the report; final hosted acceptance pending. |
| 46.10: Preserve the existing basic Graph exploration functionality. Ensure Calendar and Agenda are accurate alternate views over canonical records (including Event start/end and Task due/scheduled data). | See #46 coverage and journey evidence in the report; final hosted acceptance pending. |
| 46.11: Respect Tasks' `in_progress` and `delegated` status rules, optional quantities, rich text, and checklist promotion. | See #46 coverage and journey evidence in the report; final hosted acceptance pending. |
| 46.12: Saved Place opens correct external navigation from mobile and desktop; recording a visit is **not** required. | See #46 coverage and journey evidence in the report; final hosted acceptance pending. |
| 46.13: Media Bookmark accepts various formats with minimal common fields, without a specialized tracker. | See #46 coverage and journey evidence in the report; final hosted acceptance pending. |
| 46.14: Person links to a Journal mention and a Bookmark without fabricating an actual interaction. | See #46 coverage and journey evidence in the report; final hosted acceptance pending. |
| 46.15: Me can display health-reference information linked to the account owner, with no cross-user leakage. | See #46 coverage and journey evidence in the report; final hosted acceptance pending. |
| 46.16: A Routine is stored as a Habit and supports simple checklist content; previous checkmarks do not leak into a new occurrence. | See #46 coverage and journey evidence in the report; final hosted acceptance pending. |
| 46.17: Focus session completion creates one Activity; mood check-ins and Reviews do not overwrite or masquerade as one another. | See #46 coverage and journey evidence in the report; final hosted acceptance pending. |
| 46.18: Graph continues to navigate and filter real relationships; Calendar/Agenda contain no duplicate Item records. | See #46 coverage and journey evidence in the report; final hosted acceptance pending. |

## V1 / 4 — Conversational Coach with grounded reads and approved writes

| Requirement | Verification |
| --- | --- |
| 47.1: Use **Vercel AI SDK** as the tool/streaming abstraction; configurable OpenRouter or Vercel AI Gateway as model gateway; server-side credentials. | See #47 coverage and journey evidence in the report; final hosted acceptance pending. |
| 47.2: Reuse existing tenant-safe search/read, Item, Link, audit, write limits and revision checks. Coach is **an interface to Bearing**, not an independent memory silo. | See #47 coverage and journey evidence in the report; final hosted acceptance pending. |
| 47.3: Natural-language retrieval grounded in existing authorized Items, Journal, Projects, People, Tags/Areas and Links; show source links/record references, admit missing information. | See #47 coverage and journey evidence in the report; final hosted acceptance pending. |
| 47.4: Ask focused clarification questions when title, Person or other identity is ambiguous rather than inventing facts. Propose 2–5 plausible **internal** candidates when supported; **external web research is V2+**, not V1. | See #47 coverage and journey evidence in the report; final hosted acceptance pending. |
| 47.5: Unresolved references persist without generating false certainty; Coach may **propose** a Task to research missing facts (but must await approval). | See #47 coverage and journey evidence in the report; final hosted acceptance pending. |
| 47.6: Propose type, title, Project, Area/Tag, Person/Link and connected entity changes. Preview full batched operation, allow edits/rejection, get explicit approval, then apply atomically (or report and reconcile partial failures). | See #47 coverage and journey evidence in the report; final hosted acceptance pending. |
| 47.7: Support create, edit, link and archive through identical validated service rules; dangerous/destructive writes require explicit confirmation. No silent background write, no cross-account reads. | See #47 coverage and journey evidence in the report; final hosted acceptance pending. |
| 47.8: Persistent-by-default conversations with temporary mode. Editable/deletable preference memory; structured Bearing records are factual authority. Chats don't automatically become Journal moments. | See #47 coverage and journey evidence in the report; final hosted acceptance pending. |
| 47.9: Disclose external model provider use and minimize personal data sent; tests verify provider calls can't silently serialize entire user datastore. | See #47 coverage and journey evidence in the report; final hosted acceptance pending. |
| 47.10: Coach answers a natural-language question using only the caller's data and links to supporting Items. | See #47 coverage and journey evidence in the report; final hosted acceptance pending. |
| 47.11: Ambiguous question results in appropriate clarifications or uncertainty, not hallucinated linked facts. | See #47 coverage and journey evidence in the report; final hosted acceptance pending. |
| 47.12: Coach proposes a related multi-record change set, user edits/approves it, writes happen once with receipts and update relevant views. | See #47 coverage and journey evidence in the report; final hosted acceptance pending. |
| 47.13: Reject proposal produces **no data writes**. | See #47 coverage and journey evidence in the report; final hosted acceptance pending. |
| 47.14: User cannot coerce Coach to read/write another account's data; concurrent changes and open-editor protections are honored. | See #47 coverage and journey evidence in the report; final hosted acceptance pending. |
| 47.15: Temporary chat not persisted, persistent chat resumes after reload. | See #47 coverage and journey evidence in the report; final hosted acceptance pending. |
| 47.16: Automated tests exercise permission checks, approved/rejected writes, error recovery and external-provider data minimization. | See #47 coverage and journey evidence in the report; final hosted acceptance pending. |

## V1 / 5 — End-to-end release, honest landing page and complete documentation

| Requirement | Verification |
| --- | --- |
| 48.1: Execute every end-to-end acceptance journey in the approved specification with unit, integration and Playwright coverage; add cross-user isolation, offline queue retry, timezone, DST, duplicate prevention, 2FA/session and Coach approval/refusal tests. | See #48 coverage and journey evidence in the report; final hosted acceptance pending. |
| 48.2: Verify export/clear/restore of the **full** schema, including relationships, activity, journal, messages where appropriate, and histories. Confirm per-account demo data is removable without harming real data. | See #48 coverage and journey evidence in the report; final hosted acceptance pending. |
| 48.3: Audit responsive layout, keyboard interaction, readable typography, touch targets, accessibility, reduced motion, loading/empty/error states and color semantics. | See #48 coverage and journey evidence in the report; final hosted acceptance pending. |
| 48.4: Rewrite **README, contributor/developer docs, architecture docs, user-facing help, setup/deployment instructions**, seed/demo narratives and troubleshooting. | See #48 coverage and journey evidence in the report; final hosted acceptance pending. |
| 48.5: Rewrite landing-page copy on `/` to lead with Capture, Daily Journal, connected knowledge, People/Places and Coach (only what is actually implemented). Keep existing vital links/actions; no requirement for new waitlist/demo infrastructure. | See #48 coverage and journey evidence in the report; final hosted acceptance pending. |
| 48.6: Remove all obsolete Finance, old hardcoded Domain and 17-Item-type claims throughout UI, docs, SEO, schema.org metadata, package description/keywords, Open Graph content and PWA manifest. | See #48 coverage and journey evidence in the report; final hosted acceptance pending. |
| 48.7: Replace outdated app mockups and screenshots with **actual V1** flows and sample data; verify landing-page CTA enters `/app` with proper auth behavior. | See #48 coverage and journey evidence in the report; final hosted acceptance pending. |
| 48.8: Document invitation-only registration, server secret requirements, AI provider data sharing, Vercel Hobby deployment, external PostgreSQL, export/restore, and offline-sync limitations. | See #48 coverage and journey evidence in the report; final hosted acceptance pending. |
| 48.9: Test staging/preview deployment before considering production schema changes; document safe deploy/rollback path. Do not reset production silently. | See #48 coverage and journey evidence in the report; final hosted acceptance pending. |
| 48.10: Confirm the existing basic Graph and Focus Timer survive the redesign; run regression tests against them. | See #48 coverage and journey evidence in the report; final hosted acceptance pending. |
| 48.11: All scenario-based tests in V1 spec pass on a staging deployment, including offline capture/sync, Task cross-view references, Bookmarks, Person/Me, Habit Routine checklist, Focus, multiple check-ins, Coach write approval, export/restore and isolation. | See #48 coverage and journey evidence in the report; final hosted acceptance pending. |
| 48.12: The public website makes **no unimplemented promises**. | See #48 coverage and journey evidence in the report; final hosted acceptance pending. |
| 48.13: Docs allow a new developer to build and deploy without oral instructions. | See #48 coverage and journey evidence in the report; final hosted acceptance pending. |
| 48.14: Demo data is realistic, per-account, opt-in and removable. | See #48 coverage and journey evidence in the report; final hosted acceptance pending. |
| 48.15: Production deploy requires explicit approval following preview verification. | See #48 coverage and journey evidence in the report; final hosted acceptance pending. |
| 48.16: Audit login-page demo guidance, the existing explicit setup action, and the seed flow. Explain setup prerequisites before presenting advertised demo credentials/access as ready; keep invitation-only registration and normal login behavior accurate. | See #48 coverage and journey evidence in the report; final hosted acceptance pending. |
| 48.17: Show setup progress, success, already-ready outcomes and actionable failure messages; prevent duplicate submissions and never report success after a failed setup. | See #48 coverage and journey evidence in the report; final hosted acceptance pending. |
| 48.18: Keep demo setup opt-in: never seed automatically on startup or after failed login. Scope setup/removal to the intended account's demo data and preserve unrelated accounts and real user data. | See #48 coverage and journey evidence in the report; final hosted acceptance pending. |
| 48.19: Make repeated setup idempotent: no duplicate demo records and no destructive database reset needed to recover or reuse an initialized demo. | See #48 coverage and journey evidence in the report; final hosted acceptance pending. |
| 48.20: Document fresh local and hosted setup, prerequisites, credentials/access readiness, repeat setup, failure recovery and demo removal using the actual V1 flow. | See #48 coverage and journey evidence in the report; final hosted acceptance pending. |
| 48.21: A fresh deployment explains how to initialize demo access before advertising it as usable; explicit setup enables the documented demo login/access and clearly reports readiness. | See #48 coverage and journey evidence in the report; final hosted acceptance pending. |
| 48.22: Cover fresh setup, already-initialized setup, concurrent/duplicate submissions and failure responses in seed/API tests. | See #48 coverage and journey evidence in the report; final hosted acceptance pending. |
| 48.23: Exercise setup → demo login/access → repeat setup end to end; verify no duplicates, no false success, normal login remains usable after setup failure, and unrelated users' data remains unchanged. | See #48 coverage and journey evidence in the report; final hosted acceptance pending. |
| 48.24: Verify per-account demo removal preserves real data and other accounts, alongside the full-schema export/clear/restore checks above. | See #48 coverage and journey evidence in the report; final hosted acceptance pending. |

