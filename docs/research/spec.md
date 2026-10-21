# Lunatask clean-room research

Date: 2026-10-07
Method: public documentation, public API reference, public marketing and roadmap only.
Not done: no binary, no Electron asar, no decompile, no asset or copy lift.

This is a behavior spec for an independent product. Productivity methods named below (Now/Later, Eisenhower, MoSCoW) are general techniques. Lunatask's name, wordmark, icons, screenshots, and marketing copy are not reusable.

Working name: Bearing. Coach: Paul. bearing.now is available. See section 14.

## 1. Clean-room frame (Artcraft, done literally)

Artcraft's public claim, from [photocraft AGENTS.md](https://github.com/storytold/photocraft/blob/main/AGENTS.md):

> We studied Photoshop and other proprietary editors for behaviour and look only. Never copy their code, shaders, profiles or assets. Implement from public specs and observation.

Useful process, stripped of the Adobe-suite hype:

1. Read the vendor's own docs and watch the product. Write down behavior, not pixels.
2. Forbid copying code, shaders, icons, screenshots, and brand assets. Third-party assets need a license row.
3. Turn observed behavior into your own spec before any UI code.
4. Implement from that spec. Tests lock behavior, not visual clones.
5. Do not reuse the other product's name.

Public skepticism of Artcraft (vibe-coded lookalikes, broken color science) is a warning: "clean room" is a process constraint, not a quality claim. This pack follows the constraint. Visual direction below is deliberately not Lunatask's.

Lunatask itself ships releases only. The GitHub repo `lunatask/lunatask` is a release bucket, not source.

## 2. What the product is

Lunatask is a personal, single-user life OS:

- tasks in "areas of life", with a per-area workflow
- habits
- journal + mood / energy / stress
- notes and notebooks
- relationship tracker (personal CRM)
- a today/tomorrow calendar used for time blocking, not as a real calendar
- no agent. Capture, sort, and review are manual

Ours keeps that, drops end-to-end encryption, adds a Drafts-style inbox, and adds a Coach: a chat agent with the user's data, write tools, a small science knowledge base, and web research. Vercel AI SDK plus AI Gateway. See section 8.

Platforms: macOS, Windows, Linux (Snap), iOS, Android. No web app. FAQ says Lunatask 3 will leave Electron so a web app becomes possible. Desktop is the source of truth for tokens, export, and most integrations.

Positioning against Todoist and TickTick is explicit on their site: automatic age-and-priority sort, fewer dates, less rescheduling guilt.

Built in Prague and Berlin. Cloud is AWS US East 1 (Virginia).

## 3. Information architecture

```
Account
  Area of life          (workflow, email-in address, default new-task bucket)
    Goal                (folder inside an area; not its own list)
      Task
        subtasks, estimate, priority, status, motivation, eisenhower,
        scheduled_on, sources[], pin, markdown note
  Habit                 (global, not per area)
    activities, streak, recurrence, optional calendar block
  Notebook
    Note                (markdown, pin, optional PIN on notebook)
  Journal entry         (per day, template, shared day-level mood)
  Person
    hierarchy group, reconnect rule, custom fields, timeline notes, happy memories
  Day
    mood, energy, stress   (one value each)
    calendar blocks        (tasks, habits, external events)
  Draft                  (ours, not theirs — see section 7)
  Coach thread           (ours — see section 8)
    messages, tool calls, proposed writes
  Knowledge article      (static, not user data — habits, journaling, goals)
```

Areas are contexts that compete for the same attention, not topic tags. Their own guide says start with Work and Personal. Chores, finance, and health should be goals inside Personal, not areas. Prioritization does not cross areas. "Next to work on" is a cross-area overview, capped (top 10 for Priority List areas).

Deep links (their scheme, do not copy): `lunatask://tasks/{uuid}`, `notes/`, `areas/`, `people/`. Also links to modules, not just entities.

## 4. Feature parity map

Parity target is observable product behavior. E2E encryption is out of scope on purpose (section 6).

### 4.1 Tasks and workflows

Source: [workflows](https://lunatask.app/docs/features/tasks/workflows), [tasks overview](https://lunatask.app/docs/features/tasks/overview), [task entity](https://lunatask.app/api/tasks-api/entity).

Create: big add button, hover-add on a section, `A` / Cmd+N. New tasks land in a configurable initial bucket (default Later).

Sort, in every workflow: highest urgency bolded as "next". Automatic sort is age, then priority. Scheduling a future task resets age to the day it becomes actionable, and forces status `later`.

Priority is an integer `-2..2` (highest to lowest). `0` is normal and also the clear value.

Status values from the API:

| API | UI |
| --- | --- |
| `later` | Later |
| `next` | Next |
| `started` | In progress |
| `waiting` | Waiting |
| `completed` | Done |

`previous_status` is stored. `progress` is percent or null. `estimate` is minutes.

Workflows, one per area:

| Workflow | Sections | Gating | Sort |
| --- | --- | --- | --- |
| Priority List | none | free | manual priority; overview shows top 10 only |
| Now / Later | Now, Later | free, default | age + priority. WIP warning on Now |
| Kanban | In progress, Next, Waiting, Later | free | same. Encourages finishing in-progress. WIP on In progress. `W` sends to Waiting |
| Must / Should / Want | Now split into Must, Should, Want, plus Later | premium | age + priority, inside motivation |
| Plan Your Days | Today, Tomorrow, Later (sections hide if empty) | free | date. They recommend against it |
| Eisenhower | Now split into Do now / Delegate / Do later / Avoid, plus Later | premium | quadrant, then priority, then age |
| Plan Ahead | Today / This week / This month / This year / Later | roadmap, not shipped | n/a |

Eisenhower mapping they publish: important+urgent = Do now; not important+urgent = Delegate / Push back; important+not urgent = Do later; neither = Avoid / Eliminate.

Motivation API values include `unknown` plus the Must/Should/Want set. Eisenhower is an integer quadrant (`0` default).

Other task behavior, from docs and shortcuts:

- Pin (`P`), duplicate (`D`), complete (`C`), delete, bulk edit, select-all.
- Subtasks.
- Link extraction from the description.
- Quick note sidebar, toggled with the calendar (`Cmd+S`).
- Estimate in minutes.
- Pomodoro-style timer: `F` starts 25 minutes on the selected task, `Q` cancels.
- Work-in-progress limit, warning only, per workflow.
- Recurring tasks. Docs distinguish them from habits: tasks have richer recurrence ("every month on the last day", "every three weeks on Tuesday") and no streaks. Completion should spawn the next occurrence. Page fetch failed; treat recurrence rules as a gap to confirm in-app before coding the edge cases.
- Email-in per user: subject becomes name, body becomes note. SendGrid receives, then they encrypt. Inbox-area pattern is their own recommendation.

### 4.2 Scheduling and time blocking

Source: [future tasks](https://lunatask.app/docs/features/tasks/scheduling/date-based-scheduling), [calendar](https://lunatask.app/docs/features/calendar).

Two meanings of a date:

- In Now/Later-family workflows, a date is a reminder, not a plan. Do not schedule "today". Future tasks sit at the bottom as Later. On the day, they surface in a "just came up" strip with a red badge. User must move them into the current bucket or postpone. No midnight reshuffle.
- In Plan Your Days, a date is the plan. Today / Tomorrow / Later.

Natural language date parse. Shortcut `S`. Mobile long-press.

Calendar is a today sidebar, plus tomorrow if the sidebar is wide (desktop). Not a week or month view. Drag tasks and habits onto the day. External events are read-only.

Calendar connect (premium): Google, Outlook, Proton, iCloud, Fastmail, Hey, Facebook Events, any ICS/CalDAV. One-way into the app. Desktop talks to providers; mobile reads the OS calendar SDK. Google/Outlook realtime on desktop; other desktop feeds ~5 min; mobile ~2 min. No per-calendar visibility toggles, to avoid double-booking blind spots. Join button for Zoom, Meet, Teams, BBB TUM. Event-to-note (premium, desktop): template, notebook, linked back to the event.

### 4.3 Habits

Source: [habits](https://lunatask.app/docs/features/habits). Each bullet gives Lunatask's behaviour, then what Bearing ships (epic #25).

- Daily vs weekly. Lunatask: a Sunday-only habit is still daily, because tracking is per day. Bearing: Daily and Weekly sections, and weekly is not premium in v1 (decided, Paul, 2026-10-21). A weekly habit covers the Monday–Sunday week in the browser's local dates, and its mark is stored on the Monday.
- Once vs many-times. Many-times has a goal count ("3 times a day"). Bearing: a daily goal is a whole number from 1 to 99, a weekly goal from 1 to 999. The count may pass the goal up to the same cap, and an over-goal count shows one muted mark.
- Bad habits: no widget, no calendar block, no streak, no incomplete count. Can be many-times (cigarettes). Bearing: the row says Bad, shows no streak or record and is never due. A Bad many-times habit may have no goal, or a goal that acts as a limit.
- Custom recurrence on daily habits (Tue/Fri). Weaker than task recurrence. Bearing: not built. Every daily habit is due every day.
- Streaks: current (end of the consecutive block) and record. Hidden on many-times (that number is the count) and on bad habits. Bearing: the same rules, computed from stored marks and never stored themselves, in days or weeks. An empty current day or week does not break a streak.
- Track. Lunatask: double-click a day, or the complete icon on a calendar block; Alt/Option or long-press decrements; hold Space/Shift for single-click entry. Bearing:
  - A once-habit is a single-click checkbox for each day, or each week.
  - A many-times habit has **−** and **+**, and the count between them can be tapped to type a total (#134). Typing sets the total; it never adds.
  - Today and past periods can be tracked; future periods are refused. Every change saves immediately.
  - The Coach tracks through `trackHabit` (§8.2).
  - There is no double-click, no modifier-key decrement, and no calendar block.
- Auto time block: "at 8:30", optional duration, default 15 min. Many-times can have multiple reminders. Bearing: not built.
- Widget at the bottom of the task calendar, habit order, shows the next one needing attention. Bearing: not built.
- Routines (habit groups): basic, desktop only. Bearing: not built.
- Habit order. Bearing: up and down buttons within the Daily or Weekly section, with no drag (#93).
- Free plan: 7 habits. Bearing v1: weekly habits are not premium (Paul, 2026-10-21). v1 has no habit limit and no premium flag.

### 4.4 Journal, mood, notes

Journal ([docs](https://lunatask.app/docs/features/journal)): auto entry per day, open with smiley or `M`. Multiple entries per day share one mood, one energy, one stress. Customizable template (gratitude, best thing, hard part). Optional 4-digit PIN. Happy memories from people also appear in the journal stream. Per-person timeline notes do not.

Mood ([docs](https://lunatask.app/docs/features/mood-tracker)): one value per day, meant to be set in the evening. Energy and stress are premium. Charts compare to the previous period (grey line) plus a percent delta. Charts can be hidden.

Notes: no dedicated docs page in the sidebar. From marketing, shortcuts, API, and roadmap:

- Notebooks, optional PIN.
- Markdown: tables, highlight, syntax highlighting, horizontal rules, pasted markdown, embedded images.
- Pin, deep link, delete.
- Search hits note names only. Full-text and in-note search are roadmap (in-note search claimed shipped on desktop in v2.1.28).
- Note nesting / folders is roadmap, not current.

### 4.5 Relationships

Source: [relationships](https://lunatask.app/docs/features/relationships).

Hierarchy. The page says seven groups and then lists eight: Family, Extended family, Intimate friends, Close friends, Casual friends, Acquaintances, Business contacts, Almost strangers. Sections collapse. Family and business can be hidden.

Reconnect, per person:

- rule ("every month", "every two weeks", "every Friday")
- last connected
- due (computed)
- agreed date (optional; clears the red badge until that date)
- `R` sets last connected to today

Custom fields, eight types, user-named: email (mailto), phone (call or WhatsApp), link, social profile URL, date (relative), anniversary (annual), birthday (age + lead reminder), markdown text.

Happy memories: a timeline on the person, also shown in the journal. Year-end review is the stated use.

### 4.6 Shell features

- Search: Cmd+K / Cmd+F. Names only, plus jump to area, goal, notebook. Full-text is not shipped.
- Notifications and badges: red badge for just-came-up tasks and due reconnects. Habit reminders from calendar blocks.
- Weather widget: IP geolocation, 5 min refresh, manual override, C/F, feels-like. Disableable. Skip in v1.
- Keyboard map is part of the product. See [shortcuts](https://lunatask.app/docs/keyboard-shortcuts). Copy the idea (single-key nav), not the branding.
- Import/export: current export is incomplete and unstable. Redesign (machine dump + human folder) is in progress. Import path is the API, Zapier, Shortcuts. No first-party importers.
- Community: Slack, idea portal, public roadmap. MCP server is planned.

### 4.7 Integrations

| Channel | Direction | Notes |
| --- | --- | --- |
| Email-in | in | per user, subject/body |
| Browser extension | in | save page as task |
| Zapier | in only | encryption blocks outbound |
| iOS/Mac Shortcuts | in | |
| Widgets | read | iOS and Android |
| Siri / voice | in | create task |
| API token | mostly in | cannot read encrypted fields |
| Calendars | in | premium, one-way |
| Webhooks | none | servers cannot see plaintext |

## 5. Public API (the part E2E breaks)

Base: `https://api.lunatask.app`. Auth: bearer token from desktop Settings → Access tokens. No scopes published.

Errors: 400, 401, 402 free-plan limit, 404, 422, 500, 503, 524.

Documented routes:

- Tasks: list, show, create `POST /v1/tasks`, update, delete
- Notes: list, create, update, delete
- Habits: track activity
- Journal: create entry
- People: list, show, create, delete
- Person timeline notes: create

Create-task body: `area_id`, `goal_id`, `name`, `note` (markdown), `status`, `motivation`, `eisenhower`, `estimate`, `priority`, `scheduled_on`, `completed_at`, `source`, `source_id`. Duplicate `source`+`source_id` on an open task in the same area returns 204 and does not create.

List/show responses omit encrypted text. Name and note are not returned. Webhooks cannot exist. This is the constraint the user is dropping.

## 6. Drop E2E, keep a normal API

Their stack, from [privacy](https://lunatask.app/docs/getting-started/privacy): Curve25519, XSalsa20-Poly1305, Argon2id, via libsodium / tweetnacl. Asymmetric so inbound email and API creates can be encrypted to the user's public key on arrival. Master password never leaves the client. Servers cannot search, webhook, or two-way sync.

Replacement, explicit non-goal of matching their crypto:

- TLS in transit.
- Postgres encryption at rest (disk, provider-managed).
- Optional per-notebook PIN as a UI lock, not a key.
- Server can read plaintext. That unlocks full-text search, outbound webhooks, two-way calendar, a real API, and the Coach. An agent cannot coach against ciphertext.
- Say this in the product. Do not market it as zero-knowledge.

Do not implement NaCl, master-password key derivation, or client-side ciphertext in v1. It is the thing being removed.

## 7. Drafts layer (the add)

Drafts (Agile Tortoise) is a capture inbox plus actions. A draft is text until an action files it. Actions are ordered steps: transform, then send (email, reminder, file, URL scheme, script). Inbox vs archive. Tags. Syntax per draft. Action groups. Bulk run.

Lunatask creates directly into the current module (`A` means task, note, habit, person, or entry depending on where you are). Capture and filing are the same gesture. That is the gap.

Our rule: every new piece of text lands in Inbox as a draft. Filing is a second, explicit action.

Draft fields: `id`, `body` (markdown), `title` (first line), `tags[]`, `syntax`, `created_at`, `workspace` (`inbox` | `archive` | `trash`), `action_log[]`.

Built-in actions, v1:

| Action | Result |
| --- | --- |
| File as task | parse first line as name, rest as note, pick area/goal, default Later |
| File as note | pick notebook |
| Append to journal | today's entry, or a new one |
| Log on person | timeline note, optional "connected today" |
| Track habit | increment named habit for today |
| Split to tasks | one task per checklist line or per line |
| Archive | leave inbox, keep searchable |
| Copy deep link | after filing |

Parser hints, not a new language: leading `#` tags, `@area`, `^priority`, `~date` natural language. If no hint, action asks. TaskPaper-style `- task @tag` is enough; do not invent a second syntax.

Global capture: one shortcut from anywhere (their `A` stays module-local; ours adds `Cmd+Shift+Space` or similar into the inbox). Capture never requires choosing a destination first.

The Coach is a third way in, not a replacement. Chat writes go through the same domain functions as a Drafts action. A filed draft and a coach-created task are the same row.

## 8. Coach

The coach is named Paul. Not a Lunatask feature. Their product has no agent. This is the second add, beside the inbox.

The Coach is a chat surface with the signed-in user's data. It answers questions about that data, edits it when asked, runs named skills, and can search the web. It is not a therapist and it does not get a raw database connection.

### 8.1 Stack

Vercel's AI toolkit, nothing else:

- `ai` (AI SDK): `streamText` on the server, `tool()` with Zod input schemas, `generateObject` when a skill must return a structured plan. Agent loop is the SDK step loop (`stopWhen` / step cap), not a hand-rolled planner.
- `@ai-sdk/react`: `useChat` on the client. Streams text and tool calls. No separate chat state library.
- AI Gateway: one `AI_GATEWAY_API_KEY`, model ids like `openai/gpt-6-astra` or `spacexai/grok-4.7`. Failover and spend live in the gateway, not in our code. Swap models by changing the id.
- Route: `POST /api/coach` in `apps/web`. Session cookie required. The handler loads tools bound to `userId`.

Do not add LangChain, a vector database, or a second agent framework in v1. The SDK tool loop is the agent.

Web research is not a Gateway feature. It is a tool we implement (`webSearch`), calling whatever search API we pick. Use a model's built-in web search only if that model exposes it through the SDK; still wrap it so the rest of the tool list stays stable.

### 8.2 What it can see and change

Tools call `packages/domain` and `packages/db`. The model never sees SQL. Every tool is scoped to the session user. PIN-locked notebooks are excluded unless the user has unlocked them this session.

Read tools:

- `today` — just-came-up, Now / In progress, habits due, reconnects due, today's mood if set
- `search` — tasks, notes, journal, people, drafts. Full-text once it exists; names until then
- `getTask`, `listArea`, `listHabits`, `journalRange`, `getPerson`
- `listHabits(day?)`: this account's habits in Habits-page order, with the period's count, goal, done, and streak or none. Without `day` it shows only the open period (the browser's Today and the week containing it). With an optional past `day` (YYYY-MM-DD, today or earlier) it returns the period containing that day: that day for daily habits, its Monday–Sunday week for weekly ones. A future `day` is refused. A habit is due when it is not done for its period and is not Bad; daily habits are due until done that day, and weekly habits are due until done that week. (`day` ships in #141.)

Write tools, same mutations the UI uses:

- `createTask`, `updateTask`, `completeTask`, `scheduleTask`
- `fileDraft` — inbox text into task, note, journal, or person note
- `appendJournal`, `setMood`
- `createHabit`, `trackHabit`
- `trackHabit` actions:
  - `did`: check a once-habit, or add one to a many-times habit.
  - `didnt`: Bad habits only. Clears the period only if it was already logged.
  - `markDone`: a habit that is not Bad goes up to its goal and is never lowered. On a Bad once-habit it records the lapse (count 1), like `did`. On a Bad many-times habit it is refused and the Coach asks how many times there were in total instead.
  - `setCount`: sets an explicit total the person stated (§4.3).
  - `undo`: restores the count from before the Coach's last write to that habit and period, including after a `setCount` total. If that write created the mark, undo deletes it. Undo is never a blind −1. If nothing can be restored, the Coach asks for the total rather than guessing. (Paul, Oct 21, 2026.)
- `logPerson` — timeline note, optional last-connected = today
- `createNote`

A user message that asks for a create or a field edit is the confirmation. Deletes, bulk edits, and anything that completes more than one task require a confirm card in the thread before `execute`. The model proposes; the UI commits. Log every tool call on the thread.

Internet:

- `webSearch` — query in, short excerpts and URLs out. Used for "what does the evidence say", not for fetching the user's own data.

### 8.3 Skills

A skill is a markdown file with a name, a description, and the tools it is allowed to call. The model can load one with `readSkill`. v1 set:

| Skill | Does |
| --- | --- |
| Weekly review | read the week, list completed vs stuck, propose moves to Later or Now. Does not apply until the user says so |
| Habit design | turn "I want to run" into a cue, a tiny version, a recurrence. Writes a habit only if asked |
| Reconnect | who is due, draft a one-line reach-out, log it if the user sent it |
| Daily close | prompt the journal template, set mood, file stray inbox drafts |
| Empty Now | if Now is over the WIP limit, propose what goes back to Later |

Skills are prompts plus an allow-list. They are not code plugins. New skills are files in `packages/coach/skills`.

### 8.4 Knowledge base

Static markdown in `packages/coach/knowledge`, shipped with the app. `searchKnowledge` returns a section, not the whole corpus. The system prompt carries a short index (titles only). Do not embed this in v1; the corpus is small enough to search by heading.

Write it from primary sources, and say what those sources do not support. Starter set:

- Habits. Cues beat motivation (Wood and Neal). Implementation intentions: if-then plans (Gollwitzer). A new habit is not 21 days; Lally et al. 2010 found a median around 66 days, with a wide range. Missing a day does not reset the behavior. Streaks are a display, not a moral score. Bad-habit tracking counts occurrences; it does not shame.
- Journaling. Pennebaker's expressive-writing work is about structured disclosure, not a daily gratitude quota. Gratitude interventions (Emmons and others) have small effects. One mood, energy, and stress value per day matches the product and the "reflect on the whole day" rule. The coach does not diagnose from a mood chart.
- Goals. Locke and Latham: specific and challenging beats "do your best", with feedback. WOOP (Oettingen): wish, outcome, obstacle, plan. A goal in this app is a folder inside an area, not a vision board. The coach files tasks under a goal; it does not create a new area because the user named a topic.
- Coaching boundary. Reflect, ask one question, propose a next task or habit. No diagnosis, no clinical advice, no "you have ADHD" from a task list. If the user is in crisis, point at local emergency services and stop coaching.

Each article ends with the citation. The coach quotes the article, not a vibes summary.

### 8.5 UI

A right-hand column or a route at `/coach`, same type and accent as the rest of the app. No avatar, no sparkle. Tool calls render as a one-line receipt ("Created task 'Call dentist' in Personal"), linked to the entity. Proposed deletes render as a confirm button. Thread history is per user, persisted.

Context the panel can attach: the open task, note, or person id, passed into the request so "schedule this for Friday" resolves without a search.

### 8.6 Limits

- Step cap per turn (8 is enough). A turn that wants more should ask.
- No tool that runs arbitrary code, sends email, or calls the public API with the user's token. Writes go through domain functions.
- Replay identity is content-keyed, never the provider tool-call id (#140), so a resent message cannot apply a write twice. Coach-created Tasks and Notes set `source = coach` and `source_id` = the message id plus a content hash: for a Task, the first 16 hex of SHA-256 of the trimmed, lowercased name; for a Note, SHA-256 of the notebook id and the trimmed, lowercased title. Habit and Journal writes are keyed in `habit_operations` and `journal_operations` as `<message id>:<tool>:<hash>:<occurrence>`, where the hash covers the normalized arguments (resolved day; Journal text trimmed; habit id, action and count; for `createHabit`, name and resolved defaults) and the occurrence counts the same content earlier in that reply. A Daily close reply appends to the Journal at most once: the whole answer goes in as one entry with occurrence 1 (`daily-close/tools.ts`).
- Write cap per reply: at most 3 writes across `createTask`, `createNote`, `fileDraft`, `appendJournal`, `setMood`, `createHabit` and `trackHabit`, plus separately 1 `completeTask`, 3 `updateTask` and 3 `scheduleTask`. Only applied writes count: refused, failed, not-found or unchanged writes release their slot.
- Applied writes and never-retract (#141): normal turns and Daily close put an "Applied writes in this thread (saved receipts; these happened)" block in the system prompt, built from the reloaded thread's successful write receipts (the last 10, absolute dates). An earlier receipt is a real write; the Coach never retracts it, and only a later write receipt changes it. `listHabits` without `day` shows only the open period, so the Coach reads past periods with `day`.
- Knowledge base is not user data and is not mixed into export.

### 8.7 Keeping the Coach current

Every feature that changes what the person can see or do also updates the Coach in the same ticket: the read tools that expose it, the system prompt line that describes it (including what the Coach still cannot do), and its receipts. The Coach never describes a screen that no longer matches the product. Daily close's reads follow the same rule. Tickets state this as acceptance criteria; it is not deferred to a later "Coach" ticket.

## 9. Visual direction

Lunatask's docs voice is emoji, sparkle, and "beautiful" grids. The user wants that just a little less... cartoony. Keep a unified color scheme, instead of the whole rainbow.

Target references, not copies: Things 3 density, Linear chrome, Drafts' single text surface. No mascot, no illustrated empty states, no gradient blobs, no rounded habit pills in candy colors.

- Color: one-two accent(s). Status is type and position, not a rainbow. Habit grid is ink on paper: empty, done, skipped, over-goal. Bad habits are a hairline, not red cartoon X.
- Hierarchy: areas in a left rail, list in the center, inspector on the right. Calendar is a column, not a toy.
- Motion: almost none for v1, this will change in the future. Selection and the just-came-up strip are the only chrome that moves.
- Copy: short, no emoji in the product UI.

## 10. Competitors, only where they change the spec

| Product | Take |
| --- | --- |
| Lunatask | the behavior spec |
| Amazing Marvin | closest on swappable strategies. Proof that workflows can be data, not pages |
| Things 3 | sober list UI, areas/projects. No habits, no journal, no CRM |
| Sunsama | daily time blocking against a real calendar. Weaker life tracking |
| Todoist / TickTick | date-centric, the thing Lunatask argues against |
| Drafts | capture inbox + actions. The add |
| ChatGPT / Claude with a notes export | the coach-shaped thing people already fake by pasting. We keep the data in-app and the writes typed |
| Standard Notes | the E2E notes extreme we are not building |
| Notion / Capacities | databases, not an opinionated task engine |

Do not clone Amazing Marvin's strategy marketplace. Six workflows, hardcoded, is the parity target.

## 11. Implementation outline (Turborepo)

Audience: someone who can script and does not want a hand-rolled dev cycle. Stay inside Vercel's paved road.

### 11.1 Repo

```
npx create-turbo@latest
```

Official starter is two Next.js apps plus `@repo/ui`, `@repo/eslint-config`, `@repo/typescript-config`. Reshape to:

```
apps/web                 Next.js App Router. The product, including POST /api/coach. Deploy this.
packages/domain          pure TS. No React, no DB. Workflows, sort, recurrence, reconnect.
packages/db              Drizzle schema + client. Postgres on Neon.
packages/ui              sober components. No product logic.
packages/capture         draft parse + action runners. Calls domain.
packages/coach           tool definitions, skill files, knowledge markdown. No model calls. The route in apps/web owns the SDK.
packages/typescript-config
packages/eslint-config
```

One app. A second `apps/marketing` is optional and should wait. Cron lives in `apps/web` route handlers plus Vercel Cron (just-came-up, reconnect due, habit reminders). No worker service until a job actually needs it.

Auth: Auth.js or Clerk. Either is fine. Do not roll sessions.

Editor: a maintained markdown editor (Tiptap or CodeMirror). Do not write one.

AI: `pnpm add ai @ai-sdk/react zod` in `apps/web`. Model calls only in the coach route, via AI Gateway. `packages/coach` stays free of the SDK so skills can be unit-tested without a key.

### 11.2 Domain first

`packages/domain` is the product. UI is a view. Functions, all pure:

- `sortTasks(tasks, workflow, now) -> sections[]`
- `applySchedule(task, date) -> task` (resets age, sets later)
- `surfaceDue(tasks, today) -> justCameUp[]`
- `completeRecurring(task, today) -> next | null`
- `habitProgress(habit, activities, period) -> { done, count, streak }`
- `reconnectDue(person, today) -> date | null`
- `parseDraft(body) -> hints`

Workflow is an enum on the area, not a plugin. Tests live next to these functions. This is the only hard part. The UI is lists.

### 11.3 Schema (sketch)

```
users, sessions
areas(id, user_id, name, workflow, initial_status, wip_limit, position)
goals(id, area_id, name, position)
tasks(id, area_id, goal_id, name, note_md, status, previous_status,
      priority, motivation, eisenhower, estimate_min, progress,
      scheduled_on, age_started_on, pinned, completed_at,
      recurrence_rule, parent_task_id, created_at, updated_at)
task_sources(task_id, source, source_id)
time_blocks(id, owner_type, owner_id, day, start_min, duration_min)
habits(id, user_id, name, period, track_mode, bad, goal_count,
       recurrence, remind_at, duration_min, position)
habit_activities(habit_id, day, count)
notebooks(id, user_id, name, pin_hash)
notes(id, notebook_id, name, body_md, pinned)
journal_entries(id, user_id, day, body_md)
day_scores(user_id, day, mood, energy, stress)
people(id, user_id, name, group, reconnect_rule, last_connected, agreed_on)
person_fields(person_id, type, label, value)
person_notes(person_id, body_md, at, is_happy_memory)
drafts(id, user_id, body, tags, workspace, created_at)
links(from_type, from_id, to_type, to_id)
api_tokens(user_id, hash, created_at)
calendar_feeds(user_id, provider, url_or_grant)
coach_threads(id, user_id, created_at)
coach_messages(id, thread_id, role, parts_json, created_at)
```

`parts_json` is the AI SDK message parts array (text, tool call, tool result), stored so a thread reloads. Tool results include the entity id they touched. UUIDs. `updated_at` on every row. Soft delete can wait. Knowledge and skills are files, not tables.

### 11.4 App routes

```
/inbox
/tasks/[areaId]
/tasks/overview          next to work on
/habits
/journal
/journal/[day]
/notes/[notebookId]
/people
/people/[id]
/coach
/settings
/api/v1/...              the readable API their crypto cannot do
/api/coach               AI SDK streamText. Session-scoped tools
```

Inspector is a parallel route or a panel, not a modal maze. Capture is a command palette that always writes a draft. Coach is a column on the working routes and a full page at `/coach`. The open entity id is sent with the turn.

### 11.5 API

Bearer token, same shape as theirs so a later importer is boring, plus the fields they cannot return:

- `GET/POST /v1/tasks`, `GET/PATCH/DELETE /v1/tasks/:id` with `name` and `note`
- notes, journal, people, habit track
- `POST /v1/drafts` and `POST /v1/drafts/:id/actions/:action`
- webhooks: task.completed, draft.filed, reconnect.due

`source` + `source_id` idempotency stays. It is a good idea and not proprietary.

### 11.6 Phases

A script-kiddie sequence. Each phase is deployable.

1. Monorepo, auth, one area, Priority List, create/complete/priority. Inbox that files to a task. This is the whole product if you stop.
2. Coach, read-only plus `createTask` and `completeTask`. `useChat`, three tools, one knowledge article, Gateway model id in an env var. Writes already go through domain. This is the second product if you stop.
3. Now/Later and Kanban. Age sort. Just-came-up. Goals. Coach learns `scheduleTask` and `updateTask`.
4. Notes and journal, markdown, links between entities. Coach learns `appendJournal` and `createNote`. Daily-close skill.
5. Habits, daily only. Grid and a checkbox. Habit-design skill. `trackHabit`.
6. People, groups, reconnect rule, timeline note. Reconnect skill.
7. Calendar column. Time blocks. Then ICS read-only, Google one-way (nice to haves).
8. Must/Should/Want and Eisenhower, Recurring tasks.
9. Public API, webhooks, full-text search (Postgres `tsvector`). Coach `search` switches to full-text.
10. PIN lock on a notebook. Coach skips locked notebooks. Weather attached to Journal (nice to have).

Out of v1, matching their own gaps plus the user's cut: E2E, week/month calendar, two-way calendar, widgets, native mobile, voice, MCP, note folders, Plan Ahead workflow. Also out: a vector store, autonomous overnight coaching, email the coach sends on its own.

Mobile: responsive web first. A native app is a different product.

### 11.7 What not to do

- Do not start from Electron. They are leaving it.
- Do not put business rules in React components.
- Do not add a second app, a message bus, or microservices.
- Do not copy their icons, empty states, or the word Lunatask.
- Do not implement client-side encryption "just in case". It makes the Coach blind.
- Do not let the model write SQL or call the public API with a user token. Tools call domain functions.
- Do not add a second agent framework. `streamText` plus tools is the agent.

## 12. Gaps to confirm in the app before coding edges

Docs were enough for the model. These were thin or failed to fetch:

- exact recurrence grammar and what completion does to the old instance
- subtask completion rules and whether subtasks have their own status
- bulk edit field list
- link extraction rules
- notebook PIN vs app PIN vs journal PIN (one PIN or three)
- habit routine data model
- whether goals are ordered and whether a task can be in two goals (assume no)
- free vs premium beyond habits (7), energy/stress, calendar connect, Must/Should/Want, Eisenhower

## 13. Sources

- https://lunatask.app/docs/getting-started/installation
- https://lunatask.app/docs/getting-started/privacy
- https://lunatask.app/docs/features/tasks/overview
- https://lunatask.app/docs/features/tasks/workflows
- https://lunatask.app/docs/features/tasks/scheduling/date-based-scheduling
- https://lunatask.app/docs/features/tasks/scheduling/time-blocking
- https://lunatask.app/docs/features/habits
- https://lunatask.app/docs/features/journal
- https://lunatask.app/docs/features/mood-tracker
- https://lunatask.app/docs/features/relationships
- https://lunatask.app/docs/features/calendar
- https://lunatask.app/docs/features/linking
- https://lunatask.app/docs/features/search
- https://lunatask.app/docs/features/import-export
- https://lunatask.app/docs/features/integrations/email-integration
- https://lunatask.app/docs/features/integrations/zapier-integration
- https://lunatask.app/docs/keyboard-shortcuts
- https://lunatask.app/docs/how-to/structure-areas
- https://lunatask.app/docs/common-questions
- https://lunatask.app/api/overview
- https://lunatask.app/api/authentication
- https://lunatask.app/api/tasks-api/entity
- https://lunatask.app/api/tasks-api/create
- https://ideas.lunatask.app/
- https://github.com/storytold/photocraft/blob/main/AGENTS.md
- https://getartcraft.com/apps
- Drafts actions model: https://docs.getdrafts.com/docs/actions/intro (product behavior; Zapier guide used as secondary)
- Turborepo starter: https://vercel.com/next.js/monorepo-turborepo
- Vercel AI SDK: https://vercel.com/docs/ai-sdk
- AI SDK `useChat`: https://sdk.vercel.ai/docs/api-reference/use-chat
- Vercel AI Gateway: https://vercel.com/docs/ai-gateway
- Habit formation median ~66 days: Lally, van Jaarsveld, Potts, Wardle, European Journal of Social Psychology, 2010
- Implementation intentions: Gollwitzer, American Psychologist, 1999
- Habit cues: Wood and Neal, Psychological Review, 2007
- Expressive writing: Pennebaker, Psychological Science, 1997 (and later reviews)
- Goal setting: Locke and Latham, American Psychologist, 2002
- WOOP: Oettingen, Rethinking Positive Thinking, 2014

## 14. Names

Decided 2026-10-07.

- Product: Bearing. Domain bearing.now is available.
- Coach: Paul.

Do not reuse Lunatask. Do not name the coach Bearing.
