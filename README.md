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

Open **Daily close** from today's or a past Journal day, then start when ready, or tell Paul “Daily close” / “close the day” (optionally naming a past `YYYY-MM-DD` day). Opening the button sends no turn and saves no Journal, Mood, or filing. The selected day is bound to each user message at send time in `coach_messages.close_day`; subsequent turns inherit it, and resends keep the original day and browser Today. Cancel ends the mode without domain writes. After drafts are handled or skipped, Paul calls `finishDailyClose`; its successful result in the saved assistant reply also ends the mode without domain writes. The banner clears as soon as that reply finishes streaming, without a refresh, and the next turn has normal Coach tools. **Start Daily close** always begins a fresh close, even if the day already had one: its questions, progress and summary leave out the earlier close. Completion text alone does not end the mode. Close-only tool restrictions never invalidate earlier messages, receipts or actions, including Tasks already created or filed.

Paul asks one question at a time from your saved template or the starter, appends only your answers, asks for an explicit Mood, reviews the close day's daily Habits and the weekly Habits for its Monday–Sunday week, then offers one particular Inbox draft and destination before filing. Skip any step. Close turns expose only the selected day's bounded Journal read (4,000 characters with a truncation flag), that day's habits, the template, journaling knowledge, Inbox excerpts, append, Mood, and single-draft filing. The runtime omits every other tool and retains the existing step/write caps and replay identities. Bad habits are included in the read but never due; Paul reports any counts plainly without praise or shame. Paul names the habits still due in one short reply and links to [Habits](/habits) for marking; none due or skip moves on without a write. He does not mark, create or change habits, pressure, praise a streak or count a miss against you. Habit reads stay out of the closing summary, which uses only Close progress. Each write has its own linked receipt; later failures keep earlier writes. Nothing is scheduled.

Each close turn, including the cancel turn, injects **Close progress** into the close prompt as data, read from the database rather than the thread (the Daily close module in `apps/web/lib/daily-close/`, whose `prepareCoachTurn` prepares every Coach turn; the ordinary-turn tool list and prompt live in `apps/web/lib/coach-normal-turn.ts`): the Mood, only if it was set in this close; how many answers were appended, plus each answer from this close paired with the question it answered (JSON data, at most 20 pairs of 300 characters each), which the closing summary is written from instead of the Journal text; the drafts filed; and any calls refused on the previous turn. Paul therefore doesn't re-ask for a Mood already set, and his cancel reply describes what was actually saved. The cancel turn keeps the close tool set (not the normal one), and a bare cancel writes nothing. Receipts: a Daily close refusal (`CloseRefusal`) renders no receipt, since the tool error lets Paul re-ask; every real error renders its failure receipt, even when a later call in the same reply succeeds.

[Journaling: evidence and limits](packages/coach/knowledge/journaling.md) is available to Paul and at `/coach/knowledge/journaling`, with research citations and no promised benefit.

## Habits

`/habits` has Daily and Weekly sections for once-habits and many-times habits, including Bad habits in either period, for the signed-in account. A signed-out visit goes to sign-in. Habits are not inside an Area, and there is no detail page.

**Add habit** takes a name and a choice of once or many-times. It is trimmed, 1–200 characters, and the same name can be used more than once. A blank name is refused (`Enter a habit name.`), as is a name longer than 200 characters and nothing is stored. Choose **Daily** or **Weekly**; the habit is placed at the top of its section. Weekly habits have no gate or habit limit. The **Bad** checkbox records lapses rather than completion. Many-times needs a whole-number daily goal from 1 to 99 or weekly goal from 1 to 999 unless Bad is chosen; Bad many-times offers **Limit (optional)**. An invalid goal or limit is refused and stores nothing; a missing goal is refused for habits that are not Bad.

The Daily grid is Monday–Sunday of the week that contains the browser's today. **Previous** opens earlier weeks with no horizon. **Next** stops at the current week. A later week says **This week is not open yet** and has no checks. Checking or unchecking today or a past day saves immediately. A future day cannot be checked.

For once-habits that are not Bad, the streak and the record are computed from the marks that remain. They are not stored. The streak is consecutive done days and does not reset on Monday. An empty today does not break it or lower the record. A day that has already ended without a mark does. Unchecking a day can lower the record. Sunday and the next Monday are two consecutive days.

Weekly shows four whole weeks: this week and the three before it, labeled by their Monday dates. One check or count covers Monday–Sunday in the browser's local dates, regardless of which day was clicked; its mark is stored on Monday. Checking, unchecking or changing the count saves immediately. Its own **Previous**, **Next**, and **This week** controls page earlier with no horizon, using `weekly=YYYY-MM-DD` alongside Daily's `week` query parameter. Future weeks cannot be checked. For once-habits that are not Bad, weekly streak and record follow the once-habit rules above, counted in weeks: an empty current week preserves the streak, an ended empty week breaks it, and removing a mark can lower the record.

Many-times rows show each shown day's or week's count with **+** and **−**, saving immediately. The count starts at 0; minus cannot pass 0. A habit that is not Bad is done at its goal and further pluses can reach 99 per day or 999 per week; met counts are underlined as well as accented. Another plus at the cap is refused, never clipped, without changing the count. Over-goal counts have one muted mark. These habits have no streak or record. The open period and past periods can be changed; future days or weeks are refused. Counts for a weekly habit are stored on Monday whichever day in that week is used.

Bad rows say **Bad**, show no streak or record, and never appear overdue or missed. Checking a Bad once-habit records that the lapse happened; unchecking removes it. Bad many-times shows just the count without a limit, or count/limit with one muted hairline above the limit. Bad counts never show as done or met, and the Coach reports them plainly without praise or shame.

The Habits link shows how many habits are unfinished for the browser's today (unmarked daily once-habits, many-times counts below their daily or weekly goal, and weekly once-habits empty for the week containing today, always excluding Bad habits), including 0 once today is known. Looking at an earlier week does not change that number.

**Edit** opens a form in the list to rename a habit, change its goal or limit, flip Bad, or change tracking and period. Names are trimmed, 1–200 characters. Edits keep every stored check and count; flipping Bad hides or restores streaks. Lowering or raising a goal immediately rejudges the open period as done or unfinished. Illegal goals are refused and the old goal stays. Once to many-times keeps each check as count 1 and requires a fitting goal unless Bad. Many-times to once is refused if any period has a count above 1. Turning Bad off on many-times without a goal needs a fitting goal in that same edit. Daily and Weekly can only be switched with no marks or counts; the goal must fit the destination and is never lowered automatically. An allowed period switch puts the habit at the top of the other section. Refused edits change nothing.

**Up** and **Down** buttons on each row move the habit one place within Daily or Weekly and save immediately. First/last buttons are disabled at the section ends. The buttons work by keyboard and their accessible names include the habit name; there is no drag handle.

**Delete** asks `Delete this habit and every marked day?`, then removes the habit and its marks. Cancel leaves them. There is no archive. Another account cannot read, check, count, edit, reorder, or delete the habit.

The Coach can read the habits the Habits page shows (daily and weekly, once and many-times, including Bad) with `listHabits`, using the browser's today for count/done and once-habit streaks and records, in days or weeks according to period. The read follows Habits page order: Daily by position, then Weekly by position, and the next read shows edits. In normal turns it can create and track habits when asked, with `createHabit` and `trackHabit`. Renaming, editing, reordering and deleting stay on the Habits page. Daily close uses the same read bound to the close day and the week containing that day, after mood and before Inbox drafts. Due means not done for its period and never Bad; Many-times and Bad habits have no streak or record in the read. Weekly many-times returns count, goal and done for the week containing the browser’s today, or the close day during Daily close. The Coach never calls an empty Bad day missed, describes logged lapses as recorded that day, and reports counts without praise or shame; above a Bad limit it says “over your limit of N”. Daily close habit-read failures are logged and masked as `Couldn't read your habits.`. Receipts count every listed habit, including Bad. Its receipt reads `Read your habits for <day> (N)` and links to `/habits`, including after reload; a normal turn still reads `Read your habits (N)`.

Migration `0017_daily_habits` adds `habits` and `habit_marks`; `0018_habit_counts` adds counts and the habits epic schema defaults (period, mode, goal, Bad), and creates `habit_operations`, the replay record for Coach habit writes (#95); it has no habit foreign key, so deleting a habit leaves its rows, and deleting the account removes them. Deleting a habit, or the account, removes the marks. Domain tests cover streaks, counts, goals, caps and period dates without a database. Persistence tests use `TEST_POSTGRES_URL`.

## Coach

Paul can create or track a habit on an explicit request. The ask is the confirmation. A name alone (or several) creates daily once-habits that are not Bad, with no questions about Task, period or count. When Paul asks a clarifying question, the answer creates the habit without a second confirmation. For stop, cut down or do less, Paul infers Bad, names the lapse, and says so without another confirmation: “Quit smoking” creates **Smoking**, Bad daily once; “count my cigarettes” creates Bad daily many-times without a goal. Non-Bad many-times without a goal needs a question. A goal above 99 without a period needs a question; daily goals above 99 and weekly goals above 999 are refused naming that maximum. Unclear behaviour or duplicate habit names need clarification. Tracking takes an owned id from `listHabits`, rather than guessing a name.

“I did it” checks once or adds one, for every new message, without asking whether it's a repeat (the ledger ignores resends of the same message; undo fixes an extra); undo clears the check or removes one. “I didn't” on Bad clears an existing period but leaves an empty period empty, writing nothing. “Mark it done” raises a many-times count to its goal and never lowers a higher count, and Paul calls it even when the habit is already done, so the `No change` receipt shows; Bad many-times without a goal needs a question. Dates default to the browser's Today saved with the message; past periods are allowed, future periods refused. Weekly tracking covers the Monday–Sunday week containing the date. Results return the new habit state in `listHabits` form. Daily close keeps its existing tools and reads habits only.

`createHabit` and `trackHabit` share the three-write cap with Task creation, Notes, Journal, Mood and filing. Attempts reserve the cap before awaiting; a refused fourth write keeps the first three. Receipts link to `/habits`: `Created habit '<name>'`, `Tracked '<name>' for <day or week>`, `Undid '<name>' for <day or week>`, and `No change to '<name>' for <day or week>` when nothing changed (“I didn't” on an empty Bad period, or “Mark it done” at or above the goal). Daily receipts say `today`, `yesterday` or a date like `Sun, Oct 18`; weekly receipts say `this week` or `the week of Oct 12` (its Monday). The relative words come from the browser's Today saved with the message and stored in the tool output, so they read the same after reload; an older output without it shows the date. Read receipts are muted and plain; only write receipts are underlined in the foreground colour. They keep the same text and link after reload; failures have no success receipt. Habit writes atomically store their original result in `habit_operations` from migration 0018, with no new migration. The operation id combines the person's message id, tool name and the reserved habit-call ordinal, so changed provider call ids on resend do not duplicate writes. Replays return that result without writing, including after edits or deletion; the ledger has no habit foreign key and never recreates a deleted habit.

On habit-building questions, Paul calls `searchKnowledge`, quotes the matching section and its source including what it does not support, proposes one habit (name, daily or weekly, once or many-times with a goal, Bad if cutting down), then waits for yes. He proposes a habit rather than a Task unless asked for a Task. The habit-design skill has no file and is not offered.

## Related

A Task has its own page at `/tasks/item/<taskId>`, whether it is open or completed. The name on the home list opens that page. Completed Tasks stay off the home list, and the list does not grow a Related section. The page shows the name, note, area, and status, plus the same actions the home list already has for an open Task. Completing a Task from the page leaves it at that address. Someone else's Task, or an id that is not a Task, is not found.

**Related** appears on a Task page, a Note page, and a saved Journal day. **Outgoing** and **Backlinks** are separate groups, newest first. **Add link** searches this account's Tasks by name (completed ones included and marked), Notes by title (showing the Notebook, or **No notebook**), and saved Journal days by the ISO day or the date label (Friday, Oct 9, 2026), twenty at a time. Choosing a destination stores one directed edge. The other direction is a second edge, so the two do not look like one row. A self-link is refused. Choosing an edge that already exists says so and does not add another. Cancel writes nothing. Titles and addresses are read when the page is shown: renaming a Task or Note, moving a Note to **No notebook**, or renaming an Area does not rewrite the edge. A Journal link opens `/journal/YYYY-MM-DD` at the top and is labeled by the date. The edge stores the day, not a copied title or URL.

Removing an outgoing link asks `Remove this link?`, then deletes only that edge. A backlink can be opened and cannot be removed from that side. Neither entity is deleted. Deleting a Note, or **Delete notebook and all N notes**, removes every edge that touches those Notes in the same action. **Move N notes to No notebook** keeps the Notes and the edges. There is no Task delete and no Journal delete. Completing or editing a Task does not remove edges. An edge whose other end is gone is not shown.

A future day, a day with no saved body, and a mood with no document cannot be linked and have no **Related**. Markdown and pasted URLs stay text. Paul does not create links. There are no cross-account links. Migration `0016_powerful_madrox` adds the edge table, with indexes for both directions, a uniqueness key, a self-link check, and a cascading user foreign key.

## Account

**Light or dark** on `/account` switches between Light, Dark and System (the default, following the device). The choice is saved in this browser by next-themes, which sets the `.dark` class that every built-in and imported palette styles, so it works with whichever palette is chosen. Palettes are saved per account; light or dark is per browser.

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
- `COACH_MODEL` (optional) — the AI Gateway model id the Coach uses, read on each request. Defaults to `anthropic/claude-haiku-5.5` ($0.10 / $0.50 per 1M input/output tokens, and $0.50 / $2.50 for a request over 100k input tokens), at low reasoning effort. The Gateway falls back to `openai/gpt-6-luna` (another provider, same price) when it fails, and gets the user id and the tag `coach` for spend reports; Bearing has no retry code. Limits, in `apps/web/lib/coach-turn.ts` and `@repo/coach`: a message is one text part of at most 4,000 characters, the model sees only the thread's latest 40 messages, a reply takes at most 8 model steps (each tool call uses one), and each step is capped at 1,000 tokens. Reasoning counts toward that cap and isn't streamed or saved; a reply cut off before any text counts as a failed turn, so the person can resend. Normal Coach turns offer `fileDraft`, `listInboxDrafts`, `listArea`, `createTask`, `completeTask`, `scheduleTask`, `updateTask`, `listNotebooks`, `searchKnowledge`, `createNote`, `appendJournal`, `setMood`, `createHabit`, `trackHabit`, and `listHabits` (read-only; its receipt reads `Read your habits (N)` and links to `/habits`; in Daily close it reads `Read your habits for <day> (N)`). Normal turns run `listArea` once before the model answers (`freshRead`), so each reply works from the current list and shows a list receipt. Daily close turns offer only `appendJournal`, `setMood`, `fileDraft`, `listInboxDrafts`, `listNotebooks`, `readJournalDay`, `listHabits`, `getJournalTemplate`, `readJournalingArticle`, and `finishDailyClose` (which writes nothing, isn't counted against the write caps, and ends the mode once its successful result is saved); they read only the selected owned Journal day and its habits and skip the automatic Task read. Close appends save the person's whole trimmed current message and replay with the message id, day, and append ordinal, ignoring model-selected substrings. Opening, bare skip, and cancel turns write nothing. Mood requires one unambiguous mood word without nearby negation; clearing requires an explicit request. Filing requires an affirmative reply to the previous assistant offer of one draft and destination, without negation or a destination change, and files at most one draft per reply. Both modes use `activeTools`; the last model step forces a text answer with no tools. At most one `completeTask`, at most three calls across `createTask`, `createNote`, `fileDraft`, `appendJournal`, `setMood`, `createHabit`, and `trackHabit` combined, and at most three `updateTask` and three `scheduleTask` calls run per turn. Daily close's `fileDraft`, `appendJournal`, and `setMood` share that same three-write cap. Successful create receipts read `Created task '…'`. A new one links to `/tasks/item/<taskId>`. A receipt already stored without that address still links to `/`. Filing a draft as a Task does the same: a new receipt links to the Task page, and one already stored with `/` still does. Complete receipts read `Completed '…'`, schedule receipts `Scheduled '…'` and update receipts `Updated '…'`; each links to the Task page (`/tasks/item/<taskId>`). A Note receipt reads `Created Note '…'` and links to `/notes/<notebookId>/<noteId>`; a failure has no link. A Coach-created Task's provenance `sourceId` is resend-safe: the person's message id plus a short hash of the trimmed lowercased name, so a resend after a failed turn does not add a second Task. A Note's `sourceId` is `coachNoteSourceId`: the message id, a colon, and the sha256 hex of `JSON.stringify([notebookId, title.trim().toLowerCase()])`, so a resend does not add a second Note. Of earlier turns the model sees only the text, not their tool reads. A failed turn logs one `coach.turn.error` line (a reply that fails to save logs `coach.turn.save_error`) (the error's name, message and HTTP status) to the runtime logs. Stop in the browser ends the stream there; the model call can still finish and save, so a closed tab doesn't lose a turn the Coach finished. Until reload the stopped turn says "Stopped. Reload to see the reply if the Coach finished it." (plain text, view-only, even if Stop landed before any text or only the list receipt had arrived). A reload shows the saved reply and its receipt when there is one, and the note is gone. A reply is saved just after the message it answers, so it reloads in place even if something was sent while it ran.
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

Ask Paul to show Inbox choices, then choose one draft and file it as a Task, a Note in an existing Notebook (name or id), or append it to today's or a past Journal day. `listInboxDrafts` reads at most 20 owned drafts with excerpts of at most 200 characters. `fileDraft` and the screen actions use `apps/web/lib/draft-filing/`, which archives only the chosen draft, and shows a destination link that survives thread reload. Missing or multiple choices, bulk requests, foreign drafts, future days, and attempts to change a committed destination are refused. Retries return the original result without another write; Today comes from the browser day saved with the turn. Filing shares the three-write cap with Task, Note, Journal, Mood, and Habit writes. Migration `0013_draft_filings` preserves Task and Note filing results; Journal reuses its existing draft operation record.
