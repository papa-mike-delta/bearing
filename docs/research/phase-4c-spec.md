# Phase 4c — Explicit links between Tasks, Notes, and Journal entries

Status: Draft for review; not submitted as an epic and not approved for implementation.

This is a manually prepared specification. The requested `/to-spec` command was not available in this environment.

## Purpose

Connect work and reflection without copying text or introducing a graph application. Users can link a Task, Note, or saved Journal entry to another supported entity and navigate in either direction, including after renames and reloads.

Source: [product specification](spec.md), sections 4.6, 11.3, 11.6, and 12. This follows [4a](phase-4a-spec.md) and [4b](phase-4b-spec.md). The source explicitly leaves link extraction rules unresolved; Phase 4c uses explicit user-created links rather than inventing automatic extraction.

## Scope and interaction contract

- Supported endpoints: **Task, Note, saved Journal entry**. Areas, Goals, Notebooks, Drafts, Coach messages, habits, people, and calendar events are not link endpoints in this slice.
- Add a quiet **Related** section to the existing Task inspector, Note detail, and dated Journal view. It shows outgoing links and incoming backlinks distinctly, with current titles/types and accessible navigation.
- **Add link** opens a keyboard-accessible, session-scoped picker filtered by entity type and name; Journal results use their day label. Results are paginated/bounded and include completed Tasks. No body search is introduced.
- Selecting a destination explicitly creates a link. Repeating the selection reports that the link exists, not another row. Cancel is a no-op.
- Remove an outgoing link with a labeled action and explicit confirmation. This removes only the relationship, never either entity. Incoming backlinks offer navigation to their source rather than editing hidden source content.
- Empty Journal days cannot be endpoints; prompt the user to save content first. A stored empty body with an existing identity remains a valid endpoint.
- Ordinary external URLs and markdown links remain content. They are neither fetched nor converted into entity links. Copying a deep link does not itself create a relationship.

## Relationship semantics

Proposed default: directed links with automatically derived backlinks. A→B is one stored edge and appears as a backlink on B. If a user also explicitly adds B→A, that is a separate outgoing edge; label direction rather than presenting indistinguishable duplicate rows.

- No self-links. Cycles across distinct entities are allowed; no recursive graph expansion.
- Store endpoint type/UUID, owner, and created/updated timestamps, not a cached title or absolute deployment URL.
- Uniqueness: owner + source type/ID + target type/ID. Concurrent duplicate submissions create one edge.
- Both endpoints must exist and belong to the session user at write time. Revalidate endpoint ownership when reading links, resolving titles, or navigating.
- Resolve destination labels dynamically, so renames cannot leave stale copied titles. Journal labels use their saved day.
- Derived backlinks use the same edge table and ownership checks; do not maintain a second reverse row that can drift.
- Polymorphic endpoint references require explicit integrity handling: validate and lock endpoints as appropriate during link creation; deletion paths remove all attached edges in the same transaction. Concurrent create/delete must not leave a dangling edge. Reads defensively suppress missing endpoints.
- No cross-user relationships, public share links, or existence leaks through validation messages or picker results.

## Deep-link contract

- Preserve the Note URLs defined in 4a and the dated Journal URLs defined in 4b. Moving/renaming presentation metadata must not change entity identity.
- Add or reuse a canonical Task detail URL capable of opening an owned completed Task, not merely the current active list. Current Coach receipts link created Tasks to `/`; that does not satisfy this requirement.
- Proposed Task URL: `/tasks/item/[taskId]`, resolving the correct area and inspector or detail view. Confirm against the route tree before implementation to avoid a dynamic-route collision.
- All URLs are generated from validated entity descriptors using a shared typed resolver. Do not accept arbitrary model-provided or database-stored redirect URLs.
- Direct reload, back/forward, session redirects, and missing/foreign entity handling work. A missing/foreign entity yields the same safe not-found behavior.
- Update new Task receipts to canonical detail URLs where appropriate, but keep older stored receipts renderable. General link-manipulation tools for Paul are not required in this slice.

## Architecture boundaries

Pure endpoint validation and descriptor rules belong in the existing domain package. Session-scoped persistence and a shared link resolver belong alongside current application data functions. The UI consumes these contracts; it does not independently construct ownership checks or graph semantics.

Index both outgoing and incoming lookups and the uniqueness key. Bound list/picker results (proposed default 20 per page), and batch endpoint title resolution to avoid a query per link. No graph database, vector store, global indexing service, or new backend integration.

## Acceptance criteria

- [ ] User links an owned Task to a Note, sees the backlink on the Note, and can navigate back after reload.
- [ ] Links between each supported pair work, including same-type distinct entities and Journal endpoints.
- [ ] Repeated and concurrent add requests produce one edge; self-links and unsupported types are rejected.
- [ ] Renaming endpoints updates displayed labels without rewriting edges.
- [ ] Completed Tasks remain reachable through links and picker results; active task lists retain their existing filtering.
- [ ] Removing a link leaves both entities untouched and removes the corresponding backlink.
- [ ] Deleting an endpoint cleans up incoming/outgoing links; a concurrent link creation cannot leave an orphan.
- [ ] Foreign IDs, missing endpoints, and cross-user picker queries expose no private titles or existence information.
- [ ] Malicious markdown/URLs are not executed, fetched, or treated as internal entity relationships.
- [ ] Canonical links work on direct reload and across deployment origins; existing stored Coach receipts remain readable.
- [ ] Browser tests cover add, cancel, navigation, remove, completed Tasks, missing entities, keyboard use, and mobile layout. Unit/integration tests cover direction, uniqueness, ownership, races, cleanup, and URL validation; existing repository checks pass.

## Non-goals

Automatic link extraction, wiki-link syntax, mentions/autocomplete inside markdown, graph visualization, links involving future entity types, attachments, external URL previews, body/full-text search, public sharing, general Paul link tools, or changing Task lifecycle rules.

## Review decisions before epic submission

Approve directed edges with backlinks, explicit-only linking, the three endpoint types, completed-Task deep links, and relationship-removal confirmation. Automatic extraction remains deliberately deferred, not an unspecified implementation detail.

## Epic handoff

Suggested title: **Phase 4c: Link Tasks, Notes, and Journal entries with navigable backlinks**.

Blocked by: Phase 4b accepted and deployed (and transitively 4a). This is the final Phase 4 slice, not authorization to start Phase 5.
