# Browser tests

One Playwright config (`playwright.config.ts`) runs the release journey on
desktop and phone, plus the landing page and the login checks that still apply.

```bash
TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/bearing npm run test:e2e
```

The command migrates that disposable database, starts the deterministic Coach
fixture, and signs in the fixture account. Never point `TEST_DATABASE_URL` at a
database you need to keep.

`RELEASE_BASE_URL` runs the same projects against an already-running server and
does not start one.
