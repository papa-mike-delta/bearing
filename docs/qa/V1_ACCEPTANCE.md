# V1 UI cleanup and acceptance report

Tracking: [#55](https://github.com/papa-mike-delta/bearing-now/issues/55), [draft PR #56](https://github.com/papa-mike-delta/bearing-now/pull/56). Baseline: `72e128c` (merged #54). Implementation checkpoint: `b2ff24d`; subsequent commits refine verification and documentation. Review the exact PR head and its CI results before deploying.

**Release status: not signed off.** This report distinguishes source inspection, actual local browser interaction, automated regression checks and hosted acceptance. Native Safari, assistive technology, live-provider checks, existing-account cutover and owner visual approval remain open. None is implied by closed #44–#48 or green CI.

## Findings and changes

| Finding | Evidence | Resolution |
| --- | --- | --- |
| New public page could coexist with legacy sidebar, Finance and 17-type editor | Baseline `/app` could still mount the legacy shell | `/app` always opens the startup surface. There is no setup gate. |
| Saved deep links lost their destination on sign-in | Proxy/login redirected to `/app` unconditionally | Preserve validated local app path/query through login/2FA; reject external/non-app redirects. |
| Review data model and read view existed, but there was no V1 writing form | `Reviews` listed saved records; only API could create one | Guided daily/weekly/monthly form, related Items, session-owned drafts, explicit errors, duplicate period/date guard and links from Today/navigation. |
| Me, Reviews and Graph were hard to discover | Graph accessible from Library; Me required finding the Person; Reviews lacked a clear main entry | Navigation links, scrollable sidebar and keyboard skip link; existing Graph/Focus reused. |
| Public page was visually repetitive and text-heavy | Owner screenshot and source review | Warm gold/green palette, cream and terracotta sections, stronger type hierarchy, framed real product screenshot, short capture-to-recall story and clear CTA. |
| Passing screenshots disappeared on successful CI | Artifact uploaded only on failure | Upload PNG evidence and error context on every run. Exclude database dumps. |

No schema changes, automatic legacy conversion, production flag changes, live database resets or production provider calls are included.

## Execution environment and evidence

Local browser work used a production Next build, disposable PostgreSQL 16 with both migration histories, V1 enabled, two fictional invited/fixture accounts, Chromium with desktop and emulated phone layouts, America/New_York timezone, and a deterministic Coach provider. Emulated phone Chromium is not native mobile Safari. CI runs the same release suite with official Chromium and Node 22.

The initial checkpoint passed 458 unit tests, 55 V1 database tests, 25 legacy database tests, TypeScript, production build and lint (two inherited legacy navigation warnings). Its first CI browser run passed 47 checks and failed the two new reflection cases because `getByLabel(... exact: true)` did not resolve the select's label text. The corrected test uses its observed accessible combobox role. Subsequent local execution confirmed daily/weekly/monthly creation and duplicate prevention on desktop. Final CI must pass the complete corrected suite; consult the PR checks for the latest result.

Successful CI screenshots are available in the **v1-browser-evidence** artifact of the `v1-release-browser` job in [PR #56 checks](https://github.com/papa-mike-delta/bearing-now/pull/56/checks). These include desktop/phone landing, Today, Library, Me, Graph, Focus, Reviews, public interactions and the disabled-deployment setup screen. Existing Coach/Person/Search tests also capture evidence. Artifacts retain for 14 days; download review evidence before expiration. No claim is made that a screenshot alone proves backend invariants.

The previous local interactive session explicitly exercised and inspected:

- Normal login into Today; Settings → Add demo data → readiness message; Today and Journal with examples.
- Reviews → weekly, date `2026-10-24`, Wins and Priorities → Save → saved URL → reload → same saved text. No console errors observed.
- Library → New Note → a fictional health reference → Create → Connect to Me → Add connection → Me profile displays the link.
- Library → New Bookmark → File template → external reference → Create → Saved reference display, with no upload workflow.
- Graph navigation with 10 Items, one Project and nine connections; only current types in the legend.
- Full-page landing desktop/phone screenshots were visually inspected: no horizontal overflow, clear section hierarchy, readable contrasts and preserved links/CTA. Those transient local screenshots were lost when the scratch environment reset; the current CI artifacts regenerate durable review evidence. Owner approval remains pending.

These interactions supplement the automated journeys below. They do not establish that all functionality is correct on the owner's hosted account.

## All 17 approved journeys

Run `npm run test:e2e:release` against an isolated database, then repeat on the hosted preview. Each row describes actual browser coverage and its limits; APIs used to prepare fixtures or assert identity are stated. The full original requirement list is preserved in [V1_REQUIREMENTS.md](V1_REQUIREMENTS.md).

| # | Steps and expected result | Evidence / actual outcome and limit |
| --- | --- | --- |
| 1 | Register with invitation; new account is isolated and has one Me | `v1-foundations.spec.ts`: real registration controls, owned-record checks and pending-2FA refusal. Passed local/initial CI. |
| 2 | Launch offline after prior login, capture/reload/reconnect; exactly one moment and safe account switch | `v1-workflow.spec.ts`: real offline shell, IndexedDB, retry and account-switch controls; passed. Browser storage eviction remains a documented limitation. |
| 3 | Capture raw text in Journal, classify as Task, edit/complete elsewhere; one identity | Workflow browser test uses controls through capture/Inbox/editor/Journal/Search; API count corroborates one Task. Passed. |
| 4 | Create Area and Project; assign Task; distinguish inherited/direct Areas | Workflow browser test creates/selects through UI and checks inherited provenance and startup URL; database tests corroborate ownership. Passed. |
| 5 | Write checklist, tick, save, promote step once | Workflow browser test exercises editor/promotion and checks canonical count. Passed. |
| 6 | Create Routine Habit, tick steps, complete, reload, choose next occurrence | Connected browser test uses UI; one completion, independent checkmarks and fresh occurrence verified. Passed. |
| 7 | Capture Place using GPS, save and open external navigation | Connected browser test uses capture controls with mocked permission/location; correct Maps URL and no visit record. Passed. Actual device permission and external Maps launch remain manual gates. |
| 8 | Create Media Bookmark with format/creator; also inspect other categories | Connected browser test creates through UI. Interactive File Bookmark flow completed. Extensible formats and URL rules covered by contracts. Native external-app behavior remains unverified. |
| 9 | Create Person, connect media and Journal mention, confirm interaction | Connected browser test creates/links through controls, verifies mention does not imply contact, then records a real interaction. Passed. |
| 10 | Find Me, link fictional health-reference Note, preserve privacy | Interactive Note → Connect to Me → Me profile completed. Connected browser test also inspects Me (its health link is API-fixtured); cross-user invariants checked by DB tests. Hosted isolation still needs two real test accounts. |
| 11 | Multiple mood check-ins plus separate daily/weekly/monthly Reviews | Check-in controls covered by connected suite. Missing Review form fixed; new cleanup case writes all three through UI, reloads and rejects duplicate period/date. Corrected desktop case passed locally; final full-suite result in CI. |
| 12 | Run Focus, persist session once, retry lost response, see Activity | Connected browser test operates reused timer with accelerated clock and lost-response simulation. Passed; clock acceleration is explicit. |
| 13 | Configure fixed-calendar and completion-relative recurrence; no duplicate successor/history loss | Release browser configures through UI; completion/retry uses HTTP to verify invariants. Date/DST integration tests pass. Fully manual recurrence completion on hosted preview remains open. |
| 14 | Same records across Search, Library, Calendar/Agenda and Graph | Workflow/connected tests navigate controls and verify canonical IDs. Some connected records are API-fixtured; interactive Graph additionally inspected. Passed covered flows. |
| 15 | Grounded Coach, clarification, edited approval/refusal, receipts, history/memory | Coach browser suite exercises real chat/proposal UI against deterministic provider; integration enforces tenant/revision/approval safeguards. Passed. A configured live-provider smoke is still required. |
| 16 | Export → clear → restore with full associations/history and second-account preservation | Release browser uses Settings download/upload/confirmation controls; fixtures provide representative records. DB round-trip/rollback checks cover full schema and ownership. Passed. Never run destructive checks on production. |
| 17 | Trace public promises/CTA, responsive navigation and real screenshot to app behavior | Release browser checks public links, auth CTA, no obsolete promises, reduced motion and overflow. Design visually inspected locally. Owner visual review and hosted app-entry verification remain open. |

## Per-ticket coverage beyond the 17 journeys

- **#44:** Runtime contracts, priority/status rules, ownership, 2FA/session protections, canonical Me, direct/inherited Areas, recurrence/history and full-schema portability are unit/DB covered. Original components are retained/adapted as below. Existing live data conversion is deliberately not implemented by flipping the flag.
- **#45:** Real URLs/startup, Journal dates/backdating, rich long-form writing, freeform capture/commands, Inbox, search and offline retry/account-switch behavior have browser coverage. New deep-link and `/app` entry regressions exercise the real entry path rather than only test-configured V1 URLs.
- **#46:** Person/Me, media/Place, Routine values/reset, Focus, mood, Calendar and Graph are covered by connected suites. Review creation was a genuine UI gap fixed here. Actual GPS/device behavior and native browser checks remain unverified.
- **#47:** Persistent/temporary chat, explicit memory edit/delete, grounded sources, ambiguity, edited approval/refusal, errors and retry are browser covered with the fixture. DB tests cover cross-account and stale/open-editor protections. Fixture success is not live-provider certification.
- **#48:** Demo freshness/repeat/failure/removal, portability, public claims, help/metadata and build setup are covered. Real preview access, live provider, native accessibility/browser checks and visual approval were never completed merely by closing #48.

## Retained / adapted / retired inventory

| Original concept or surface | V1 disposition |
| --- | --- |
| Legacy sidebar, Dashboard/Insights Finance cards and 17-type editor | Not mounted by the V1 entry path. Legacy code/tables retained for reviewed rollback only. |
| Fixed Life Domains | Replaced with user-defined Areas/Tags and direct/inherited provenance. |
| Task/Note/Habit/Event/Goal/Person/Bookmark | Canonical seven Item types in Library/editor/capture classification. |
| Routine, Contact, Journal, medication/symptom specialized Item types | Routine is Habit template; Contact is Person; Journal/Review/Activity separate; health references link Notes to Me. No Finance Item. |
| Focus Timer / basic Graph | Existing components reused through V1 adapters, no duplicate data store. |
| Calendar/Agenda, Projects, Search | Alternate projections of canonical V1 records with real URLs. |
| Rich editor, draft/session ownership, revisions and approval safeguards | Reused and preserved; Review create form uses session-owned drafts. |
| Public navigation/source/help/open-app links | Retained with new visual design and accurate copy. |

## Outstanding acceptance gates — do not close #55 yet

1. **Hosted authentication:** The verified branch preview redirected to Vercel's sign-in page in the cloud browser. No authenticated hosted journey was performed. Provide authorized preview access and two invited disposable test accounts; record deployment SHA, flag and migration state before testing.
2. **Existing-account cutover:** Owner's screenshot definitely shows the legacy UI, but the exact deployed flag/SHA/migration state was not accessible. Resolve that on the intended environment and decide how legacy records remain available before enabling V1. No automatic conversion is claimed.
3. **Live provider:** Small configured-provider read and edited approve/refuse smoke with fictional data; no production/paid provider requests performed here.
4. **Native/device/accessibility:** Native Safari, actual mobile permission/Maps launch, screen reader, physical touch and installed-PWA behavior. Chromium emulation and accessible locators do not replace these checks.
5. **Visual approval:** Owner review of full landing-page desktop/phone evidence. Further style changes should follow that concrete review.
6. **Final head:** Require green CI and re-run affected manual flows on the exact hosted candidate. Record console/network errors, keyboard/modal focus, zoom/reflow, errors/long-content/empty states and reduced motion. Any uncovered original requirement remains open, not silently waived.

## How to reproduce and retain evidence

Use the disposable `TEST_DATABASE_URL` fixture from `e2e/README.md`; run build and `npm run test:e2e`. It provisions only its test database, starts deterministic Coach, and checks desktop/phone. With `RELEASE_BASE_URL`, the suite talks to an already running server. Provision hosted identities and provider separately using the release notes.

For a manual hosted result, record: requirement ID, URL/commit, account/device/browser, steps, expected outcome, actual outcome, screenshot/recording, pass/fail/blocked, fix reference and retest. Do not include credentials, live personal records, database dumps or unsanitized tokens in evidence.
