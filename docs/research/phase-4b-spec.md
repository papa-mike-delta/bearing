# Phase 4b — Journal and Daily close with Paul

Status: Draft for review; not submitted as an epic and not approved for implementation.

This is a manually prepared specification. The requested `/to-spec` command was not available in this environment.

## Purpose

Let the user turn captured reflections into a persistent daily Journal, optionally record one Mood for the day, and run a user-initiated Daily close with Paul. Reuse the markdown and mutation foundations from [4a](phase-4a-spec.md), then deliver [4c](phase-4c-spec.md) separately.

Source: [product specification](spec.md), sections 4.4, 7, 8.2–8.4, and 11.6. Daily close explicitly includes prompting the Journal template, setting Mood, and filing stray Inbox Drafts; this slice must not silently reduce it to an append-only chatbot.

## Existing implementation anchors

- `apps/web/lib/today.ts` defines Today as the browser's calendar day, not UTC and not an account timezone. Preserve this convention across UI and Paul.
- `apps/web/lib/drafts.ts` provides transactional filing; extend the pattern without changing existing Task/Note semantics.
- `apps/web/lib/coach-tools.ts` binds session identity and message identity outside model-controlled input. Extend its shared mutation adapters and existing turn limits.
- `packages/coach` retains SDK-independent tools. Daily close is a prompt plus an enforced tool allow-list, not another agent framework or background service.

## User journeys and scope

1. Open `/journal` and navigate to `/journal/[day]`. Today is a virtual empty entry until the first save/append; viewing a day must not create database rows.
2. See a suggested reflection template (gratitude, best thing, hard part), customize the user's default template, and use it for new days without modifying past entries. Never automatically save unanswered prompts as a reflection.
3. Capture text into Inbox and explicitly **Append to journal**, defaulting to the browser's Today with an optional chosen past day. Preserve the entire Draft body. On success, archive the Draft and offer the day's link.
4. Edit the day's markdown using the shared editor, with explicit save, safe preview, revision conflicts, and unsaved-work protection from 4a.
5. Optionally choose or clear one Mood for that day. Mood belongs to the day, not to an individual append. Missing is not neutral and must not become zero.
6. Ask Paul to append a reflection to a specified day or Today. Paul appends only the requested text and returns a receipt linked to that day.
7. Start **Daily close** from the Journal or Paul. Paul prompts one reflection question at a time, asks rather than invents Mood, and offers to file selected remaining Inbox Drafts. Skipping any step is valid. No write occurs merely because the skill was opened.

## Day and entry semantics

- Proposed resolution of the source's multiple-entry wording versus its one-body schema: one editable markdown document per user/day; multiple captures and Coach appends become ordered additions to that document, separated by two newlines. No independently editable sub-entry timeline in Phase 4.
- The first nonempty append creates the day's document. Further appends preserve existing text. Concurrent appends must both survive, each once; document replacement uses optimistic revision checking.
- Validate real `YYYY-MM-DD` dates, including leap days. Resolve relative dates using the browser day supplied with the action/turn, never server UTC. Explicit past dates are supported; future reflection dates are rejected in this slice.
- On midnight rollover, new Today actions refresh their day context; an already open dated entry and retry retain the original target day. Invalid or missing day context produces a recoverable error, not a guessed date.
- Proposed Mood scale: five labeled values (Very low, Low, Okay, Good, Very good), optional and clearable. No inference from text and no diagnosis. This scale is a review decision, not a source requirement.

## Data and mutation invariants

- Journal entry: UUID, session owner, calendar day, markdown body, revision, created/updated timestamps; unique owner/day.
- Day score: owner/day uniqueness with optional Mood. No energy/stress fields or premium gating UI required now.
- Persist the user's default Journal template. Template changes affect future initialization only and must not be reapplied on every render or overwrite an existing day.
- Persist operation provenance independently from the current body so retries of old appends never duplicate text, even after subsequent manual edits.
- UI, Draft action, and `appendJournal` share one validated append mutation. A stable operation ID plus session owner defines replay identity; changed payloads under the same identity are conflicts, not new writes.
- Draft append, archive, and result provenance commit in a single transaction. Losing a success response and retrying cannot duplicate text or change the destination day.
- A journal append racing with a manual replacement must not lose data: stale replacement is rejected and its local text is retained for reconciliation.
- Mood updates use the shared `setMood` mutation; idempotent replay cannot restore an older Mood over a newer edit. Mood and Journal contents are private and session-scoped on every query.
- Reuse 4a's markdown body bound; reject appends exceeding the total bound without archiving the Draft. Proposed template bound: 10,000 characters. Never silently truncate.

## Paul and Daily close contract

Required capabilities: `appendJournal`, `setMood`, bounded reads of the selected day's entry and remaining Inbox Drafts, destination discovery, and a session-scoped `fileDraft` adapter for existing Task/Note/Journal filing mutations. These supporting capabilities are in scope because Daily close cannot function honestly without them; global/full-text search is not.

- Reads expose only bounded, owned data needed for the chosen day or selected Drafts; do not dump the full Journal or Inbox into every prompt.
- Daily close's allowed tools are enforced in the runtime, not merely listed in a prompt. Preserve existing step caps and per-turn mutation limits.
- An explicit create/edit/append request is authorization. Paul offers filing choices first; it cannot mass-file or delete Inbox content under a vague request to close the day. Bulk actions remain unavailable unless an explicit confirmation mechanism is implemented separately.
- Each write gets its own durable receipt and local entity URL. Completed writes remain completed if a later step fails; retries do not replay them. Daily close is not an all-or-nothing multi-step database transaction.
- No scheduled runs, autonomous overnight writes, invented reflections, clinical interpretations, or external transmission of Journal text through research tools.
- Include a short, cited journaling knowledge article grounded in the product spec's research, without claiming guaranteed wellbeing benefits.

## Acceptance criteria

- [ ] Viewing empty days writes nothing; first save creates exactly one owned entry for the day.
- [ ] Repeated and concurrent appends preserve all accepted text exactly once, with deterministic separators.
- [ ] Draft filing is atomic; failure preserves Inbox state, and replay links to the original day without another append.
- [ ] Editing, template customization, save/reload, conflict recovery, and safe markdown rendering work using the shared editor.
- [ ] One optional Mood persists per day, can be changed or cleared, and is never inferred or defaulted silently.
- [ ] Today is correct near local midnight and DST changes; invalid, leap-day, past-day, future-day, and delayed-retry cases are tested.
- [ ] Daily close can prompt, append, record requested Mood, and file a selected Draft through existing mutations; skipping or cancelling causes no unwanted writes.
- [ ] Tools enforce ownership, allow-lists, payload validation, operation replay, read limits, and turn limits, including on stored-thread reload.
- [ ] Browser checks cover Journal navigation, capture/append, editing, Mood, Daily close receipts, and mobile/keyboard usage. Unit/integration tests cover the invariants and concurrent writes; existing repository checks pass.

## Non-goals

Mood charts, energy/stress, Journal PIN, habits, people/happy memories, notifications, scheduled coaching, arbitrary range analytics, full-text search, public API, general entity links, independent sub-entry management, and dedicated Journal deletion tools.

## Review decisions before epic submission

Approve one document per day, the five-value Mood scale, past-only entries, customizable template scope, and the supporting read/filing tools. These make otherwise underspecified Daily close behavior explicit. The supporting tools are required scope, not hidden follow-up work.

## Epic handoff

Suggested title: **Phase 4b: Add daily Journal, Mood, and user-initiated Daily close**.

Blocked by: Phase 4a accepted and deployed. Submit as its own epic after review; implement only after 4a is complete.
