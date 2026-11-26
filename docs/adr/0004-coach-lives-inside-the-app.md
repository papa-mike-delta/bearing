# Coach lives inside the app

> Superseded for product work on 2026-10-26 by [ADR 0005](0005-sunset-legacy-domain-and-coach.md). The in-app Coach is the V1 conversational Coach, not the removed `/api/coach` tool panel.

The Coach is an in-app panel that shares the user’s session and calls the same domain functions the UI uses. There is no separate agent process or external runtime. Tool calls are ordinary server actions that already enforce revision checks, operation ledgers, and write caps. Open-editor state is shared, so the “no write to an Item the user has open” rule is a simple check.

This keeps the safety rails in one place and makes the “same access as the user” goal concrete. The alternative (a sidecar agent with its own connection) was rejected because it would duplicate authorization logic and make the open-editor cap harder to enforce.
