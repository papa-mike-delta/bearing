# Bearing — capture, connect and recall

An open-source, self-hostable personal knowledge workspace built with Next.js 16,
React 19, TypeScript, Prisma and PostgreSQL.

## What it does

- Quick Capture, Inbox and a chronological Daily Journal with references to real Items.
- Seven Item kinds: Task, Note, Habit, Event, Goal, Person and Bookmark. Routine is
  a Habit template with a simple Markdown checklist; Me is one canonical Person.
- Optional Projects, Areas/Tags, typed Links, keyword Search, Calendar/Agenda and Graph.
- Task recurrence, independent Habit occurrence checklists, multiple mood check-ins,
  guided Reviews and Focus sessions persisted as Activity.
- Per-account offline text capture after a prior authenticated visit, with an IndexedDB
  outbox, automatic reconnect sync, retry states and server idempotency.
- Conversational Coach using a server-configured OpenRouter or Vercel AI Gateway
  model: owned-record evidence, clarification, editable approved atomic change batches,
  saved/temporary conversations and explicit editable memory.
- Invitation-only accounts, revision checks, editor leases, audited writes, per-account
  optional demo examples and full JSON export/clear/restore in Settings.

![Daily Journal with fictional sample data](public/screenshots/v1-journal.png)

There is no public shared-demo login. A hosted deployment must be provisioned by its
operator. Sign in with your own account; a new account requires an invitation.
After sign-in, Settings → Add demo data explicitly creates examples in your account.

## Local setup

Requires **Node.js 22+**, npm and PostgreSQL 16 or newer. Use a disposable local database.
CI runs PostgreSQL 18, the client major on the current GitHub runner, so `pg_dump` and the service match.
This repository has one Prisma schema and one migration baseline, intended for an
empty database.

```bash
git clone https://github.com/papa-mike-delta/bearing.git
cd bearing
npm ci
cp .env.example .env
# Edit DATABASE_URL and set SESSION_SECRET to a unique random value (32+ characters).
# Generate a secret with: openssl rand -hex 32
npm run db:generate
npx prisma migrate deploy
npm run db:invite -- you@example.com
npm run dev
```

Open `/login`, choose Create account and use the email-bound invitation. The new
account contains only Me. Use Settings for optional fictional examples.

## Configuration

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Private PostgreSQL connection; use TLS as required by your provider |
| `SESSION_SECRET` | Unique server signing key, minimum 32 characters in production |
| `BEARING_COACH_PROVIDER` | `openrouter` or `gateway`; optional Coach configuration |
| `BEARING_COACH_MODEL` | Model identifier supported by the selected provider |
| `OPENROUTER_API_KEY` / `AI_GATEWAY_API_KEY` | Server-only provider key |

Coach is unavailable until configured. The client discloses provider and model use
before sending chat. Read [Coach configuration and privacy](docs/redesign/CONVERSATIONAL_COACH.md)
before enabling it. Never expose keys through `NEXT_PUBLIC_*`.

`npm run build:vercel` generates the client, applies the one baseline with
`prisma migrate deploy`, and builds Next.js. Do not point that command at a
database that already has the previous two migration histories. Do not use
`db:push`, `migrate dev`, `db:reset` or database drops against data you need.

The session cookie is `bearing-session`.

## Verification

```bash
npm run lint
npx tsc --noEmit --incremental false
npm test
TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/bearing npm run test:integration
npm run build
TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/bearing npm run test:e2e
```

Database tests create and drop a randomly named schema. The browser suite uses a
separately provisioned disposable database and may reset test accounts. Never
supply a live connection string to test commands. See [CONTRIBUTING](CONTRIBUTING.md),
[architecture](docs/ARCHITECTURE.md), [release notes](docs/RELEASE.md), and
[ADR 0006](docs/adr/0006-one-schema-one-runtime.md).

MIT licensed. Original project by karim-coder; developed by Bearing contributors.
Copyright (c) 2026 Life OS. Copyright (c) 2026 Bearing contributors.
