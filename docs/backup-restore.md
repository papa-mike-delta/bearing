# V1 backup, clear and restore

Use Settings → Backup and restore. Export downloads a private JSON `bearing-v1`
version-1 envelope, bound to the signed-in account ID. Keep it secure: it contains
personal data and saved Coach messages. Server export is a repeatable-read snapshot.

The audited manifest in `src/lib/v1/backup-contract.ts` covers Items/Me content,
Projects, Tags/Areas, ItemTag/ProjectTag joins, typed Links, Activity, Journal moments
and references, Reviews and references, recurrence rules and occurrences,
Conversations, Messages, Proposals, Preferences and audit receipts.
Authentication secrets, invitations, editor leases, legacy tables and local-only
browser drafts/outbox are excluded. Me identity is recorded in the envelope.
Temporary Coach text is not stored, so cannot appear in an export.

Sync pending captures first and close editors in other tabs. The UI blocks clear or
restore when this browser has unsynced entries. Export before clearing. Type
`RESET V1 DATA` to enable clear; it retains account/auth identity, canonical Me ID
and append-only audit while clearing V1 content. Type `RESTORE V1 DATA`, select your
same-account JSON backup and restore. The browser accepts files up to 10 MB; the API
has a 20 MB request ceiling. Larger backups require a separately reviewed operator
procedure, not deleting data or raising limits blindly.

Restore validates all records, typed metadata, IDs and the relationship graph
before mutation. Foreign-owned/colliding IDs are refused. A late insertion failure
rolls back the entire clear and restore. Receipt identity is deduplicated and
conflicting existing receipts cannot be overwritten. Restored IDs may be remapped
where the restore contract requires it; relationships remain intact. Cross-account
migration is not supported automatically. Saved pending Coach proposals may require
a fresh preview and approval; restore never executes them.

Per-account demo removal is separate from clear. It removes only marked unedited
examples and refuses personal dependencies. It never repairs access by resetting a
database. Full operator PostgreSQL backups are additionally required for disaster
recovery, authentication and legacy data; test restoring those to an isolated DB.

Verified domain cases live in `integration/v1/foundations.test.ts`: full-table round
trip, ownership collision, late-write rollback, append-only history and demo data
preservation. Browser release tests exercise the actual Settings download/clear/
restore controls. Historical legacy backup behavior is not the V1 format.
