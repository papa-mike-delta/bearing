# V1 data foundations (#44)

This documents the additive backend introduced in #44. Workflow, connected-life
and conversational Coach are now implemented in #45–#47. See the current
[architecture](../ARCHITECTURE.md) and [release runbook](../RELEASE.md).

## Deployment boundary

`prisma/schema.prisma` and its existing migrations are unchanged. New tables live
in `prisma/v1/schema.prisma`, map to `V1*` PostgreSQL tables, and use a separately
generated client. Identity (`User`) and the durable `OperationLedger` are shared.
The V1 migration adds tables, constraints and a trigger that creates one Me Person
for each existing/new account. It does not convert, delete or reset legacy data.

Normal `build` generates both clients. `build:vercel` still deploys **only legacy
migrations**. It does not apply the V1 migration or enable V1 endpoints. Registration
is now invitation-only; while V1 is disabled new registration is refused. Existing
login remains available with a strong production session secret.

For an isolated development/preview database:

1. Set `DATABASE_URL` to a disposable PostgreSQL database, never the live database.
2. Run `npm ci` then `npm run db:generate`.
3. Run `npx prisma migrate deploy` to apply the single baseline on that empty database.
4. Set a random `SESSION_SECRET` of at least 32
   characters. Production refuses the development fallback and short/missing keys.
6. Create an invitation with `npm run db:invite -- email@example.com`.
   Share the resulting code privately; it is email-bound, expires after seven days,
   is stored only as a SHA-256 digest, and is consumed in the account-creation transaction.
7. Register with the invitation field at `/login` (or `/login?invite=CODE`). The new
   account has one ordinary Person Item designated Me, with no seeded demo data.

The schema-review environment variable is an execution guard, not authorization
for production. Production migration/rollout remains a separate deployment review.
A rollback restores the previous application build only when its migration history matches the database; leave the
additive tables intact. Do not drop V1 tables or reset any live database as rollback.
Legacy `migrate dev` is not the tool for managing the hand-reviewed V1 constraints.

## Canonical contracts

`src/lib/v1/contracts.ts` exports Zod runtime schemas and inferred DTOs for UI, API
and Coach. Services reject extra keys (including `userId`, nested Prisma writes,
unknown templates, retired types and unsupported metadata versions). Version 1
JSONB metadata is validated by core Item kind. Media formats remain extensible.
All identifiers are server-generated except stable caller-owned capture/session keys.

Seven durable Item kinds: Task, Note, Habit, Event, Goal, Person and Bookmark.
Routine is a Habit template containing Markdown checklist content. Finance has no
V1 model. Health references can be Notes semantically linked to the canonical Me
Person; health data is not copied into account identity or a special Project.

Items have zero/one Project; Items and Projects have many Tags, including classified
`area` Tags. Effective Area filtering unions direct and Project Areas in the query.
Responses expose `directAreas` and `inheritedAreas`; inherited rows are never copied.
Links join Items semantically. Project/Tag membership uses actual foreign keys.
The endpoint policy is shared by normal writes, reclassification and restore.
Reclassification retains Item identity but refuses incompatible existing history,
Me identity, delegation and semantic Links.

Task priorities are integers -2 through 2; default 0. Stored statuses are
`inbox/todo/in_progress/delegated/done/archived`. Filtering `in_progress` also includes
`delegated`, while the stored status stays distinct. Scalar date/status/Project
fields have tenant-prefixed indexes. Events require actual start/end instants.
Birthdays remain ISO calendar dates in validated Person metadata, not UTC birthdays.

UTC instants (`dueAt`, `scheduledAt`, Event `startAt/endAt`, `occurredAt`, creation)
are distinct. For Tasks, `localDate` can represent a date-only deadline; `dueAt` is an exact deadline instant. IANA `timezone` preserves calendar intent. Journal and
Activity local dates are computed server-side from occurredAt, not request creation.
Reviews identify a local calendar period and contain prompts; mood/energy check-ins
are repeatable Activity rows. Journal references distinguish a mention from an
actual interaction; mentions never manufacture interaction history.

## Recurrence and history

A Recurrence rule belongs to a Task series and stores calendar or completion mode,
unit (day/week/month), positive interval and timezone. Calendar mode also stores
local HH:mm. A TaskOccurrence references each concrete Task and preserves its
scheduled/completed instants and the next Item reference. Each Task appears once;
`(owner, recurrence, scheduledAt)` prevents duplicate next occurrences.

Completing a Task under the shared audit lock records its completion Activity and
creates at most one next instance atomically. A stale/concurrent retry is refused;
it cannot duplicate history. Original due/scheduled dates are not rolled forward.
Calendar recurrence advances from the scheduled occurrence, even if overdue;
completion-relative intervals advance from actual completion in the rule's local
calendar. Month rules retain the original day anchor, clamping shorter months.
DST overlaps choose the earlier instant; gaps advance to the first valid minute.
Rules use minute precision. Completed recurring instances cannot be reopened and
silently invalidate subsequent history.

Habit completions store optional measured values and independent checklist snapshots
in Activity. Ticking a step and completing a Habit are different facts. Shared
services do not mutate a Habit template's Markdown on completion; per-occurrence
rendering/reset behavior is the connected-life UI work in #46. Focus completion has
a stable Activity client key so retries produce one session.

## Authorization and audit

HTTP handlers are under `/api/v1/*`. Every handler
requires a signed, fully 2FA-verified session and an existing account. Ownership and
actor come from that session, never request JSON. Pending 2FA sessions cannot
read `/api/v1`, rotate 2FA secrets or confirm QR login. Former pre-V1 content
routes are not registered and return 404. QR challenges require
verified same-account confirmation and are one use; the existing ephemeral store
fails closed on expiry/restart and is not a durable multi-worker transport.

Services scope every read and relationship lookup by owner. Composite foreign keys
prevent cross-account Item/Project/Tag/Link, delegation, Journal, Review, Activity,
recurrence, conversation, proposal and editor-lease associations even if a future
caller omits a service check. Raw database credentials remain server-only.

Writes share the existing advisory transaction lock and audit table. Successful
writes and receipts commit together; failures roll back before a refusal receipt is
recorded. Revision-checked Item/Project updates reject stale values. Agents require
an approved server-side change context, obey open editor leases and have no direct
HTTP actor override. Approval UI/proposal execution is documented in CONVERSATIONAL_COACH.md. Item/Link create
caps combine legacy and V1 receipts, including generated recurring instances and
demo rows. User-confirmed restore is a maintenance operation, not a cap-limited
series of edits. Receipts survive reset and restore.

## API surface

All results are JSON. Mutations return `{ok:true,value,receiptId}`; errors return an
HTTP status, error and optional conflict/validation/receipt details. Item/Project
PUT uses `{revision,data}` with the full canonical DTO. There is no arbitrary Prisma
query, nested write, or caller-selected table endpoint.

| Resource | Operations |
|---|---|
| `items`, `items/:id` | List/filter, create, read, revision-checked replace/reclassify/archive via status |
| `items/:id/lease` | User-owned 90-second editor presence token |
| `items/:id/recurrence` | Create rule and initial occurrence using Item revision |
| `me` | Read canonical self Person |
| `projects`, `projects/:id` | List/read/create and revision-checked replace |
| `tags`, `links` | List/read/create; delete Link by id |
| `journal`, `activities`, `reviews` | List/read/create using validated distinct contracts |
| `recurrences` | Read series and occurrence history |
| `backup` | Full export; confirmed atomic restore |
| `reset` | User-confirmed V1 reset |
| `demo` | Explicit optional seed; confirmed removable seed |

Keyword search, app routes, offline IndexedDB transport, proposal execution and
editing UIs are implemented in the workflow, connected-life and Coach slices.

## Portability and demo lifecycle

The versioned `bearing-v1` backup manifest covers Items, canonical Me content,
Projects, Tags, ItemTag/ProjectTag joins, Links, Activity, Journal moments and joins,
Reviews and joins, recurrence rules and occurrences, Conversations, Messages,
Proposals, Preferences and all account audit receipts. Me's protected identity is
recorded in the envelope. Security credentials, invitation secrets and expiring
editor leases are intentionally excluded. An account migration across identity IDs
requires a separately reviewed import; automatic restore is to the same account.

Restore validates the complete shape, typed records and relationship graph before
clearing. Foreign-owned ID collisions are refused. Every row/association/history is
restored inside one transaction; any constraint/write failure rolls back the clear.
Audit is append-only and deduplicated by receipt identity; an existing different
receipt cannot be overwritten. Reset preserves Me identity and clears its user
content. It leaves authentication, legacy data and audit untouched.

Demo data is per-account, optional, marked by a batch and explicitly removable.
Removal refuses edited demo records or new personal references instead of deleting
personal data that now depends on the demo. Its tag label is unique to the batch,
so seeding does not overwrite an existing Area. Seed retry does not duplicate rows.

## Verification

- `npm test`: shared contracts, metadata, priorities, templates, date/timezone/DST,
  signed sessions and the existing unit suites.
- `TEST_DATABASE_URL=postgresql://… npm run test:integration`: creates a randomly named
  isolated schema, applies the baseline, tests real PostgreSQL constraints,
  isolation, auth/2FA/invitations, histories, concurrency and backup round trips,
  then drops only that test schema. Use a disposable server/database.
- `npx tsc --noEmit --incremental false`, `npm run build`, and focused browser auth
  checks. Native screen-reader/Safari certification belongs to release validation.
