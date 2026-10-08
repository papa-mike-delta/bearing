# Bearing

Personal life OS. Tasks in areas, a Drafts-style inbox, and a Coach that can read and write the same data.

Turborepo, one Next.js app. Created from `npx create-turbo@latest`, then reshaped to the layout in `docs/research/spec.md`.

## Layout

- `apps/web` — the product. Deploy this.
- `packages/domain` — pure task, habit, and reconnect rules. No React, no database.
- `packages/db` — Drizzle schema and client. Postgres on Neon.
- `packages/ui` — components. No product logic.
- `packages/capture` — draft parse and action runners.
- `packages/coach` — tool names, skills, knowledge. No model calls.
- `packages/eslint-config`, `packages/typescript-config` — from the Turborepo starter.

`apps/docs` from the starter was removed. One app until a marketing site is actually needed.

## Scripts

```sh
npm install
npm run dev
npm run build
npm test
```

## Environment

Sign-in is Auth.js with email and password and a database session in Postgres. The database is Neon.

- `POSTGRES_URL` — pooled Neon connection string, used by the app.
- `POSTGRES_URL_NON_POOLING` — direct Neon connection string, used to apply migrations.
- `AUTH_SECRET` — random secret for Auth.js. Generate with `openssl rand -base64 32`.
- `PRODUCTION_DB_HOST` (Vercel, Preview) — the host of production's `POSTGRES_URL_NON_POOLING`, e.g. `ep-xxxx-xxxx.us-east-2.aws.neon.tech`. Just the host, no user or password. A preview build whose database is that host refuses to migrate.

On Vercel, install Neon from the Marketplace (Storage → Neon) and connect it to the project with the env prefix `POSTGRES` for Production and Preview, with preview branching on (Advanced Options → Deployments Configuration → Preview, and "Resource must be active before deployment"). That sets both `POSTGRES_URL` variables, and gives each preview deployment its own Neon branch. Add `AUTH_SECRET` (all environments) and `PRODUCTION_DB_HOST` (Preview) under Settings → Environment Variables. `apps/web/vercel.json` owns the install and build commands, overriding the dashboard settings. Install switches npm to 10.9.9 first: Vercel's Node 24 ships npm 11, which refuses every npm command in this repo because of the `devEngines` pin. The build is `cd ../.. && npx turbo run build --filter=web`.

### Schema changes

The schema lives in `packages/db/src/schema.ts`; versioned SQL migrations live in `packages/db/drizzle/`. To change the schema, edit `schema.ts`, then generate and commit the migration with the code that needs it:

```sh
npm run db:generate -w @repo/db
```

Review the generated SQL. It must work with the deployment that is still serving (add first, remove in a later deploy), because it is applied before the new code goes live. CI fails if `schema.ts` and the migrations disagree.

Vercel applies pending migrations on every build, production and preview, before `next build` (`@repo/db#db:migrate:vercel` in `turbo.json`, run by the `vercel.json` build command). It runs only when `VERCEL=1` and `VERCEL_ENV` is `production` or `preview` (any other value fails the build; `development` skips), against `POSTGRES_URL_NON_POOLING` (required; the pooled URL is never used), which is the preview's own Neon branch on preview deployments. A preview whose host equals `PRODUCTION_DB_HOST` is refused. A failed or refused migration fails the build, so nothing is deployed. `next.config.js` also fails a production or preview build that didn't run the migrate step (for example, a bare `next build`). Local and CI builds skip all of this.

For local dev put the variables in `apps/web/.env.local`. `POSTGRES_URL` can point at a Neon dev branch or a local Postgres (`postgres://user:pass@localhost:5432/bearing`). Apply migrations by hand, after first setup and after pulling a schema change:

```sh
POSTGRES_URL_NON_POOLING=... npm run db:migrate -w @repo/db
```

`npm test` also runs an account-isolation test against a real database when `TEST_POSTGRES_URL` is set. Locally it is skipped with a warning otherwise; in CI (`CI` set) it fails. Use a throwaway database, since the test writes and deletes its own accounts. Migrate it first:

```sh
export TEST_POSTGRES_URL=postgres://user:pass@localhost:5432/bearing_test
POSTGRES_URL_NON_POOLING=$TEST_POSTGRES_URL npm run db:migrate -w @repo/db
npm test
```

`next start` outside Vercel also needs `AUTH_TRUST_HOST=true`.

Node 24 is what the starter declares. Remote cache: `npx turbo login` then `npx turbo link`.

## Agent skills

Issues live in this repo's GitHub Issues. See `docs/agents/issue-tracker.md`.
