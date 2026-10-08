# Coach route, tools and AI Gateway (Phase 2)

## Question

How should Build implement the Phase 2 Coach (`POST /api/coach`, `useChat`, three tools, threads that reload, and a Gateway model id in an env var) on the current AI SDK, keeping `packages/coach` SDK-free and every tool scoped to the session user?

- Asked by: Paul, 2026-10-07.
- Researched by: Bearing Research. Repo state read at `main` `8ac802c` and open PR #11 (`review-fixes-6-9`, `7efe598`).
- Criteria the requester named:
  - verify the current AI SDK major version and its APIs;
  - `streamText`, `tool()`, Zod, a step cap of 8, `useChat`, and parts saved to `coach_messages.parts_json`;
  - the `packages/coach` / `apps/web` split and a 401 variant of `requireUser()`;
  - which read tool to ship;
  - §8.6 provenance;
  - whether tool approval meets §8.2 confirm cards;
  - Gateway auth, model id, `turbo.json`, failover and spend, and whether the spec's example model ids exist;
  - npm, not pnpm;
  - versions that fit the repo.

## Constraints from the glossary and ADRs

Constraints are taken from the spec, issue #1 and the code.

| # | Constraint | Source |
| --- | --- | --- |
| C1 | Vercel's AI toolkit only: `ai` (`streamText`, `tool()` with Zod, an SDK step loop with a step cap), `@ai-sdk/react` `useChat`, AI Gateway with one key and model ids. No LangChain, no vector database, no second agent framework. | `docs/research/spec.md` §8.1, §11.7 |
| C2 | Route is `POST /api/coach` in `apps/web`. A session cookie is required. The handler loads tools bound to `userId`. | spec §8.1 |
| C3 | Tools call domain functions. The model never sees SQL. Every tool is scoped to the session user. | spec §8.2, §11.7; issue #1 "Rows are scoped by the session user. A query that does not take the session user is a bug." |
| C4 | A user message that asks for a create or a field edit counts as the confirmation. Deletes, bulk edits and completing more than one Task need a confirm card before `execute`. Every tool call is logged on the thread. | spec §8.2 |
| C5 | Step cap per turn: 8. | spec §8.6 |
| C6 | Coach-created rows set `source = coach` and `source_id` = the tool-call id, so they match like any other integration. | spec §8.6; idempotency rule in §5, §11.5 |
| C7 | `packages/coach` holds tool definitions, skills and knowledge, with no model calls and no SDK, so skills can be tested without a key. Model calls happen only in the coach route. | spec §11.1 |
| C8 | Schema sketch: `coach_threads(id, user_id, created_at)` and `coach_messages(id, thread_id, role, parts_json, created_at)`. `parts_json` is the AI SDK message parts array. Tool results include the id of the entity they touched. UUIDs, and `updated_at` on every row. | spec §11.3 |
| C9 | Phase 2 scope: "Coach, read-only plus `createTask` and `completeTask`. `useChat`, three tools, one knowledge article, Gateway model id in an env var. Writes already go through domain." | spec §11.6.2 |
| C10 | Vocabulary: Area, Priority List, Task, Draft, Inbox, Coach. "Next" means the highlighted Task, not the Kanban status. | issue #1 "Further Notes"; spec §3 |
| C11 | Stack in the repo: npm workspaces with `devEngines` npm `10.9.9` and `engines.node >=24`; `next` 16.3.4, `react` 19.2.8, `typescript` 7.0.2, `drizzle-orm` 0.45.3, `next-auth` 5.0.0-beta.32. Exact pins are the convention. Zod is not installed anywhere yet. No lockfile is committed. | root and `apps/web` `package.json` at `8ac802c` |
| C12 | The one way to create a Task is `addTask(userId, input, db)` in `apps/web/lib/tasks.ts`. In PR #11 it applies the domain `newTask` rule and returns a boolean. `completeTask(userId, taskId, db)` returns nothing. Both live in `apps/web`, not in a package. Superseded by #13: both now return `{ id, name }` or null. | `apps/web/lib/tasks.ts` at `main` and `7efe598` |

## Candidates

**A. `streamText` + `tool()` in the route handler.** This is the spec's path (§8.1). `streamText` runs the tool loop, with `stopWhen: isStepCount(8)`. The response is built with the standalone `toUIMessageStream` and `createUIMessageStreamResponse` helpers. `useChat` with `DefaultChatTransport` talks to it [5][6][10].

**B. `ToolLoopAgent`.** This is the AI SDK 7 agent class from the same `ai` package. It takes the same tools, `stopWhen` and `toolApproval`, and fits when one agent definition is reused across routes or transports [8][9]. It is first-party, so it is not a "second agent framework". For a single route, though, it adds a layer the spec doesn't ask for.

**C. A hand-rolled loop** (`generateText` per step plus our own planner). This is ruled out by C1 and listed only for completeness.

There are two sub-choices inside A or B:

- **How a tool gets the user id:**
  - (i) a closure factory, `coachTools(userId)`;
  - (ii) the SDK's typed tool context: `contextSchema` on the tool plus `toolsContext` on the call [8].
- **How threads are stored:**
  - (i) one row per UI message, holding its parts (C8);
  - (ii) the whole thread as one JSON blob.

## Primary-source comparison

| Criterion | A. `streamText` + `tool()` | B. `ToolLoopAgent` | C. Hand-rolled loop |
| --- | --- | --- | --- |
| Current, supported API | Yes. `ai` 7.0.133 is `latest` [1]. `streamText`, `tool`, `isStepCount`, `toUIMessageStream` and `createUIMessageStreamResponse` are exported [5][6]. | Yes, exported from `ai` 7 [9]. | Not an SDK feature. |
| Matches spec §8.1 wording | Exactly. | Same primitives, different wrapper. | No. |
| Step cap of 8 | `stopWhen: isStepCount(8)`. `stepCountIs` was renamed to `isStepCount` in 7.0 [6][10]. Tested: 8 model calls, then the loop stops (T1). | Same `stopWhen` option [9]. | Hand-written. |
| User scoping | `contextSchema` + `toolsContext`. `execute` receives a typed, validated `context` [8]. Tested: with no context supplied, the tool call fails validation and doesn't execute (T2). | Same, set in the constructor or in `prepareCall` [8]. | Hand-written. |
| Tool-call id for provenance | `execute(input, { toolCallId, context })` [7]. Tested: ids `call_1…call_8` reached the handler (T1). | Same [7]. | Hand-written. |
| Persisting and reloading parts | `toUIMessageStream({ originalMessages, generateMessageId, onEnd })` returns the full `UIMessage[]`. `validateUIMessages({ messages, tools })` checks reloaded history [5]. Tested: JSON round trip, validate, `convertToModelMessages` (T1). | Same helpers [5]. | Hand-written. |
| Confirm cards (§8.2) | `toolApproval: { tool: 'user-approval' }` on `streamText`. The part arrives in state `approval-requested`. The client calls `addToolApprovalResponse`. `needsApproval` is deprecated in 7.0 [9][10]. Tested: `execute` didn't run, and the part had state `approval-requested` (T3). | Same option [9]. | Hand-written. |
| Testable without a key | `MockLanguageModelV4` from `ai/test` (used for T1–T3). Tool handlers in `packages/coach` need neither the SDK nor a key. | Same. | n/a |
| Type-checks on repo TS 7.0.2 | Yes. A route-shaped file with `toolsContext`, `isStepCount(8)` and `providerOptions.gateway` passes `tsc` 7.0.2 with the repo's `skipLibCheck: true` (T4). | Not tested. | n/a |

### Tests run (throwaway scripts on the box, not committed)

Setup: `ai@7.0.133`, `@ai-sdk/react@4.0.136`, `zod@4.6.5` installed in `/workspace/scratch-ai`.

- **T1:** A mock model always calls `createTask`, with `stopWhen: isStepCount(8)`.
  - Result: exactly 8 model calls and 8 handler runs, each with its own `toolCallId` and the right `userId` from `toolsContext`.
  - The saved assistant message holds `step-start` and `tool-createTask` parts, e.g. `{"type":"tool-createTask","toolCallId":"call_1","state":"output-available","input":{...},"output":{"taskId":...}}`.
  - JSON round trip, then `validateUIMessages`, then `convertToModelMessages`: passed.
- **T2:** Same tool with no `toolsContext`.
  - Result: `AI_TypeValidationError … tool context (createTask)`, and the handler never ran. Scoping fails closed.
- **T3:** A `deleteTask` tool with `toolApproval: { deleteTask: 'user-approval' }`.
  - Result: 1 model call, `execute` not called, part `{"state":"approval-requested","approval":{"id":…}}`.
- **T4:** `tsc` 7.0.2 on a route-shaped file: exit 0. With `skipLibCheck: false` the only error is a missing `@types/json-schema` inside `@ai-sdk/provider`. The repo's base tsconfig sets `skipLibCheck: true`.
- **T5:** Postgres 17.11 check of the provenance index proposed below:
  - two UI Tasks with null `source` both insert;
  - a repeated `('coach','call_abc')` in the same Area is skipped by `on conflict do nothing`;
  - the same id in another Area inserts;
  - a half-set pair fails the check.
- **T6:** Live Gateway model list (`GET https://ai-gateway.vercel.sh/v1/models`, 413 models, 2026-10-07) [15]:
  - `openai/gpt-6-astra` exists. Tags include `tool-use`. Price $10 / $50 per 1M input/output tokens.
  - `spacexai/grok-4.7` exists. Tags include `tool-use`. Price $2 / $6 per 1M tokens.

## Recommendation

**Use A: `streamText` + `tool()` in `apps/web/app/api/coach/route.ts`, on AI SDK 7.**

- Pass the user id through the SDK's typed `toolsContext`, not a closure.
- Store one `coach_messages` row per UI message.
- Keep the tool logic (Zod schemas, descriptions, handlers that call an injected data interface) in `packages/coach`, with no SDK import.

Why:

- It is the spec's own path (C1, C2) and it is current [1][6].
- `toolsContext` validates the user id per call and fails closed when it's missing (T2). Tool context is also kept out of telemetry unless it is listed in `telemetry.includeToolsContext` [8].
- Per-message rows match the C8 sketch and the persistence guide's shape [5].

Known risks:

- **Fast-moving SDK:** 7.0 renamed `stepCountIs`, `onFinish` and the result `toUIMessageStreamResponse` helper [10]. Pin exact versions (the repo's convention) and upgrade on purpose.
- **Data functions live in `apps/web`, not a package** (C12). `packages/coach` therefore can't import them. It must take them as an injected interface. Otherwise they move to a package, which is a bigger change (see Spec decisions).
- **Client-supplied message ids:** the server must check them (uuid format and thread ownership) before upserting. See "What Build should wrap".
- **`generateObject` is deprecated** since AI SDK 6 [11]. Spec §8.1 still names it. Skills that need a structured plan should use `generateText`/`streamText` with `output: Output.object(...)`. This is not needed in Phase 2.

### Decisions for Spec (Bearing Spec)

1. **The read tool.** Recommend `listArea`, a spec §8.2 name: the open Tasks on the user's Area in Priority List order, each with `id`, `name`, `priority`, and `isNext` from the domain `priorityList`/`nextTask`.
   - Why: `completeTask` needs a Task id, and the model can only get one from a read tool.
   - `today` (§8.2) mostly reads just-came-up, habits, reconnects and mood, none of which exist until Phases 3–6. Shipping it now would be either a misleading name or a stub.
   - `search` is names-only until Phase 9.
2. **Provenance shape.** Recommend two nullable columns on `tasks` (`source`, `source_id`), plus a unique index on `(area_id, source, source_id)`, plus a both-or-neither check (tested in T5).
   - This differs from §11.3's separate `task_sources` table.
   - Why: the idempotency rule is per Area (§5). A separate table would need a join to scope it, and Phase 2 has exactly one source per Task.
   - Spec should also decide whether the later public API keeps §5's "only on an *open* task" nuance, which would need a partial index. It is not needed for Coach retries, because a tool-call id never legitimately repeats.
3. **Where the data functions live.** Either keep them in `apps/web/lib` and inject them into `packages/coach` (recommended for Phase 2: smallest change), or move them to a package first.
4. **`addTask` and `completeTask` return values.** Tool results must carry the entity id (§11.3) and a one-line receipt (§8.5). `addTask` returns `boolean` and `completeTask` returns `void` (C12). Both need to return `{ id, name } | null`. This is a small change to PR #11's functions once it merges.
5. **Thread model for Phase 2.** Recommend one implicit thread per user, opened at `/coach`, with the table still allowing many.
6. **Default model.** Recommend `COACH_MODEL=spacexai/grok-4.7`, the cheaper of the two spec examples at 1/5 the input price (T6), with `openai/gpt-6-astra` as the Gateway fallback. This is Paul's cost call.

## What Build should wrap

### Packages and versions

Install with npm (the spec's `pnpm add` in §11.1 doesn't match the repo):

```sh
npm install --save-exact ai@7.0.133 @ai-sdk/react@4.0.136 zod@4.6.5 -w web
npm install --save-exact zod@4.6.5 -w @repo/coach
```

- `ai@7.0.133` depends on `@ai-sdk/gateway@4.0.108` and requires Node >=22. Its peer is `zod ^3.25.76 || ^4.1.8` [1][3].
- `@ai-sdk/react@4.0.136` peers on `react ^18 || ~19.0.1 || ~19.1.2 || ^19.2.1`, which fits 19.2.8 [2].
- Don't add `@ai-sdk/gateway` directly. A plain-string model id already goes through the Gateway provider [12][13].
- Keep the same exact `zod` version in both workspaces so npm hoists one copy. The schema objects cross the package boundary.

### File layout

```
packages/coach/
  package.json                  add zod; add "test": "node --test" (like packages/domain)
  src/index.ts                  keep `skills`; export the tool specs and types
  src/data.ts                   CoachData interface (the injected write path)
  src/tools/list-area.ts        { description, inputSchema, run(input, ctx) }
  src/tools/create-task.ts
  src/tools/complete-task.ts
  src/tools/*.test.ts           node:test with a fake CoachData; no SDK, no key
  src/prompt.ts                 system prompt text: Coach named Paul, §8.4 coaching boundary
apps/web/
  app/api/coach/route.ts        POST: auth, load thread, validate, streamText, persist
  lib/coach-tools.ts            wraps each spec with tool({ ..., contextSchema, execute })
  lib/coach-threads.ts          load/save threads and messages, scoped by user id
  auth.ts                       add getApiUser() next to requireUser()
  app/coach/page.tsx            server: requireUser(), load or create the thread, render <Chat>
  app/coach/chat.tsx            'use client': useChat
packages/db/src/schema.ts       coach_threads, coach_messages, tasks.source/source_id
```

### `packages/coach` (SDK-free)

```ts
// src/data.ts
export type Provenance = { source: "coach"; sourceId: string };
export type CoachData = {
  listOpenTasks(userId: string): Promise<{ id: string; name: string; priority: number; isNext: boolean }[]>;
  addTask(userId: string, input: { name: string; note?: string }, from: Provenance): Promise<{ id: string; name: string } | null>;
  completeTask(userId: string, taskId: string): Promise<{ id: string; name: string } | null>;
};
export type ToolRunContext = { userId: string; toolCallId: string; data: CoachData };
```

Tool inputs:

- `createTask`: `z.object({ name: z.string().trim().min(1).max(maxTaskNameLength), note: z.string().max(maxTaskNoteLength).optional() })`, with the limits imported from `@repo/domain` (PR #11 `task.ts`). The handler calls `data.addTask(userId, input, { source: "coach", sourceId: toolCallId })` and returns `{ taskId, name }`, or `{ error }` when the domain refuses.
- `completeTask`: `z.object({ taskId: z.uuid() })`. Returns `{ taskId, name }` or `{ error: "not found" }`. A foreign or completed id matches nothing, as in `lib/tasks.ts`.
- `listArea`: `z.object({})`. Returns the ordered list from the domain functions.

### `apps/web` wrapping

```ts
// lib/coach-tools.ts
import { tool } from "ai";
import { z } from "zod";
import { createTaskSpec, completeTaskSpec, listAreaSpec } from "@repo/coach";
const userContext = z.object({ userId: z.uuid() });
export const coachTools = {
  createTask: tool({
    description: createTaskSpec.description,
    inputSchema: createTaskSpec.inputSchema,
    contextSchema: userContext,
    execute: (input, { context, toolCallId }) =>
      createTaskSpec.run(input, { userId: context.userId, toolCallId, data: webCoachData }),
  }),
  // completeTask, listArea: same shape
};
```

`webCoachData` adapts `lib/tasks.ts` (`openTasks`, `addTask`, `completeTask`) to `CoachData`. The Coach writes through the same functions the screens use (spec §7: "A filed draft and a coach-created task are the same row").

### Route

`app/api/coach/route.ts`, following the AI SDK 7 persistence guide [5]:

1. `const user = await getApiUser(); if (!user) return new Response(null, { status: 401 });`
   - `getApiUser()` is `(await auth())?.user` with an `id`, or null. It is a non-redirecting twin of `requireUser()`, which redirects to `/sign-in` and so can't serve an API route (C2).
2. Body is `{ threadId, message }`. Send only the last message, via the transport's `prepareSendMessagesRequest` [5].
3. Load the thread with `where id = threadId and user_id = user.id`. Return 404 if it's missing.
4. `validateUIMessages({ messages: [...previous, message], tools: coachTools })` [5].
5. Call `streamText`:

   ```ts
   streamText({
     model: process.env.COACH_MODEL,
     system: coachSystemPrompt,
     messages: await convertToModelMessages(validated, { tools: coachTools }),
     tools: coachTools,
     toolsContext: { createTask: { userId }, completeTask: { userId }, listArea: { userId } },
     stopWhen: isStepCount(8),
     providerOptions: { gateway: { user: userId, tags: ["coach"], models: [fallbackModel] } },
   })
   ```

   Gateway options are explained in [12].
6. `result.consumeStream()`, so a closed tab still saves the turn [5].
7. Return:

   ```ts
   createUIMessageStreamResponse({
     stream: toUIMessageStream({
       stream: result.stream,
       originalMessages: validated,
       generateMessageId: () => crypto.randomUUID(),
       onEnd: ({ messages }) => saveMessages(user.id, threadId, messages),
     }),
   })
   ```

### Client

```ts
useChat({
  id: threadId,
  messages: initialMessages,
  generateId: () => crypto.randomUUID(),
  transport: new DefaultChatTransport({
    api: "/api/coach",
    prepareSendMessagesRequest: ({ messages, id }) => ({
      body: { threadId: id, message: messages.at(-1) },
    }),
  }),
})
```

- Every message id is then a uuid, which fits §11.3 "UUIDs" [5].
- Render tool parts (`tool-createTask` and so on, by `state`) as one-line receipts (§8.5).

### Schema (Drizzle, `packages/db/src/schema.ts`)

```
coach_threads   id uuid pk default random, user_id uuid fk users on delete cascade,
                created_at, updated_at
coach_messages  id uuid pk (the UIMessage id), thread_id uuid fk coach_threads on delete cascade,
                role text ('user' | 'assistant'), parts_json jsonb not null, created_at, updated_at
                index (thread_id, created_at)
tasks           + source text null, + source_id text null
                check ((source is null) = (source_id is null))
                unique index (area_id, source, source_id)
```

- `source_id` must be `text`, not `uuid`. Provider tool-call ids are not uuids (T1 shows the shape).
- Postgres treats nulls as distinct in unique indexes, so Tasks added on the list and from the Inbox are unaffected [18] (T5).
- `saveMessages` upserts by id with `on conflict (id) do update set parts_json = excluded.parts_json where coach_messages.thread_id = excluded.thread_id`. A forged id that points at another thread's row must not overwrite it. Reject a non-uuid id before writing, as `isUuid` does in PR #11.
- Upsert, not insert. After an approval, the client re-sends and the same assistant message id is updated [9].
- Run `db:push` on each Neon database after the schema change, per the README.

### Confirm cards (deferrable)

- Phase 2's single create and single complete don't need confirms (C4).
- When deletes or bulk tools arrive:
  - set `toolApproval: { deleteTask: 'user-approval' }` on `streamText`;
  - render the `approval-requested` part as a confirm button that calls `addToolApprovalResponse`;
  - set `sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses` on `useChat` [9].
- Don't use the deprecated `needsApproval` [10].
- `toolApproval` doesn't apply to provider-executed tools [9], such as Gateway search.

### Gateway and environment

- **Locally:** set `AI_GATEWAY_API_KEY` in `apps/web/.env.local` [13]. Alternatively, `vercel env pull` writes a `VERCEL_OIDC_TOKEN`, which expires after 12 hours unless you use `vercel dev` [12].
- **Deployed on Vercel:** rely on OIDC. Deployments receive `VERCEL_OIDC_TOKEN`, and the provider falls back to it when no key is set [12][13]. The source shows `AI_GATEWAY_API_KEY` first, then `getVercelOidcToken()`.
  - Do not set `AI_GATEWAY_API_KEY` in Vercel project env. A key that is present is always used, even if it's invalid [12].
- **`turbo.json`:** add `"COACH_MODEL"` and `"AI_GATEWAY_API_KEY"` to `globalEnv`. Turbo's default strict mode passes a task only the variables listed in `env`/`globalEnv` [16].
  - `VERCEL` and `VERCEL_*`, including `VERCEL_OIDC_TOKEN`, are on Turbo's built-in pass-through list [17].
  - Next.js reads `.env.local` itself. Turbo doesn't load `.env` files [16].
- **Failover:** `providerOptions.gateway.models: ['openai/gpt-6-astra']` lists fallback models in order. `order` or `only` steer providers [12].
- **Spend:** `providerOptions.gateway.user` and `tags` attribute usage per user and per feature [12]. Budgets can be set per team, project, API key or member. A request with a deployment's OIDC token counts against the project and team budgets; a request with a key counts against the key and member budgets [19]. Set a project budget for Bearing.

## What Build must not reinvent

- **The tool loop and step cap:** `stopWhen: isStepCount(8)`, not a counter or a planner [6].
- **Validation:** tool-input validation (Zod via `inputSchema`) and tool-context validation (`contextSchema`) [7][8].
- **The UI message format and streaming protocol:** use `toUIMessageStream`, `createUIMessageStreamResponse` and `useChat`. No custom SSE and no separate chat-state library (C1) [5].
- **Message ids:** `generateMessageId` and `useChat({ generateId })` [5].
- **Reload validation:** `validateUIMessages` [5].
- **Approval state machine:** `toolApproval`, `addToolApprovalResponse` and `lastAssistantMessageIsCompleteWithApprovalResponses` [9].
- **Gateway concerns:** auth (key or OIDC), provider and model failover, per-user spend tags. Build no retry or fallback code [12][13].
- **Web search for later phases:** `gateway.tools.perplexitySearch()`, `exaSearch()` or `parallelSearch()` already work with any model [14]. Spec §8.1's "Web research is not a Gateway feature" is out of date (see below).
- **Sessions:** use Auth.js `auth()` for the session. Do not read the cookie by hand (spec §11.1 "Do not roll sessions").

## Spec claims found wrong or out of date

- §8.1 says "Web research is not a Gateway feature." The Gateway now ships search tools that work with any model (Perplexity, Exa, Tako, Browserbase, Parallel) [14].
- §8.1 says to use "`generateObject` when a skill must return a structured plan". `generateObject` has been deprecated since AI SDK 6. Use `generateText`/`streamText` with `output: Output.object(...)` [11].
- §8.1 says "`stopWhen` / step cap". This holds, but the 7.0 helper is `isStepCount` (`stepCountIs` was renamed) [10].
- §11.1 says "`pnpm add ai @ai-sdk/react zod`". The repo is npm workspaces pinned to npm 10.9.9 (C11).
- §11.3 lists `task_sources(task_id, source, source_id)`. See Spec decision 2: it needs `area_id` scoping to enforce §5's per-Area rule.
- The example model ids in §8.1 (`openai/gpt-6-astra`, `spacexai/grok-4.7`) are correct. Both are live and tool-capable (T6).

## Sources

All checked 2026-10-07.

1. `ai` on the npm registry: 7.0.133 `latest`, deps, peer `zod`, `engines.node >=22`. https://registry.npmjs.org/ai/latest (via `npm view ai`)
2. `@ai-sdk/react` 4.0.136, peer `react`. https://registry.npmjs.org/@ai-sdk/react/latest
3. `@ai-sdk/gateway` 4.0.108, deps `@vercel/oidc`. https://registry.npmjs.org/@ai-sdk/gateway/latest
4. `zod` 4.6.5. https://registry.npmjs.org/zod/latest
5. AI SDK, Chatbot Message Persistence (also bundled as `ai@7.0.133/docs/04-ai-sdk-ui/03-chatbot-message-persistence.mdx`). https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-message-persistence
6. AI SDK reference, `isStepCount`. https://ai-sdk.dev/docs/reference/ai-sdk-core/is-step-count
7. AI SDK reference, `tool()`: `execute` options including `toolCallId`; `needsApproval` deprecated. https://ai-sdk.dev/docs/reference/ai-sdk-core/tool
8. AI SDK, Runtime and Tool Context (`contextSchema`, `toolsContext`, telemetry filtering). https://ai-sdk.dev/docs/ai-sdk-core/runtime-and-tool-context
9. AI SDK, Tool Approvals and Chatbot Tool Usage. https://ai-sdk.dev/docs/agents/tool-approvals and https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-tool-usage
10. AI SDK, Migration guide 7.0: Node 22+, `stepCountIs` → `isStepCount`, `onFinish` → `onEnd`, result `toUIMessageStreamResponse` deprecated, `needsApproval` → `toolApproval`. https://ai-sdk.dev/docs/migration-guides/migration-guide-7-0
11. AI SDK, Migration guide 6.0 (`generateObject`/`streamObject` deprecated). https://ai-sdk.dev/docs/migration-guides/migration-guide-6-0
12. AI SDK, AI Gateway provider: auth, OIDC, `providerOptions.gateway` (`models`, `order`, `only`, `user`, `tags`). Also `@ai-sdk/gateway@4.0.108` source `getGatewayAuthToken`. https://ai-sdk.dev/providers/ai-sdk-providers/ai-gateway
13. Vercel docs, AI Gateway Authentication and BYOK. https://vercel.com/docs/ai-gateway/authentication
14. Vercel docs, AI Gateway Web Search. https://vercel.com/docs/ai-gateway/models-and-providers/web-search
15. AI Gateway live model list. https://ai-gateway.vercel.sh/v1/models
16. Turborepo docs, Using environment variables: strict mode, `.env` handling (also bundled in `turbo@2.11.7/docs`). https://turborepo.dev/docs/crafting-your-repository/using-environment-variables
17. Turborepo source, built-in pass-through env (`"VERCEL"`, `"VERCEL_*"`). https://github.com/vercel/turborepo/blob/main/crates/turborepo-env/src/lib.rs
18. PostgreSQL 17 docs, Unique Indexes (nulls distinct by default). https://www.postgresql.org/docs/17/indexes-unique.html
19. Vercel docs, AI Gateway Budgets (team, project, key and member scopes; which lane a request counts against). https://vercel.com/docs/ai-gateway/observability-and-spend/budgets
