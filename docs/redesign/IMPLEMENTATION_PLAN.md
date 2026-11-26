# Bearing — execution plan for V1 redesign

This plan is the implementation sequence for [the approved V1 specification](./BEARING_V1_SPEC.md). **No more product questionnaires.** Where details are unstated, choose the simplest behavior consistent with that spec and document the technical decision.

## Delivery rules

- Implement as reviewable vertical slices on a feature branch; never silently rewrite the deployed production database.
- Existing example data is disposable, **not** real users' deployment data. Production reset requires an explicit deployment-specific confirmation.
- Per-slice quality gates: schema/runtime validation, ownership and isolation tests, happy/error UI states, consistent downstream views, and end-to-end acceptance.
- Preserve useful domain-service principles (auth, revision, operation ledger, permissions) even as old Item types and views are replaced.
- Do not ship empty placeholders on public landing page or document planned abilities as completed.

## Ordered implementation slices

### S0. Contracts and safety baseline
- Add immutable V1 decision record (spec), typed contracts and tests.
- Inventory routes/components and classify keep/rewrite/remove.
- Audit session secret handling, cookie security, 2FA, invitation-gated registration, record ownership, Coach write permissions.
- Provision isolated disposable dev database; never point migration prototypes at live Vercel production.
- Define complete v2 seed, backup and test fixtures. No schema migration on production at this step.

**Exit:** type/status/policy contracts agreed and tested; branch CI baseline known.

### S1. Data foundations
- New Prisma models/migration: Item + typed template metadata, Project, Tag/Area, ItemTag, ProjectTag, Link, Activity, JournalMoment, JournalMoment links, Review, Conversation/Message, Proposal, ledger, Invitation, User settings.
- Use canonical Person-shaped self profile `Me`; enforce one per user.
- Define recurrence instances and idempotent generation; formalized event and deadline semantics.
- Seed lifelike per-user demo; full JSON export/restore and tests.

**Exit:** model validation, isolation, ownership, export/restore and date tests green.

### S2. One compelling capture-to-recall journey
- New URL navigation; Quick Capture; Inbox; universal keyword search.
- Daily Journal page with time-ordered moments, freeform and slash commands.
- Task content/checkbox editing, one Project association, Areas/Tags with inheritance.
- True offline PWA shell + IndexedDB outbox + idempotent sync.

**Exit:** capture offline -> sync -> organize -> search -> Journal/Today consistency e2e green.

### S3. Personal library and context
- People including Me, linked Items and real-vs-mentioned interaction distinction.
- Lightweight Bookmarks: media formats, place+GPS+Navigate, web/file URL references.
- Goals, Habits/Routine template checklists, Events, Calendar/Agenda, Graph.
- Keep existing Focus timer, persist completed sessions as Activity. Mood check-ins and Reviews separate.

**Exit:** linked People/Places/Tasks/Habits visible correctly across views, tests green.

### S4. Conversational Coach
- Vercel AI SDK and provider configuration (OpenRouter or Vercel AI Gateway), no external research yet.
- Retrieval over same authorized search and Links as UI.
- Persistent/temporary chat, citations or linked records, clarify ambiguity, unresolved reference -> approved research Task.
- Proposal preview, edit/approve/reject, transactional server-side writes and receipts; never auto-write.

**Exit:** read-grounded answer, correct refusal/authorization, multi-edit approval and audit tests green.

### S5. Finish, not merely compile
- Review all acceptance scenarios in SPEC, including conflict/retry/sync logout, timezone and per-user isolation.
- Accessibility, responsive UI, performance and server-side error handling.
- Rewrite README, docs, runbook, PWA manifest, SEO and landing-page copy; capture actual screenshots.
- Verify Vercel Hobby constraints; stage on preview deployment; validate demo seeding and backups.

**Exit:** no misleading advertised features and all acceptance journeys passing; separately review before production migration/deployment.

## Exact immediate next coding targets

1. Integrate `src/lib/redesign/contracts.ts` and tests into upcoming model/DTO work; it is intentionally additive before app behavior changes.
2. Create schema migration and tenant-safe service API for Areas (classified Tags), Project association, Person/Me, JournalMoment and Activity.
3. Ship first full Journey in S2 **before** adding more templates.

## Deliberately removed / de-scoped

- `finance` Item and finance-specific dashboard/marketing.
- `routine` Item: migrate to `habit` template plus Markdown checklist.
- `journal`, `idea`, `affirmation`, `vision`, `milestone`, `document`, `symptom`, `medication` as separate core Item types, replaced by approved templates, Activity or Me-linked reference content as specified.
- Legacy hardcoded Domains; use Areas; edit rendering and filters rather than preserving broken compatibility.

## V1 target doesn't mean one commit

This first PR is a **non-deployable foundation**; it must not be mistaken for a full redesign. Subsequent vertical-slice PRs should ship working behavior with tests and updated documentation.
