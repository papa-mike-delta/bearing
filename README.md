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

## Areas

A new account has no Area. The home page then asks **Name an area** (`Work, Personal, …`) and shows nothing else until one exists. **Manage areas** adds and renames Areas, sets each Area's workflow and WIP limit, and hides or shows it with the Hidden checkbox. A hidden Area leaves the page; the Coach still lists it. Delete stays disabled, and the server refuses it, while the Area has any Task, including a completed one.

A new Area is a Priority List: one list, highest priority first, then oldest, and the first open Task is Next. Now/Later has Now (next, started, and waiting; the first is Next) and Later. Kanban shows In progress, Next, Waiting, and Later, including empty columns. Completed Tasks are not a column. A Task moves with a column button or by dragging its handle. When Now has more Tasks than the Area's limit, the page says `Now has more than N`. On Kanban the same limit says `In progress has more than N`. A Priority List never warns. The limit defaults to 3 and is a whole number of at least 1. **Date** schedules a day after today, which moves the Task to Later and sets its age to that day. On Now/Later and Kanban, a future date sits at the bottom of Later until the day, then the Task shows only under **Just came up**. A Priority List stores the date and still shows the single list.

A Goal belongs to one Area. Its name is unique in that Area, ignoring case. A Task has one Goal or none. In a list, Tasks with no Goal come first, then each Goal that has a Task there, in Goal order. A future date is a second band at the bottom of the whole Later section, after the undated groups, so a Goal can appear twice. **Just came up** stays one flat list and does not name the Goal. Empty Goals are listed on the Area so they can be added, renamed, reordered, or deleted. Deleting a Goal keeps its Tasks.

`createTask` takes `name`, an optional `note`, and an optional `area`. With more than one Area, `area` is that Area's name (one match, ignoring case). With one Area, leave `area` out; a name passed anyway is ignored. No Area, or a name that matches none or several, is refused. It is the same path as adding a Task on the list or filing a Draft from the Inbox. `scheduleTask` takes a Task id and a date after today. `updateTask` changes the name, note, priority from -2 to 2, status, or Goal, and leaves out any field it should keep. A Goal of null or an empty string clears it. Status `completed` completes the Task. It cannot change the Area, the date, or the workflow.

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
- `COACH_MODEL` (optional) — the AI Gateway model id the Coach uses, read on each request. Defaults to `anthropic/claude-haiku-5.5` ($0.10 / $0.50 per 1M input/output tokens, and $0.50 / $2.50 for a request over 100k input tokens), at low reasoning effort. The Gateway falls back to `openai/gpt-6-luna` (another provider, same price) when it fails, and gets the user id and the tag `coach` for spend reports; Bearing has no retry code. Limits, in `apps/web/lib/coach-turn.ts` and `@repo/coach`: a message is one text part of at most 4,000 characters, the model sees only the thread's latest 40 messages, a reply takes at most 8 model steps (each tool call uses one), and each step is capped at 1,000 tokens. Reasoning counts toward that cap and isn't streamed or saved; a reply cut off before any text counts as a failed turn, so the person can resend. The Coach's tools are `listArea`, `createTask`, `completeTask`, `scheduleTask`, and `updateTask`. Bearing runs `listArea` once at the start of every turn (`freshRead`), before the model answers, so each reply works from the list as it is now and shows a list receipt. The turn offers `createTask`, `completeTask`, `scheduleTask`, `updateTask`, and `listArea` through `activeTools` (there is no turn-wide `toolChoice: "none"`); the last model step forces a text answer with no tools. At most one `completeTask` and at most three `createTask` calls run per turn. Successful create receipts read `Created task '…'` and link to `/`; complete receipts read `Completed '…'` without a link (the Task has left the list). Schedule receipts read `Scheduled '…'` and update receipts read `Updated '…'`, neither with a link. A Coach-created Task's provenance `sourceId` is resend-safe: the person's message id plus a short hash of the trimmed lowercased name, so a resend after a failed turn does not add a second Task. Of earlier turns the model sees only the text, not their tool reads. A failed turn logs one `coach.turn.error` line (the error's name, message and HTTP status) to the runtime logs. Stop in the browser ends the stream there; the model call can still finish and save, so a closed tab doesn't lose a turn the Coach finished. Until reload the stopped turn says "Stopped. Reload to see the reply if the Coach finished it." (plain text, view-only, even if Stop landed before any text or only the list receipt had arrived). A reload shows the saved reply and its receipt when there is one, and the note is gone. A reply is saved just after the message it answers, so it reloads in place even if something was sent while it ran.
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

Review the generated SQL. It must work with the deployment that is still serving (add first, remove in a later deploy), because it is applied before the new code goes live. Migration `0004_areas_workflows_dates` drops `areas_user_id_unique`. Ship that migration and the deploy together: the old sign-up code used `ON CONFLICT` on that index, and account creation breaks once the constraint is gone. CI fails if `schema.ts` and the migrations disagree.

If `main` gained a migration while yours was open, delete yours, rebase, and re-run `db:generate`. Drizzle applies a migration only when its timestamp is newer than the last applied one, so an older-stamped file merged second is silently skipped.

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

### Password

Signed in, **Account** in the header opens Change password. It checks the current password, stores a new hash with the same rules as sign-up (at least 8 characters), and signs out every other session for that account.

Locked out, reset from a terminal. The usual case is a production account:

```sh
PRODUCTION_DB_HOST=ep-xxxx-xxxx.us-east-2.aws.neon.tech \
POSTGRES_URL_NON_POOLING='<production direct URL from Vercel>' \
npm run reset-password -w web -- --production you@example.com
```

For a local or dev database, pass `--no-prod-check` (or set `PRODUCTION_DB_HOST`):

```sh
POSTGRES_URL_NON_POOLING=... npm run reset-password -w web -- --no-prod-check you@example.com
```

It reads `POSTGRES_URL_NON_POOLING`, falling back to `POSTGRES_URL`, and never prints the connection string. It must run in a terminal; it refuses when stdin isn't a TTY. `PRODUCTION_DB_HOST` is required (the script refuses without it) unless `--no-prod-check` is passed for a database that is definitely not production, in which case it warns and runs. It refuses when the database host matches `PRODUCTION_DB_HOST` (compared like the migrate guard: case, port, and Neon's `-pooler` suffix ignored) unless `--production` is passed. A `PRODUCTION_DB_HOST` that isn't a bare hostname is refused. It prints the target as host/db (no credentials, `(production)` when it's the production host), asks you to type the email again (a mismatch aborts), then asks for the new password twice without echoing it (a mismatch aborts; nothing is written). Leave it blank to generate one, which is printed once. Ctrl-C cancels without changing anything. Every session for that account is signed out.

Node 24 is what the starter declares. Remote cache: `npx turbo login` then `npx turbo link`.

## Agent skills

Issues live in this repo's GitHub Issues. See `docs/agents/issue-tracker.md`.
