# Bearing

Personal life OS. Tasks in areas, a Drafts-style inbox, and a Coach that can read and write the same data.

Turborepo, one Next.js app. Created from `npx create-turbo@latest`, then reshaped to the layout in `docs/research/spec.md`.

## Layout

- `apps/web` — the product. Deploy this.
- `packages/domain` — pure task, habit, and reconnect rules. No React, no database.
- `packages/db` — Drizzle schema and client. Postgres on Neon.
- `packages/ui` — components. No product logic.
- `packages/capture` — draft parse and action runners.
- `packages/coach` — the Coach's system prompt, skills, knowledge. No model calls.
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
- `AUTH_SECRET` — random secret for Auth.js. Generate with `openssl rand -base64 32`. Needed wherever sign-in has to work. A deployment without it still builds, but sign-in fails at runtime.
- `COACH_MODEL` (optional) — the AI Gateway model id the Coach uses, read on each request. Defaults to `spacexai/grok-4.7`. The Gateway falls back to `openai/gpt-6-astra` when it fails, and gets the user id and the tag `coach` for spend reports; Bearing has no retry code. Limits, in `apps/web/lib/coach-turn.ts` and `@repo/coach`: a message is one text part of at most 4,000 characters, the model sees only the thread's latest 40 messages, a reply takes at most 8 model steps (each tool call uses one), and each step is capped at 1,000 tokens. Reasoning counts toward that cap and isn't streamed or saved; a reply cut off before any text counts as a failed turn, so the person can resend. The Coach's one tool so far, `listArea`, reads the person's open Tasks and lists at most 50 of them. Stop in the browser ends the stream there, but the model call runs on and the reply is saved, so a closed tab doesn't lose a turn. A reply is saved just after the message it answers, so it reloads in place even if something was sent while it ran.
- `AI_GATEWAY_API_KEY` (local only) — an AI Gateway API key for the Coach in local dev, in `apps/web/.env.local`. Don't set it in the Vercel project: a key that is present always wins over OIDC, even if it's invalid.
- `VERCEL_OIDC_TOKEN` (set by Vercel) — how deployed builds authenticate to the Gateway, with no stored key. Vercel provides it to builds and functions, so the project stores no Gateway key. It's in Turbo's `globalPassThroughEnv`, not `globalEnv`: it changes on every build, so hashing it would defeat the build cache. Locally, `vercel env pull` writes one that expires after 12 hours, if you'd rather not use a key.
- `PRODUCTION_DB_HOST` (Vercel, Preview; required there) — the host of production's `POSTGRES_URL_NON_POOLING`, e.g. `ep-xxxx-xxxx.us-east-2.aws.neon.tech`. Just the full host, optionally with `:port`: no scheme, user, password, path or quotes, and not only the endpoint id. Surrounding whitespace is trimmed. A preview build refuses to migrate, and so fails, if this is unset or not a bare hostname, or if its database is that host (pooled or direct). Production builds don't read it.

On Vercel, install Neon from the Marketplace (Storage → Neon) and connect it to the project with the env prefix `POSTGRES` for Production and Preview, with preview branching on (Advanced Options → Deployments Configuration → Preview, and "Resource must be active before deployment"). That sets both `POSTGRES_URL` variables, and gives each preview deployment its own Neon branch. Under Settings → Environment Variables, add `AUTH_SECRET` (Production; also Preview if you want to sign in on previews, where a separate value is fine) and `PRODUCTION_DB_HOST` (Preview), and keep "Automatically expose System Environment Variables" on. `apps/web/vercel.json` owns the install and build commands, overriding the dashboard settings. Install switches npm to 10.9.9 first: Vercel's Node 24 ships npm 11, which refuses every npm command in this repo because of the `devEngines` pin. The build is `cd ../.. && BEARING_VERCEL_BUILD=1 npx turbo run build --filter=web`.

Sign-up is open, so anyone can make an account and spend on the Coach. Set an AI Gateway budget for the project (AI Gateway → Budgets → Projects in the dashboard, or `vercel ai-gateway budgets set project <project> --limit <dollars>`). Once it is spent the Gateway refuses requests, and the Coach shows its error with Resend.

### Schema changes

The schema lives in `packages/db/src/schema.ts`; versioned SQL migrations live in `packages/db/drizzle/`. To change the schema, edit `schema.ts`, then generate and commit the migration with the code that needs it:

```sh
npm run db:generate -w @repo/db
```

Review the generated SQL. It must work with the deployment that is still serving (add first, remove in a later deploy), because it is applied before the new code goes live. CI fails if `schema.ts` and the migrations disagree.

Vercel applies pending migrations on every build, production and preview, before `next build` (`@repo/db#db:migrate:vercel` in `turbo.json`, run by the `vercel.json` build command). It runs only when `VERCEL=1` and `VERCEL_ENV` is `production` or `preview` (any other value fails the build; `development` skips). `BEARING_VERCEL_BUILD=1`, set by the `vercel.json` build command, marks a Vercel build, so one without `VERCEL=1` (system env exposure turned off) fails instead of skipping. It runs against `POSTGRES_URL_NON_POOLING` (required; the pooled URL is never used), which is the preview's own Neon branch on preview deployments. A preview is refused unless `PRODUCTION_DB_HOST` is set to a bare hostname that isn't its own host. A failed or refused migration fails the build, so nothing is deployed. On a `web#build` cache miss, `next.config.js` also fails a production or preview build that didn't run the migrate step (for example, a bare `next build`), or that has `BEARING_VERCEL_BUILD=1` without `VERCEL=1`. A cache hit replays `.next` without running it, but the migrate step is never cached, so it has run by then. Local and CI builds skip all of this.

For local dev put the variables in `apps/web/.env.local`. `POSTGRES_URL` can point at a Neon dev branch or a local Postgres (`postgres://user:pass@localhost:5432/bearing`). Apply migrations by hand, after first setup and after pulling a schema change:

```sh
POSTGRES_URL_NON_POOLING=... npm run db:migrate -w @repo/db
```

`npm test` also runs an account-isolation test and the Coach turn tests (a scripted model, no Gateway key) against a real database when `TEST_POSTGRES_URL` is set. Locally it is skipped with a warning otherwise; in CI (`CI` set) it fails. Use a throwaway database, since the test writes and deletes its own accounts. Migrate it first:

```sh
export TEST_POSTGRES_URL=postgres://user:pass@localhost:5432/bearing_test
POSTGRES_URL_NON_POOLING=$TEST_POSTGRES_URL npm run db:migrate -w @repo/db
npm test
```

`next start` outside Vercel also needs `AUTH_TRUST_HOST=true`.

Node 24 is what the starter declares. Remote cache: `npx turbo login` then `npx turbo link`.

## Agent skills

Issues live in this repo's GitHub Issues. See `docs/agents/issue-tracker.md`.
