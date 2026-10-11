# Phase 4a — Inbox to Notes, with Paul

Status: Draft for review; not submitted as an epic and not approved for implementation.

This is a manually prepared specification. The requested `/to-spec` command was not available in this environment.

## Purpose

Give captured text a durable home other than a Task. A user can file a Draft into a Notebook, edit and pin the resulting Note, reopen it through a stable link, and ask Paul to create a Note through the same mutation.

Source: [product specification](spec.md), sections 4.4, 7, 8, and 11. Phase sequence: **4a → [4b](phase-4b-spec.md) → [4c](phase-4c-spec.md)**. Each slice must be independently deployable.

## Existing implementation anchors

- `apps/web/lib/drafts.ts`: task filing archives a session-owned Inbox Draft and creates its Task in one transaction. Preserve this behavior.
- `apps/web/lib/coach-tools.ts`: tools receive session identity and stable message identity through typed context, not model input; mutations share the screen data layer.
- `packages/coach/src/receipts.ts`: current receipt links only support `/`. Extend this contract for entity-specific URLs without breaking stored Task receipts.
- Keep pure rules in `packages/domain`, persistence in the existing database/application layer, and SDK-independent tool contracts in `packages/coach`.

## User journeys and scope

1. Open Notes, create a named Notebook, and see an empty state with an Inbox capture action.
2. In Inbox, choose **File as note**, choose an owned Notebook, review the proposed title, and confirm. Preserve the entire original Draft body, including its first line and markdown. The title defaults to the first nonblank line, but is editable before filing.
3. After a successful transaction, the Draft leaves Inbox and the UI offers the created Note's deep link. A failed write leaves the Draft in Inbox with actionable feedback.
4. Open a Notebook, select a Note, edit its title/body, explicitly save, pin/unpin, and reopen after reload. Pinned Notes sort first, then most recently updated, with an ID tie-breaker.
5. Ask Paul to create a Note in a named Notebook. An explicit creation request authorizes the write. Paul resolves the Notebook from user-scoped metadata; ambiguous or absent destinations require clarification rather than guessing or creating a Notebook.
6. Delete a Note only through an explicit UI confirmation. Notebook deletion, moving Notes, and Coach deletion are not part of this slice.

Ordinary text capture continues to land in Inbox first. Do not add a competing quick-create text workflow in Notes. Explicit Coach creation remains the documented exception.

## Editor and navigation contract

- Use a maintained markdown editor, not a custom editing engine. Proposed default: CodeMirror with markdown support; verify compatibility during implementation.
- Store markdown as text, not editor-specific JSON. Provide a safe rendered preview supporting headings, lists/checklists, links, tables, fenced code with syntax highlighting, horizontal rules, highlight syntax, and embedded HTTPS images. Document the chosen highlight syntax in the UI help.
- Disable raw HTML execution and unsafe URL schemes. No uploads, pasted binary images, embeds, or server-side remote URL fetching. Failed remote images must not break editing.
- Share the editor/preview with 4b. It must be keyboard accessible, preserve pasted markdown, expose unsaved/saving/saved/error states, and prevent silent navigation loss. CJK composition must not trigger submission.
- Proposed routes: `/notes`, `/notes/[notebookId]`, and `/notes/[notebookId]/[noteId]`. These are authenticated and server-validated. Reload and copied URLs open the same Note.
- Use the existing shell, theme, density, and responsive patterns. Do not redesign the product or introduce new design tokens solely for Notes.

## Data and mutation invariants

- Notebook: UUID, owner, name, created/updated timestamps.
- Note: UUID, Notebook reference, title, markdown body, pinned flag, created/updated timestamps, and a revision for optimistic concurrency.
- Persist filing provenance and Coach operation identity. A committed filing retry returns its existing result; concurrent retries create at most one Note. Deleting a result must not make an old operation silently recreate it.
- All Notebook/Note reads and writes scope to the session user, including ownership of the selected Notebook. Invalid or foreign IDs must not reveal another user's content or existence.
- Note creation and Draft archive/provenance commit atomically. Invalid destinations or failures roll back all changes. A Draft already filed as a Task cannot later be filed as a Note by a stale submission.
- Editing with an outdated revision returns a conflict and preserves the unsaved text; never silently overwrite another tab's save.
- Proposed input bounds: trimmed names 1–200 characters, body at most 100,000 characters; reject oversize input, never truncate captured content. Empty Notes are allowed when a nonempty title is supplied; blank Drafts cannot be filed.
- Paul `createNote` calls the same validated creation path and uses server-owned operation identity following the existing Task replay pattern. Count creation attempts before awaiting and preserve existing per-turn limits; retries do not duplicate Notes.
- Tool success returns validated Note identity and a server-constructed local URL. Persist receipts so links survive thread reload. Failure must never render a success receipt.

## Acceptance criteria

- [ ] Capture markdown → file into a Notebook → open Note → edit/save → reload retains exact body and chosen title.
- [ ] Pinning persists and ordering is deterministic; copied links open the right Note.
- [ ] A failed filing leaves the Draft untouched; a retry after a committed response is lost returns the existing Note.
- [ ] Concurrent filings and a race between Task and Note filing produce only one destination.
- [ ] Foreign Notebook, Note, and Draft IDs cannot be read, modified, linked in receipts, or used as destinations.
- [ ] Stale saves preserve the user's unsaved work and present a conflict rather than losing an edit.
- [ ] Paul creates a Note only in a resolved owned Notebook; replay is idempotent and receipt navigation works after thread reload.
- [ ] Note deletion requires confirmation; revisiting its URL shows a safe not-found state.
- [ ] Markdown fixtures cover tables, code, highlights, pasted source, images, malicious HTML, and unsafe links.
- [ ] Desktop/mobile browser checks cover filing, editing, pinning, deletion, error states, keyboard operation, and reload. Unit/integration tests cover atomicity, races, ownership, validation, replay, and conflicts. Existing repository checks still pass.

## Non-goals

Journal, mood, Daily close, general entity links/backlinks, Notebook PINs, folders, uploads, full-text search, public API, import/export, collaboration, and editor replacement across unrelated existing surfaces. A Note deep link is not the entity graph planned in 4c.

## Review decisions before epic submission

Approve the proposed editor, explicit-save behavior, field bounds, direct Coach creation exception, and Note deletion scope. These are proposed defaults, not claims about shipped behavior. Full-text search remains Phase 9; Notebook PINs remain Phase 10.

## Epic handoff

Suggested title: **Phase 4a: File Inbox Drafts into markdown Notes and enable Paul createNote**.

Dependency: current Phase 3 baseline. Deliver this entire vertical slice before starting 4b; do not submit tickets or implement as part of this specification-only step.
