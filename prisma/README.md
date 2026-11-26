# Database setup

Bearing requires PostgreSQL. Use Node 22+ and `npm ci`, then `npm run db:generate`.
Configure a private `DATABASE_URL` for an empty database.

```bash
npx prisma migrate deploy
```

That applies `prisma/migrations/20261126120000_baseline`. The migration creates
`User`, `Setting`, `OperationLedger` and the `V1*` tables, then the CHECK
constraints, owner foreign keys, and Me triggers. It does not create the retired
content tables.

Do not apply this baseline to a database that already has the old migration
history. Do not use `db:push`, `migrate dev`, resets or drops on a database you
need to keep.

Create accounts with `npm run db:invite -- email@example.com`. Demo examples are
an explicit per-account Settings action.
