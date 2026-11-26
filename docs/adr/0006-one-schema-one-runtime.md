# One schema and one runtime

Date: 2026-11-26. Status: accepted. Supersedes the transitional split in ADR 0005.

## Decision

Bearing has one Prisma schema, one client, and one migration baseline. `/app` always opens the signed-in startup surface. There is no feature flag, no setup gate, and no 410 tombstone for the retired pre-V1 routes. Unknown routes 404.

`Account` is stored as `"User"`. `Setting` stays `"Setting"`. `Ledger` is stored as `"OperationLedger"`. Product tables keep their `V1*` names. Legacy content tables (`Item`, `Project`, `Link`, `Domain`, `Tag`, `TagOnItem`, `HabitLog`, `Review`, `ReviewItem`, `Reminder`) are not in the schema.

The baseline is for an empty database. It includes the CHECK constraints, owner foreign keys, and the Me create/protect functions and triggers from the reviewed V1 SQL, including `located_at` on moment relations. It is not applied to the existing Neon database.

The session cookie is `bearing-session`. Existing browsers sign in again.

## Consequences

`build:vercel` runs `prisma migrate deploy` once. Tests use `TEST_DATABASE_URL` on disposable Postgres. `/api/v1` and `src/lib/v1` keep their names.

MIT attribution stays while verbatim upstream files remain. See the pull request for that list.
