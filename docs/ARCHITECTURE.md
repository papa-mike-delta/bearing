# Architecture

Bearing is a Next.js application with a public landing page, invitation-only
registration, and an authenticated `/app/*` workspace. Sign-in always continues
to the account's startup surface.

Product code lives in `src/lib/v1/*` and `/api/v1`. Those paths are the current
API, not a second runtime. Auth, theme and receipt reads use the same Prisma
client as the product tables (`src/lib/db.ts`).

## Storage

PostgreSQL. One schema (`prisma/schema.prisma`) and one migration baseline.
`Account` is the `"User"` table, `Setting` stores theme, and `Ledger` is
`"OperationLedger"`. Items, projects, tags, links, moments, reviews, coach
conversations and preferences are `V1*` tables. CHECK constraints and the Me
triggers live in the baseline SQL because the Prisma datamodel cannot express them.

There is no legacy `Item` table and no conversion into `V1Item`.

## Auth

Sessions are signed cookies named `bearing-session`. Production requires
`SESSION_SECRET` of at least 32 characters. Registration consumes an invitation.
Two-factor verification is optional and gates the signed-in workspace.

## Writes

UI and Coach call the same service. User capture is revisioned and ledgered
without an approval card. Coach changes arrive as an editable batch unless an
account trust pattern covers them, and those writes still record a receipt.

## Offline and Coach

Offline support is text capture after a prior authenticated visit. Coach calls
a server-configured OpenRouter or gateway model. Keys stay on the server.
