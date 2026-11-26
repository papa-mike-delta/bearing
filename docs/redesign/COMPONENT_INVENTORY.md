# Original component inventory for V1

The existing implementation is a source of working mechanics, not the target ontology.
This table records the keep/rewrite/remove decisions for #44. The pre-V1 UI and
domain modules were removed on 2026-10-26 ([ADR 0005](../adr/0005-sunset-legacy-domain-and-coach.md)). Do not restore them.

| Existing source | Decision | Target / owner |
|---|---|---|
| `components/ui/*`, theme generator/import, semantic colors | Keep | Shared primitives, themes and accessibility rules |
| `components/bearing/icon`, layout primitives, badges | Keep/adapt | Seven core types and new statuses/priorities |
| `item-editor`, `item-detail-sheet`, `item-card` | Rewrite data/forms; retain explicit saves | Canonical DTOs, one Project, Areas/provenance, typed templates (#45/#46) |
| `quick-capture`, command palette, `inbox-view` | Rewrite | Freeform Journal/capture, idempotent offline outbox, organization (#45) |
| `journal-editor-view`, `journal-view` | Rewrite | Timestamped first-class Daily Log, virtual date pages, Item references (#45) |
| `dashboard-view`, `time-action-overview` | Rewrite | Today projection over canonical Tasks/Activity (#45) |
| `projects-view` | Adapt | Long-lived workspaces and classified Area Tags (#45) |
| `domain-view`, hardcoded domain cards/constants | Remove from V1 | Tag/Area filters, no Domain entity |
| `all-items-view`, search endpoint | Rewrite | Library and authorized cross-record keyword search (#45) |
| `agenda-view`, `calendar-view` | Adapt projections | Event ranges, Task due vs scheduled, birthdays, no duplicate Items (#46) |
| `graph-view` | Keep basic explorer; adapt read model | Actual V1 semantic Links and filters (#46) |
| `focus-view` and timer logic | Keep; adapt persistence | Activity sessions with stable idempotency key (#46) |
| `mood-check-in`, `reviews-view`, `insights-view` | Split/adapt | Repeatable check-in Activity, independent Reviews, accurate projections (#46) |
| Person/contact sections, Media/Place detail | Rewrite | Rich Person/Me views, simple Bookmark categories and external navigation (#46) |
| Finance Item/editor/dashboard/export | Remove from V1 | Obligations are Tasks; outcomes Goals; references Bookmarks |
| Routine Item, media tracker/progress, visit history | Remove from V1 | Routine Habit + Markdown checklist; lightweight external references |
| Coach manual JSON tools/panel | Replace interface; retain rigor principles | Grounded conversation, proposed approved writes, provider minimization (#47) |
| draft registry, browser-write outcomes, receipt explanations | Keep/adapt | Session ownership, revisions, retained drafts, unified refresh/error feedback |
| legacy domain Item/Link/backup modules | Keep current app; reuse policy | V1 services add shared runtime contracts, tenant FKs and complete manifest |
| old API domain/stats/insights/scheduler/seed/reset paths | Retire with legacy UI | `/api/v1` canonical services and per-account demo/maintenance |
| auth/session/login/2FA | Harden and keep | Strong secret, secure cookies, invite registration, verified-only data access (#44) |
| public landing, README, PWA manifest, SEO/screenshots | Rewrite at release | Honest shipped claims and actual V1 journeys (#48) |

Conversation/message/proposal tables are persistence foundations here, not a new
standalone AI memory system. The canonical structured records remain factual authority.
No component inventory decision authorizes a production reset or database conversion.
