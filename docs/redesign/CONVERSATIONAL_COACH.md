# Conversational Coach (#47)

The opt-in V1 `/app/coach` view now uses conversation, sources and editable approval
cards. It extends the existing Next.js app, V1 data services, audit ledger, draft UI
primitives and canonical views. It does not use a separate vector database, infer
memory from chat, turn chats into Journal moments, or add external research tools.
The pre-V1 Coach tool API is removed ([ADR 0005](../adr/0005-sunset-legacy-domain-and-coach.md)). Disabled V1 shows setup guidance.

## Server configuration and disclosure

Use Node.js 22 or later and install with the committed npm lockfile. Coach uses the Vercel AI SDK (`ai`)
for tools, multi-step generation and streaming. Configure a tool-capable model:

```sh
BEARING_COACH_PROVIDER=openrouter
BEARING_COACH_MODEL=<provider/model-id>
OPENROUTER_API_KEY=<server-secret>
```

Or set `BEARING_COACH_PROVIDER=gateway`, `BEARING_COACH_MODEL=<provider/model-id>`
and `AI_GATEWAY_API_KEY=<server-secret>` for Vercel AI Gateway. Keys never appear
in client JavaScript, JSON responses or prompts. `BEARING_COACH_OPENROUTER_URL` is an
optional **trusted server setting**, for a proxy or deterministic test server;
HTTP clients cannot choose the provider endpoint. The disclosure shows its actual
host. Missing configuration gives a setup state and leaves keyword Search usable.

Before sending a message, the user explicitly consents to the named external
provider/model use. The provider receives the recent chat, explicitly saved
preferences and bounded requested record excerpts. Provider errors are redacted.
This change does not configure live credentials or make paid production calls.

## Read and context boundary

Tools close over the authenticated account; none accepts a user/account id.
Search reuses tenant-scoped V1 keyword search. Structured Item listing reuses V1
filters, including Delegated in In Progress, with a five-record database limit.
Read supports Items/People, Projects, Journal, Tags/Areas, Reviews, Activity and
Links. Item reads expose a bounded excerpt and up to six actual connections.
Sources link to real authorized app URLs. Unknown model-generated links are not
rendered as supporting evidence.

Each turn has at most six read calls and 14,000 UTF-8 bytes of tool results, up to
12 recent chat messages (older text truncated, current request retained), at most
10 explicit preferences of 400 characters, five model steps and 1,800 output tokens
per step. Timeout is 60 seconds; retry is bounded. There is no workspace export,
SQL execution, arbitrary URL fetch, external web search or code-execution tool.
Tests inspect actual SDK model calls to verify unrelated and cross-account record
content is absent. Tool results and saved preferences remain untrusted input.

Ambiguous duplicate matches force clarification and block a change proposal until
the user selects an identity. Clarifications retain the original request and
verified candidates in saved chat. Missing information stays uncertain; a research
Task can be proposed, but requires exactly the same approval as any other Item.
Generated prose is not factual authority: supporting records and execution receipts
are the evidence. Never treat a mention as confirmed contact or a plan as activity.

## Editable proposals and execution

The model can only read or prepare a proposal. It has no execution tool. Supported
operations are create/edit/archive Item, create/edit Project, create Tag/Area,
create semantic Link, remove Link, and organize a raw Journal/Inbox moment into one
canonical referenced Item. Organization preserves original text and shares the
same approval transaction; already-linked moments must use their existing Item.
Item edits use a full validated DTO assembled
from the current owned record and an explicit patch, preserving omitted fields.

A related batch has at most 12 operations. New records use unique `new_` keys;
subsequent Item foreign keys and Links may refer to these keys. Preview validates
ownership and optimistic revisions, and shows full before/after values. The user
can edit proposed fields/type/relationships or remove operations, then must request
a fresh server preview before approval. Oversized previews are refused rather than
silently truncated; use the regular Item editor for very long content.

A signed, account-bound, expiring token binds the exact preview. Persistent cards
also bind a pending Proposal id/revision; a stale or rejected card cannot apply.
Archive, type change and Link removal require the additional typed confirmation
`APPLY DESTRUCTIVE CHANGES`. The server recomputes destructive status, including for
restored proposals, rather than trusting a client flag.

Approval executes through the existing V1 services in one advisory-locked database
transaction as `agent:coach`, approved only at this endpoint. Each service rechecks
ownership, full DTO validation, revisions, semantic endpoints, self identity,
creation limits and editor leases. Project edits also respect leases on affected
Items. If any operation fails, every earlier data change and inner receipt rolls
back; the outer refused receipt explains the failure. The pending card remains
reviewable/retryable. No partial result is called success.

Approval keys make concurrent/lost-ack retries return the original result without
another Item/Link. Per-operation receipts link to the account-owned ledger and
canonical results. Repeating an approval may append a replay audit receipt, but
never repeats the underlying data writes. Rejecting changes only the proposal's
control status; it writes no Bearing Item, Link, Activity or execution receipt.

Settings can opt this account into three trust patterns, all off by default:
file one raw Journal or Inbox entry as one open Task or Note, create one open
Task, or connect two existing records with a legal relationship. A pattern
matches only a fresh server-side Coach proposal of that single operation after
the prepared DTO is checked, including open status, no delegate, ownership, and
link endpoint rules. Edited previews, reloaded pending cards, and every other
shape keep the approval card. The decision is read again under the write lock.
A revoke that commits first prevents the save and leaves no canonical rows. A
save that already committed stays. The apply receipt records the pattern id and
trust policy revision. Restore drops `coach.trust` and unspent settle markers
and keeps other preferences, so a backup cannot turn trust back on.

## Conversations, temporary mode and preference memory

Conversations/messages use the existing V1 tables and persist by default. A saved
conversation URL reloads its recent messages and current Proposal state; the list
shows the newest 50 conversations, and a view shows its newest 100 messages.
Server request keys prevent duplicate user messages on retry and a short active
lease serializes turns within a conversation. Failed turns retain their message;
retrying a proposed turn reuses its one stable draft rather than creating another.
Proposal tokens/full previews are not copied into message history or model context.
Deleting a conversation removes its messages and proposals; approved records and
execution audit history remain.

Temporary mode sends bounded in-memory history but writes no Conversation, Message
or Proposal row and no temporary text to Preferences. Pending previews are signed
and held only on the page. Approved Bearing changes still persist, as do their
minimal idempotency/audit records. A per-account rate counter stores only timing
and counts, including for temporary requests. Leaving/reloading the page discards
the temporary conversation; it is not a promise about the external provider's own
retention policy.

Memory is opt-in: only the explicit preference form creates remembered preferences.
The user can inspect, edit and delete every entry. No model tool can silently save
memory, and structured Bearing records take precedence over chat/preferences.
All requests require verified authentication; mutations also require the expected
account header. Account changes lock the previous browser context. No schema
migration, production reset or deployment is part of this slice. Existing V1
backup/restore includes chats, proposals, preferences and receipts.

## Validation and release

Tests cover SDK tool streaming, grounded reads, ambiguity, unrelated-data exclusion,
permission checks, signed/edited/rejected/approved batches, concurrent replay,
rollback after earlier creates, write limits, open Item/Project guards, provider
failure recovery, default persistence and temporary non-persistence. Browser
journeys cover sources, reloads, editable approval, rejection, preferences and
retry on desktop and emulated phone using a local OpenAI-compatible fixture through
the real AI SDK transport. No real provider key or paid request is used in tests.
Native Safari, accessibility certification and live-provider smoke testing remain
release checks; see #48. Live-provider testing requires deployment-specific keys.

To reproduce the deterministic browser suite, provide a disposable test
PostgreSQL database, install Playwright Chromium, then run:

```sh
TEST_DATABASE_URL=postgresql://... npm run test:e2e
```

The dedicated config provisions a disposable test-only account and starts `e2e/scripts/coach-provider.mjs` and the app with local
fixture credentials; the general E2E config skips provider-specific assertions.
The shared fixture snapshots/restores the disposable database around each test;
Coach tests also reset only the fixture account's rate counter before chat.
Use this config only with the explicit disposable test database.
