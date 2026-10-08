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

- `DATABASE_URL` — Neon connection string. Install Neon from the Vercel Marketplace (Storage → Neon) and connect it to the project; the integration sets `DATABASE_URL` for Production, Preview, and Development.
- `AUTH_SECRET` — random secret for Auth.js. Generate with `openssl rand -base64 32`.

For local dev put both in `apps/web/.env.local` (`vercel env pull` fetches them). `DATABASE_URL` can point at a Neon dev branch or a local Postgres (`postgres://user:pass@localhost:5432/bearing`). Create the tables once per database:

```sh
DATABASE_URL=... npm run db:push -w @repo/db
```

`next start` outside Vercel also needs `AUTH_TRUST_HOST=true`.

Node 24 is what the starter declares. Remote cache: `npx turbo login` then `npx turbo link`.

## Agent skills

Issues live in this repo's GitHub Issues. See `docs/agents/issue-tracker.md`.
