# Sunset the legacy domain and Coach

Date: 2026-10-26. Status: superseded by [ADR 0006](0006-one-schema-one-runtime.md) on 2026-11-26. The 410 shim, setup gate, second schema, and legacy content tables are gone. This record stays as the history of that decision. Supersedes product use of ADR 0001, ADR 0002 and ADR 0004.

## Decision

Bearing is greenfield on V1. `/app` mounts the V1 workflow only. There is no `Item` → `V1Item` conversion, no import job, and no third Prisma client. Shared identity stays on `User`, theme stays on `Setting`, and audit stays on `OperationLedger` (V1 `Ledger` maps to that table). New product work goes through `src/lib/v1/*`, `prisma/v1`, and `/api/v1`.

## What already covers each legacy surface

| Legacy surface | V1 coverage | This change |
| --- | --- | --- |
| `src/lib/domain` Item, Link, Project, backup, leases, write caps | `src/lib/v1/service.ts`, `workflow.ts`, `backup.ts`, `connected-service.ts` | Delete. Git history is the archive. Do not restore it under `src/`. |
| Legacy Coach tools, `/api/coach`, `src/lib/coach` | `src/lib/v1/coach/*` and `/api/v1/coach` | Delete. The feature flag goes with it. |
| Pre-V1 pages (`Shell`, ontology views, item editor) | `src/components/bearing/workflow/*` | Delete the unmounted shells. Keep Focus timer, Graph explorer, rich text, drafts, layout and icons that V1 still renders. |
| `src/lib/dates.ts` | `src/lib/v1/dates.ts` and `workflow-dates.ts` | Delete. It had no V1 caller. |
| `/api/items`, `/api/projects`, `/api/inbox`, and the other pre-V1 write/read routes | `/api/v1/*` | Remove the handlers. `LegacyApi` answers `410` so callers see a dated sunset instead of a silent data path. |
| `/api/seed` when V1 is on | Per-account Settings demo (`V1Demo`) | Keep a stub that always returns `410` and does not write. |
| `/api/preferences/theme`, `/api/receipts/:id`, `/api/auth/*` | Still used by V1 appearance, draft receipt links, and sign-in | Keep. They use `User`, `Setting`, or `OperationLedger` through `src/lib/db.ts`. |
| Legacy tables `Item`, `Project`, `Link`, `Domain`, `Tag`, `TagOnItem`, `HabitLog`, `Review`, `ReviewItem`, `Reminder` | Replaced by `V1*` tables. Foundations tests still prove a pre-existing `Item` row is not converted. | Leave the tables. Do not add a migration in this change. |

## Why no new schema

Dropping those tables is a destructive migration. Production may still hold rows, and this change does not prove those rows are empty. `User`, `Setting`, and `OperationLedger` are still live. A conversion migration would invent the mapping the product decision forbids. No new table or client is required to stop serving the old write stack.

## Dated drop

On or after **2027-01-26**, a separate PR may `DROP` only the unused legacy content tables listed above, after a production row-count review. That PR must not drop or rewrite `User`, `Setting`, or `OperationLedger`, and it must not copy rows into `V1*`. Until then, schema comments and `src/lib/db.ts` mark those models as do-not-extend.

## Smallest diff

Subtract callers first. Do not grow `src/lib/domain`. Do not leave a parallel domain module that the next change could import. V1 patterns stay as they are.
