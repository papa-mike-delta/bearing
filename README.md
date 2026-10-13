# Bearing

Personal life OS. Tasks in areas, a Drafts-style inbox, and a Coach that can read and write the same data.

Turborepo, one Next.js app. Created from `npx create-turbo@latest`, then reshaped to the layout in `docs/research/spec.md`.

## Layout

- `apps/web` — the product. Deploy this.
- `packages/domain` — pure task, habit, and reconnect rules. No React, no database.
- `packages/db` — Drizzle schema and client. Postgres on Neon.
- `packages/ui` — components. No product logic.
- `packages/capture` — draft parse and action runners.
- `packages/coach` — the Coach's system prompt, skills, knowledge. No model calls.
- `packages/eslint-config`, `packages/typescript-config` — from the Turborepo starter.

`apps/docs` from the starter was removed. One app until a marketing site is actually needed.

## Areas

A new account has no Area. The home page then asks **Name an area** (`Work, Personal, …`) and shows nothing else until one exists. **Manage areas** adds and renames Areas, sets each Area's workflow and WIP limit, and hides or shows it with the Hidden checkbox. A hidden Area leaves the page; the Coach still lists it. Delete stays disabled, and the server refuses it, while the Area has any Task, including a completed one.

A new Area is a Priority List: one list, highest priority first, then oldest, and the first open Task is Next. Now/Later has Now (next, started, and waiting; the first is Next) and Later. Kanban shows In progress, Next, Waiting, and Later, including empty columns. Completed Tasks are not a column. Each Task has an **Actions** menu: Move, Priority, Goal, and Set date…. On a phone (<=480px) Kanban shows one column at a time, with a switcher that shows each column's label and count. It opens on the column holding Next, and that choice is not remembered across reloads. Whole-row drag between columns is wide Kanban only, not on a phone. The home page widens when a Kanban Area is visible. When Now has more Tasks than the Area's limit, the page says `Now has more than N`. On Kanban the same limit says `In progress has more than N`. A Priority List never warns. The limit defaults to 3 and is a whole number of at least 1. **Set date…** schedules a day after today, which moves the Task to Later and sets its age to that day. On Now/Later and Kanban, a future date sits at the bottom of Later until the day, then the Task shows only under **Just came up**. A Priority List stores the date and still shows the single list.

A Goal belongs to one Area. Its name is unique in that Area, ignoring case. A Task has one Goal or none. In a list, Tasks with no Goal come first, then each Goal that has a Task there, in Goal order. A future date is a second band at the bottom of the whole Later section, after the undated groups, so a Goal can appear twice. **Just came up** stays one flat list and does not name the Goal. Goals are a collapsed section under the list, where they can be added, renamed, reordered, or deleted. Deleting a Goal keeps its Tasks.

`createTask` takes `name`, an optional `note`, and an optional `area`. With more than one Area, `area` is that Area's name (one match, ignoring case). With one Area, leave `area` out; a name passed anyway is ignored. No Area, or a name that matches none or several, is refused. It is the same path as adding a Task on the list or filing a Draft from the Inbox. `scheduleTask` takes a Task id and a date after today. `updateTask` changes the name, note, priority from -2 to 2, status, or Goal, and leaves out any field it should keep. A Goal of null or an empty string clears it. Status is `started`, `next`, `waiting`, or `later`. `completeTask` is the only way to complete a Task. It cannot change the Area, the date, or the workflow.

## Notes

`/notes` lists Notebooks. When any Note has no Notebook, `/notes` also lists those Notes under **No notebook**. Each links to `/notes/_/<noteId>`. That page requires the Note to have no Notebook, and its breadcrumb is **No notebook**, linking to `/notes`. `/notes/_` redirects to `/notes`. `/notes/<notebookId>` lists that Notebook's Notes. `/notes/<notebookId>/<noteId>` opens one Note. Notebook ids are uuids, so `_` does not name a Notebook.

**New notebook** on `/notes` creates a Notebook. The name is trimmed and must be 1–200 characters, and the same name can be used more than once. A blank or longer name is refused (`Use a notebook name between 1 and 200 characters.`). A Notebook is not renamed. A Note title follows the same rule. **Delete notebook** asks `Delete this notebook?` when the Notebook has no Notes. When it has Notes, choose **Move N notes to No notebook** (those Notes stay, under **No notebook**) or **Delete notebook and all N notes**. Cancel leaves the Notebook as it is.

**File as note** in the Inbox picks a Notebook and a title. The title starts as the draft's first non-blank line, and the full draft becomes the body. With no Notebook, the Inbox links to `/notes` (`Create a notebook first`). Raw HTML is disabled. In `apps/web/lib/markdown.ts`, a link may use `http`, `https`, or `mailto`, or a relative URL that is not protocol-relative; an image loads only from `https`. Other schemes are dropped.

**Save Note** is explicit. There is no autosave. The status reads `Saving…`, `Unsaved changes`, or `Saved`. A body over 100,000 characters is kept as typed and cannot be saved (`Body exceeds 100,000 characters. Shorten it before saving; your text has not been truncated.`). Save checks the Note's revision. If it changed in another tab, the unsaved text stays and the page says `Conflict: this Note changed in another tab. Your unsaved text is kept here. Copy it before reloading to compare with the latest version.` **Pin this Note** is stored with that save. Pinned Notes are listed first, then most recently updated. **Delete Note** asks `Delete this Note permanently? Any unsaved changes will also be lost.` Afterward the page returns to that Notebook, or to `/notes` when the Note had none.

Migration `0007_notes_fks` makes `notes.notebook_id` nullable and adds foreign keys. Deleting a user cascades to that user's Notes and Notebooks. Deleting a Notebook can leave its Notes with no Notebook (`ON DELETE SET NULL`). Before those keys are added, the migration deletes Notes and Notebooks whose user is missing, and clears `notebook_id` on Notes whose Notebook is missing.

## Journal

`/journal` opens the browser's Today at `/journal/YYYY-MM-DD`. Previous, the date field, and Next navigate calendar days; Next stops at Today. Future days say **This day is not open yet** and have no editor or Save. Impossible dates return not-found. Today refreshes at local midnight and when the browser regains focus; an open dated entry keeps its original day.

Each person has one private markdown document per day. Viewing an empty day creates nothing. The first nonempty **Save** creates an entry; later saves update it with a revision check. Empty or whitespace-only saves write nothing, including on an existing entry. The Notes editor, safe preview, 100,000-character bound, save status, conflict handling, and unsaved-work guard are shared. A conflict preserves the unsaved text for comparison. Migration `0008_journal_entries` adds the table, unique person/day index, and cascading user foreign key. Journal persistence tests apply migrations to an isolated temporary Postgres database using `TEST_POSTGRES_URL`.

### Links to Journal days

In Notes and Journal previews, ordinary markdown links to exactly `/journal/YYYY-MM-DD` fade until that account has a saved Journal entry for the valid day. Preview resolves the first 100 distinct linked days with one session-owned, read-only query; additional days remain faded. Reference-style markdown links work too. Following a future link opens the not-open page; an empty today or past day opens its editor. Rendering and navigation create nothing, and stored markdown, external links, and URL safety rules stay unchanged. Saving an open Journal day refreshes its preview links.

### Mood for the day

Today and past Journal days offer five large, labeled Lucide faces: **Very low**, **Low**, **Okay**, **Good**, and **Very good**. Their colors follow the active theme. Buttons support keyboard focus and pressed state; **Clear** returns to **No mood set**. Future days have no mood controls. Mood saves independently of the editor, so a day can have a mood without a document or a document without a mood.

`apps/web/lib/mood.ts` provides the shared, user-scoped `setMood` and read-only `getMood`. Migration `0011_day_scores` adds one nullable mood per user/day with a word CHECK and cascading user foreign key. Missing and cleared moods are `null`, never Okay or zero. Writes validate real days against the supplied browser Today and use client epoch milliseconds (`setAt`) for ordering; callers retain that timestamp on retries and issue later timestamps for new choices. Older and equal timestamps change nothing, including after a clear. The UI offers **Retry mood** with the original request after a failed response. Real Postgres tests cover persistence, document independence, validation before writes, replays, concurrency, ownership, constraints, and cascade deletion.

### Journal template

**Edit template** in the Journal opens `/journal?template=edit`; it uses the shared markdown editor and safe preview. Each account starts with Gratitude, Best thing, and Hard part sections. Custom templates preserve exact text up to 10,000 characters; longer text is refused without truncation. **Always load template** defaults off and is stored independently of the template.

An empty today or past day offers **Insert template**, or preloads the template when always-load is on. These prompts stay virtual and do not trigger the unsaved-work warning until edited. Save refuses an empty body or untouched template on both client and server. Existing days, future days, Inbox append, and Paul are unaffected; changing a template never rewrites a day. Viewing settings creates no row. Migration `0010_journal_settings` adds account storage with a cascading user foreign key; Postgres tests cover defaults, bounds, ownership, read-only viewing, and save behavior.

### Append an Inbox draft

**Append to journal** in the Inbox defaults to the browser's Today and can target an earlier calendar day. Success archives the entire draft and shows a link to that day. Existing text is preserved with two newlines before the draft; invalid or future days, an already filed draft, or a result over 100,000 characters leave the Inbox unchanged.

`apps/web/lib/journal.ts` owns the shared `appendJournal` mutation. Append, draft archive, and durable provenance commit together. Migration `0009_journal_operations` stores receipts and payload hashes apart from editable journal bodies: a retry returns the original day and entry even after a hand edit; changed text or day under the same operation conflicts. SQL appends preserve concurrent additions, and revision checks reject stale full-page saves. The Postgres append tests cover these cases using `TEST_POSTGRES_URL`.

### Ask Paul to save a reflection or Mood

Paul's `appendJournal` tool appends only the reflection text explicitly requested, through the same Journal mutation as Inbox filing. `setMood` sets an explicitly stated mood word or clears it on request; Paul never infers Mood from prose. Both accept Today or a named past day, refuse future days, and require a valid browser day. Successful receipts link to `/journal/<day>` after thread reload; failures have no success link. Ordinary turns have no Journal read; Daily close reads only the selected day, capped at 4,000 characters (readJournalDay).

Migration `0012_coach_message_day` binds the browser day to the triggering user message. Resends retain that day across midnight; append operation ids are the message id, the resolved day, and the 1-based ordinal of appendJournal calls in that turn. Changed payloads under an existing operation conflict. Mood uses the stored message's creation time, so an older resend cannot replace a newer choice or clear. The tools share the three-call limit with `createTask` and `createNote`, counted before awaiting, and retain the eight-step limit. Postgres tests use scripted models without a Gateway key to cover receipts, replay, calendar errors, limits, and ownership.

### Daily close with Paul

Open **Daily close** from today's or a past Journal day, then start when ready, or tell Paul “Daily close” / “close the day” (optionally naming a past `YYYY-MM-DD` day). Opening the button sends no turn and saves no Journal, Mood, or filing. The selected day is bound to each user message at send time in `coach_messages.close_day`; subsequent turns inherit it, and resends keep the original day and browser Today. Cancel ends the mode without domain writes.

Paul asks one question at a time from your saved template or the starter, appends only your answers, asks for an explicit Mood, and offers one particular Inbox draft and destination before filing. Skip any step. Close turns expose only the selected day's bounded read (4,000 characters with a truncation flag), the template, journaling knowledge, Inbox excerpts, append, Mood, and single-draft filing. The runtime omits every other tool and retains the existing step/write caps and replay identities. Each write has its own linked receipt; later failures keep earlier writes. Nothing is scheduled.

Each close turn, including the cancel turn, injects **Close progress** into the close prompt as data, read from the database rather than the thread (the Daily close module in `apps/web/lib/daily-close/`): the day's recorded Mood, how many answers were appended, the drafts filed, and any calls refused on the previous turn. Paul therefore doesn't re-ask for a Mood already set, and his cancel reply describes what was actually saved. The cancel turn keeps the close tool set (not the normal one), and a bare cancel writes nothing. Receipts: a Daily close refusal (`CloseRefusal`) renders no receipt, since the tool error lets Paul re-ask; every real error renders its failure receipt, even when a later call in the same reply succeeds.

[Journaling: evidence and limits](packages/coach/knowledge/journaling.md) is available to Paul and at `/coach/knowledge/journaling`, with research citations and no promised benefit.

## Related

A Task has its own page at `/tasks/item/<taskId>`, whether it is open or completed. The name on the home list opens that page. Completed Tasks stay off the home list, and the list does not grow a Related section. The page shows the name, note, area, and status, plus the same actions the home list already has for an open Task. Completing a Task from the page leaves it at that address. Someone else's Task, or an id that is not a Task, is not found.

**Related** appears on a Task page, a Note page, and a saved Journal day. **Outgoing** and **Backlinks** are separate groups, newest first. **Add link** searches this account's Tasks by name (completed ones included and marked), Notes by title (showing the Notebook, or **No notebook**), and saved Journal days by the ISO day or the date label (Friday, Oct 9, 2026), twenty at a time. Choosing a destination stores one directed edge. The other direction is a second edge, so the two do not look like one row. A self-link is refused. Choosing an edge that already exists says so and does not add another. Cancel writes nothing. Titles and addresses are read when the page is shown: renaming a Task or Note, moving a Note to **No notebook**, or renaming an Area does not rewrite the edge. A Journal link opens `/journal/YYYY-MM-DD` at the top and is labeled by the date. The edge stores the day, not a copied title or URL.

Removing an outgoing link asks `Remove this link?`, then deletes only that edge. A backlink can be opened and cannot be removed from that side. Neither entity is deleted. Deleting a Note, or **Delete notebook and all N notes**, removes every edge that touches those Notes in the same action. **Move N notes to No notebook** keeps the Notes and the edges. There is no Task delete and no Journal delete. Completing or editing a Task does not remove edges. An edge whose other end is gone is not shown.

A future day, a day with no saved body, and a mood with no document cannot be linked and have no **Related**. Markdown and pasted URLs stay text. Paul does not create links. There are no cross-account links. Migration `0016_powerful_madrox` adds the edge table, with indexes for both directions, a uniqueness key, a self-link check, and a cascading user foreign key.

## Scripts

```sh
npm install
npm run dev
npm run build
npm test
```

## Environment

Sign-in is Auth.js with email and password and a database session in Postgres. The database is Neon.

- `POSTGRES_URL` — pooled Neon connection string, used by the app.
- `POSTGRES_URL_NON_POOLING` — direct Neon connection string, used to apply migrations.
- `AUTH_SECRET` — random secret for Auth.js. Generate with `openssl rand -base64 32`. Needed wherever sign-in has to work. A deployment without it still builds, but sign-in fails at runtime.
- `COACH_MODEL` (optional) — the AI Gateway model id the Coach uses, read on each request. Defaults to `anthropic/claude-haiku-5.5` ($0.10 / $0.50 per 1M input/output tokens, and $0.50 / $2.50 for a request over 100k input tokens), at low reasoning effort. The Gateway falls back to `openai/gpt-6-luna` (another provider, same price) when it fails, and gets the user id and the tag `coach` for spend reports; Bearing has no retry code. Limits, in `apps/web/lib/coach-turn.ts` and `@repo/coach`: a message is one text part of at most 4,000 characters, the model sees only the thread's latest 40 messages, a reply takes at most 8 model steps (each tool call uses one), and each step is capped at 1,000 tokens. Reasoning counts toward that cap and isn't streamed or saved; a reply cut off before any text counts as a failed turn, so the person can resend. Normal Coach turns offer `fileDraft`, `listInboxDrafts`, `listArea`, `createTask`, `completeTask`, `scheduleTask`, `updateTask`, `listNotebooks`, `searchKnowledge`, `createNote`, `appendJournal`, and `setMood`. Normal turns run `listArea` once before the model answers (`freshRead`), so each reply works from the current list and shows a list receipt. Daily close turns offer only `appendJournal`, `setMood`, `fileDraft`, `listInboxDrafts`, `listNotebooks`, `readJournalDay`, `getJournalTemplate`, and `readJournalingArticle`; they read only the selected owned Journal day and skip the automatic Task read. Close appends save the person's whole trimmed current message and replay with the message id, day, and append ordinal, ignoring model-selected substrings. Opening, bare skip, and cancel turns write nothing. Mood requires one unambiguous mood word without nearby negation; clearing requires an explicit request. Filing requires an affirmative reply to the previous assistant offer of one draft and destination, without negation or a destination change, and files at most one draft per reply. Both modes use `activeTools`; the last model step forces a text answer with no tools. At most one `completeTask`, at most three calls across `createTask`, `createNote`, `fileDraft`, `appendJournal`, and `setMood` combined, and at most three `updateTask` and three `scheduleTask` calls run per turn. Daily close's `fileDraft`, `appendJournal`, and `setMood` share that same three-write cap. Successful create receipts read `Created task '…'`. A new one links to `/tasks/item/<taskId>`. A receipt already stored without that address still links to `/`. Filing a draft as a Task does the same: a new receipt links to the Task page, and one already stored with `/` still does. Complete receipts read `Completed '…'` without a link (the Task has left the home list, and stays on its Task page). Schedule receipts read `Scheduled '…'` and update receipts read `Updated '…'`, neither with a link. A Note receipt reads `Created Note '…'` and links to `/notes/<notebookId>/<noteId>`; a failure has no link. A Coach-created Task's provenance `sourceId` is resend-safe: the person's message id plus a short hash of the trimmed lowercased name, so a resend after a failed turn does not add a second Task. A Note's `sourceId` is `coachNoteSourceId`: the message id, a colon, and the sha256 hex of `JSON.stringify([notebookId, title.trim().toLowerCase()])`, so a resend does not add a second Note. Of earlier turns the model sees only the text, not their tool reads. A failed turn logs one `coach.turn.error` line (the error's name, message and HTTP status) to the runtime logs. Stop in the browser ends the stream there; the model call can still finish and save, so a closed tab doesn't lose a turn the Coach finished. Until reload the stopped turn says "Stopped. Reload to see the reply if the Coach finished it." (plain text, view-only, even if Stop landed before any text or only the list receipt had arrived). A reload shows the saved reply and its receipt when there is one, and the note is gone. A reply is saved just after the message it answers, so it reloads in place even if something was sent while it ran.
- `AI_GATEWAY_API_KEY` (local only) — an AI Gateway API key for the Coach in local dev, in `apps/web/.env.local`. Don't set it in the Vercel project: a key that is present always wins over OIDC, even if it's invalid.
- `VERCEL_OIDC_TOKEN` (set by Vercel) — how deployed builds authenticate to the Gateway, with no stored key. Vercel provides it to builds and functions, so the project stores no Gateway key. It's in Turbo's `globalPassThroughEnv`, not `globalEnv`: it changes on every build, so hashing it would defeat the build cache. Locally, `vercel env pull` writes one that expires after 12 hours, if you'd rather not use a key.
- `PRODUCTION_DB_HOST` (Vercel, Preview; required there) — the host of production's `POSTGRES_URL_NON_POOLING`, e.g. `ep-xxxx-xxxx.us-east-2.aws.neon.tech`. Just the full host, optionally with `:port`: no scheme, user, password, path or quotes, and not only the endpoint id. Surrounding whitespace is trimmed. A preview build refuses to migrate, and so fails, if this is unset or not a bare hostname, or if its database is that host (pooled or direct). Production builds don't read it.

On Vercel, install Neon from the Marketplace (Storage → Neon) and connect it to the project with the env prefix `POSTGRES` for Production and Preview, with preview branching on (Advanced Options → Deployments Configuration → Preview, and "Resource must be active before deployment"). That sets both `POSTGRES_URL` variables, and gives each preview deployment its own Neon branch. Under Settings → Environment Variables, add `AUTH_SECRET` (Production; also Preview if you want to sign in on previews, where a separate value is fine) and `PRODUCTION_DB_HOST` (Preview), and keep "Automatically expose System Environment Variables" on. `apps/web/vercel.json` owns the install and build commands, overriding the dashboard settings. Install switches npm to 10.9.9 first: Vercel's Node 24 ships npm 11, which refuses every npm command in this repo because of the `devEngines` pin. The build is `cd ../.. && BEARING_VERCEL_BUILD=1 npx turbo run build --filter=web`.

Sign-up is open, so anyone can make an account and spend on the Coach. Set an AI Gateway budget for the project (AI Gateway → Budgets → Projects in the dashboard, or `vercel ai-gateway budgets set project <project> --limit <dollars>`). Once it is spent the Gateway refuses requests, and the Coach shows its error with Resend.

### Schema changes

The schema lives in `packages/db/src/schema.ts`; versioned SQL migrations live in `packages/db/drizzle/`. To change the schema, edit `schema.ts`, then generate and commit the migration with the code that needs it:

```sh
npm run db:generate -w @repo/db
```

Review the generated SQL. It must work with the deployment that is still serving (add first, remove in a later deploy), because it is applied before the new code goes live. Migration `0004_areas_workflows_dates` drops `areas_user_id_unique`. Ship that migration and the deploy together: the old sign-up code used `ON CONFLICT` on that index, and account creation breaks once the constraint is gone. CI fails if `schema.ts` and the migrations disagree.

If `main` gained a migration while yours was open, delete yours, rebase, and re-run `db:generate`. Drizzle applies a migration only when its timestamp is newer than the last applied one, so an older-stamped file merged second is silently skipped.

Vercel applies pending migrations on every build, production and preview, before `next build` (`@repo/db#db:migrate:vercel` in `turbo.json`, run by the `vercel.json` build command). It runs only when `VERCEL=1` and `VERCEL_ENV` is `production` or `preview` (any other value fails the build; `development` skips). `BEARING_VERCEL_BUILD=1`, set by the `vercel.json` build command, marks a Vercel build, so one without `VERCEL=1` (system env exposure turned off) fails instead of skipping. It runs against `POSTGRES_URL_NON_POOLING` (required; the pooled URL is never used), which is the preview's own Neon branch on preview deployments. A preview is refused unless `PRODUCTION_DB_HOST` is set to a bare hostname that isn't its own host. A failed or refused migration fails the build, so nothing is deployed. On a `web#build` cache miss, `next.config.js` also fails a production or preview build that didn't run the migrate step (for example, a bare `next build`), or that has `BEARING_VERCEL_BUILD=1` without `VERCEL=1`. A cache hit replays `.next` without running it, but the migrate step is never cached, so it has run by then. Local and CI builds skip all of this.

For local dev put the variables in `apps/web/.env.local`. `POSTGRES_URL` can point at a Neon dev branch or a local Postgres (`postgres://user:pass@localhost:5432/bearing`). Apply migrations by hand, after first setup and after pulling a schema change:

```sh
POSTGRES_URL_NON_POOLING=... npm run db:migrate -w @repo/db
```

`npm test` also runs an account-isolation test and the Coach turn tests (a scripted model, no Gateway key) against a real database when `TEST_POSTGRES_URL` is set. Locally it is skipped with a warning otherwise; in CI (`CI` set) it fails. Use a throwaway database, since the test writes and deletes its own accounts. Migrate it first:

```sh
export TEST_POSTGRES_URL=postgres://user:pass@localhost:5432/bearing_test
POSTGRES_URL_NON_POOLING=$TEST_POSTGRES_URL npm run db:migrate -w @repo/db
npm test
```

`next start` outside Vercel also needs `AUTH_TRUST_HOST=true`.

### Password

Signed in, **Account** in the header opens Change password. It checks the current password, stores a new hash with the same rules as sign-up (at least 8 characters), and signs out every other session for that account. On a phone (<=480px), **Sign out** is on the Account page.

Locked out, reset from a terminal. The usual case is a production account:

```sh
PRODUCTION_DB_HOST=ep-xxxx-xxxx.us-east-2.aws.neon.tech \
POSTGRES_URL_NON_POOLING='<production direct URL from Vercel>' \
npm run reset-password -w web -- --production you@example.com
```

For a local or dev database, pass `--no-prod-check` (or set `PRODUCTION_DB_HOST`):

```sh
POSTGRES_URL_NON_POOLING=... npm run reset-password -w web -- --no-prod-check you@example.com
```

It reads `POSTGRES_URL_NON_POOLING`, falling back to `POSTGRES_URL`, and never prints the connection string. It must run in a terminal; it refuses when stdin isn't a TTY. `PRODUCTION_DB_HOST` is required (the script refuses without it) unless `--no-prod-check` is passed for a database that is definitely not production, in which case it warns and runs. It refuses when the database host matches `PRODUCTION_DB_HOST` (compared like the migrate guard: case, port, and Neon's `-pooler` suffix ignored) unless `--production` is passed. A `PRODUCTION_DB_HOST` that isn't a bare hostname is refused. It prints the target as host/db (no credentials, `(production)` when it's the production host), asks you to type the email again (a mismatch aborts), then asks for the new password twice without echoing it (a mismatch aborts; nothing is written). Leave it blank to generate one, which is printed once. Ctrl-C cancels without changing anything. Every session for that account is signed out.

Node 24 is what the starter declares. Remote cache: `npx turbo login` then `npx turbo link`.

## Agent skills

Issues live in this repo's GitHub Issues. See `docs/agents/issue-tracker.md`.

### Paul files one Inbox draft

Ask Paul to show Inbox choices, then choose one draft and file it as a Task, a Note in an existing Notebook (name or id), or append it to today's or a past Journal day. `listInboxDrafts` reads at most 20 owned drafts with excerpts of at most 200 characters. `fileDraft` uses the screen mutations, archives only the chosen draft, and shows a destination link that survives thread reload. Missing or multiple choices, bulk requests, foreign drafts, future days, and attempts to change a committed destination are refused. Retries return the original result without another write; Today comes from the browser day saved with the turn. Filing shares the three-write cap with Task, Note, Journal, and Mood writes. Migration `0013_draft_filings` preserves Task and Note filing results; Journal reuses its existing draft operation record.
