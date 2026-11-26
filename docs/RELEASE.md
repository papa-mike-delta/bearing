# Release

`npm run build:vercel` generates the Prisma client, runs `prisma migrate deploy`,
and builds the app. The only migration is `20261126120000_baseline`. Apply it to
an empty PostgreSQL database.

Do not run it against a database that already recorded the previous root and
`prisma/v1` histories. Deploy will try to create tables that already exist and
can leave a failed migration row. Do not use `migrate reset`, `db push`, or a
restore into a database you still need.

Local and CI tests use disposable Postgres and `TEST_DATABASE_URL`. They must
not use a hosted connection string.

Rollback of application code is a redeploy of the previous build only when that
build's migration history matches the database it serves. This baseline and the
old two-chain history are not interchangeable.

## Standalone cutover (not done in this change)

This branch is the review vehicle. It is not merged into `bearing-now` main.
The old app and its Neon database stay live as a fallback.

When the branch head is approved:

1. Create a new GitHub repository `bearing` with one initial commit from this
   tree. Do not mirror the fork history. Remove
   `vercel.json` `git.deploymentEnabled` for `cursor/unify-runtime-b846` in that
   commit so the new project can deploy.
2. Create a new Vercel project linked to `bearing`. Create two empty Neon
   databases, one for production and one for preview. Set `DATABASE_URL` and
   `SESSION_SECRET` on each environment. Copy the Coach provider, model and key.
   Do not copy the old database URL.
3. Let the first production deploy apply the baseline to the empty production
   database. Invite an account, sign in, and confirm a write.
4. Confirm a preview deploy migrates the empty preview database on its own.
5. Move the domain last, after production on the new project is verified.
6. Port GitHub issue #61 (and open child #65) if that spec is still needed.
   Recreate branch protection. Recreate Actions secrets if any exist (this
   workflow uses none). Grant the Cursor and GitHub app access to `bearing`.
7. Leave `papa-mike-delta/bearing-now`, its Vercel project, and the Marketplace
   store `bearing-now-db` untouched until you explicitly retire them.

The 12 stale branches on the fork are not copied.
