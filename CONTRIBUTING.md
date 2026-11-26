# Contributing

Start with the [README setup](README.md) using Node 22+ and disposable PostgreSQL.
Read the [approved V1 contract](docs/redesign/BEARING_V1_SPEC.md),
[architecture](docs/ARCHITECTURE.md) and [release gates](docs/RELEASE.md).

Use a feature branch and make reviewable changes. Reuse shared Zod contracts,
server services, revision checks, editor leases and audit receipts. Ownership comes
from the verified session, never user-supplied JSON. Coach tools may propose writes;
only user-approved batches execute them. Keep keys server-side. No production reset
or migration is implied by a code contribution.

Run `npm run lint`, `npx tsc --noEmit --incremental false`, `npm test`, and
`npm run build`. For domain/auth/backup changes also run `npm run test:integration`
with `TEST_DATABASE_URL` pointed at disposable Postgres. For UI/workflow changes run
`npm run test:e2e` on desktop and phone, inspect screenshots and keyboard/reduced-motion
behavior. See [e2e/README.md](e2e/README.md). Tests must use disposable data.

Include the problem, resulting behavior, actual checks and outstanding limits in
PR descriptions. Never describe a fixture-based provider run as live AI verification,
or a local run as a staging deployment. Update help/docs/metadata whenever behavior
changes. Historical ADRs describe earlier decisions; current V1 contracts and
architecture take precedence where the old model differs.
