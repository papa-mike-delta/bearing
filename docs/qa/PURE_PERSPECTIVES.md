# Pure-perspective relationship prompts (#64)

Every prompt is derived from the signed-in canonical workspace. Missing-connection
prompts store only temporary form choices; they create no view records, local
storage keys or database tables. Existing editors and the offline capture queue
retain their established draft/sync behavior.

| Perspective | Source of visible records | Missing-relationship affordance |
| --- | --- | --- |
| Today | Canonical overdue, moving and planned Items; active Habits | Connect an unlinked visible Item; review a supported inference |
| Journal | Dated Journal moments, Activities and planned Items | Attach an existing Item/Person, or file one Note from the original moment |
| Library | Canonical Items after type/status/Area/Tag filters | Connect an unlinked result or review an evidence-based proposal |
| Calendar | Canonical Items with deadline, schedule or Event dates | Connect a visible agenda Item |
| Graph | Canonical Items/Projects and Links/project membership | Connect isolated Items; place an unassigned Task in a Project |
| Search | Authorized keyword results and their canonical workspace IDs | Show prompts only for matching Item, Journal and Project results |
| Project | Canonical Items whose `projectId` is this Project | Connect a member Item or place an existing unassigned Task |
| Person | The canonical Person and its Links, moments and Activities | Connect the Person; Journal mentions remain distinct from interactions |

An Item prompt requires two existing active endpoints and no current semantic
Link. A Journal filing prompt requires an unassociated moment. Project placement
requires an existing active Project and an unassigned open Task. Evidence-based
inference cards take priority over generic prompts for the same records. Filters,
dates and search results limit scope; empty scopes show no unrelated suggestions.

All actions use the existing shared API/service: `links`, `journal/:id/relate`,
`journal/:id/organize` and `items/:id/place`. These preserve ownership, revision
checks, replay handling and ledger receipts. Cancel/open/render performs no write.
A successful action refreshes the canonical workspace and search queries; prompts
disappear based on the saved relationship, including after reload. No relationship
is inferred from sharing a view. Proposal derivation is memoized once per workspace
snapshot rather than repeated for every Journal card.

Behavioral coverage lives in `src/lib/v1/perspective-gaps.test.ts` and
`e2e/v1-perspectives.spec.ts`: scope, canonical disappearance, no fabricated
endpoints, all eight views, cancel, one canonical Link/Note/Task, Journal mention
without a fabricated interaction, receipts and stale revision refusal. The release
browser configuration includes these journeys on desktop and emulated phone.
