# Current project context

Bearing captures, organizes, connects and recalls personal information.
`/app` and `/api/v1` are the product path. There is one Prisma schema and one
client. `Account` maps to `"User"`, theme stays on `Setting`, and audit stays on
`Ledger` mapped to `"OperationLedger"`. Product rows live in `V1*` tables.

There is no feature flag and no second migration chain. The baseline in
`prisma/migrations` is for an empty database. It is not a conversion of the
retired content tables, and it is not safe to apply to a database that already
ran the previous histories.

Coach uses server-side configured providers and approved write batches.
Optional examples are per-account Settings actions. The session cookie is
`bearing-session`.

Current entry points:
- [README](README.md): install, configuration and feature boundaries.
- [Architecture](docs/ARCHITECTURE.md): storage, auth, workflow, offline and Coach.
- [Release notes](docs/RELEASE.md): deploy shape and the standalone cutover that is not done yet.
- [ADR 0006](docs/adr/0006-one-schema-one-runtime.md): the binding schema decision.
- [Contributing](CONTRIBUTING.md): development and verification expectations.

ADR 0001, ADR 0002, ADR 0004 and ADR 0005 are historical and must not be extended.
