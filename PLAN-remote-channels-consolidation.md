# PLAN — Remote channels consolidation: threads, tenancy, credentials

Status: R1–R3 + most of R5 SHIPPED in v0.1.90/v0.1.91 (pushed, deploy
pipeline green) · spike + hardening below · remaining work tracked in
§ "Open items" at the end · 2026-08-03 ·
**R2 SPIKE PASSED LIVE** against the dev stack (signed webhook through the
core gateway → gate-provisioned thread → real model turn → user+assistant
messages in `ai.thread_message` under the tenant, attributed to the mapped
user; `/threads` answered without a model turn). Method: dummy Slack creds +
a local stub Slack Web API via the new `SLACK_API_URL` override. The spike
found and fixed a live-only bug: `bindingShape` stripped `tenant_id` from the
resolve-op response (zod drops unknown keys), so the gate minted actor tokens
with an empty tenant and core answered 400 — the whole mapped-sender flow was
broken live while every unit test passed (they stub the raw HTTP response,
below the schema). Remaining owed: real-workspace Slack E2E (network path,
Slack-side config); **hardening finding FIXED + verified live:** a failing
adapter post (invalid token, Slack outage) crashed apps/ai via an unhandled
rejection in Chat SDK's render driver — root cause is a rethrowing `.catch`
on `driverPromise` that leaves the rejection unowned until the terminal-chunk
await; patched via `patches/@mastra__core@1.52.1.patch` (no-op catch branch
owns it; the terminal await still observes and logs), plus a process-level
`unhandledRejection` log-don't-crash guard in `apps/ai/src/index.ts` as
defense-in-depth (`uncaughtException` deliberately untouched). Crash-repro
rerun: adapter failures logged, process alive. Revisit the patch on any
Mastra upgrade — check whether upstream fixed the ownership gap. R4 not
started.
Owner: —
Context: follow-up to SYS-09/10/11/12 (see audit report §6/§9). Commit `ddbcf6be0`
introduced a destination gate (`findTenantConversation`) that reads
`module_remote.conversations` — a table **nothing writes**. The gate therefore
fails closed on every proactive send. This plan makes the routing real, unifies
channel conversations with the platform's tenant-scoped thread model, and paves
the credential path. Nothing here is pushed/released yet; remote channels are
off in every deployment, so there is no production urgency — but R1 must land
before the next release that contains `ddbcf6be0`.

---

## 0 · The model in one paragraph

Mastra Channels (Chat SDK) owns **conversation mechanics**: webhook verify,
platform-thread↔memory-thread mapping, streaming replies, tool cards, typing.
engenty owns **tenancy and authorization**: which tenant a platform thread
belongs to, which engenty user is speaking, which engenty thread the
conversation is backed by, and whether a proactive send may target a thread.
`module_remote.conversations` is the **routing table** between the two worlds —
not a message store. One platform thread ⇒ one dedicated engenty thread on the
`engenty.remote` agent. Remote conversations are **never** mixed into copilot
threads unless the user explicitly links them (R3, later).

Verified mechanics (compiled `@mastra/core` 1.52.1, `chunk-YU5XS4H4.js`):

- `AgentChannels` builds `MastraStateAdapter` from the **global**
  `mastra.getStorage().getStore("memory")` (line ~11471). Subscriptions and the
  external-thread mapping persist there; cache/locks/**dedup** are in-memory by
  design.
- `processChatMessage` → `getOrCreateThread` (line ~11954): looks up the mapping
  thread by metadata `{channel_platform, channel_externalThreadId}` in the
  global store; on miss creates it with `id: crypto.randomUUID()` and
  `resourceId` from our `resolveResourceId` hook (only on creation). That
  thread's **UUID is then passed as the memory thread id** to `agent.stream`
  (`memory: { thread, resource }`, line ~12103).
- `Agent.memory` accepts `DynamicArgument<MastraMemory>` (`agent/types.d.ts:658`)
  — a per-turn resolver. A process-singleton agent can bind tenant-scoped
  memory per turn.

Consequences we build on:

1. Channel thread ids are plain UUIDs ⇒ they pass `isEngentySessionThreadId`
   (UUID test, `engenty-session-memory-storage.ts:538`).
2. If we **pre-create** the mapping thread with our own UUID + the exact
   metadata `getOrCreateThread` filters on, the SDK adopts our thread — we
   choose the id, the SDK keeps all its mechanics.
3. If the agent's `memory` resolver returns the engenty tenant-scoped runtime,
   message reads/writes flow through `EngentySessionMemoryStorage` into
   `ai.thread` / `ai.thread_message` — same store, isolation, and UI surface as
   every other thread in the product.

---

## R1 · Make the routing real (fixes the `ddbcf6be0` gate)

**Goal:** every inbound event upserts the conversation row and dedups durably;
`remote_notify`'s destination gate starts returning rows instead of throwing.

**Where the code goes** (respecting the invariant: apps/ai never touches
`module_*` data — all module writes via core gateway ops):

| Change | File | Notes |
|---|---|---|
| Extend `remote_runtime_resolve_sender` input with `external_thread_id`, `external_event_id`, `is_dm` | `modules/engenty-remote/src/plugin.ts` (op at ~line 300) | one round trip, no new op |
| In the op handler: `recordInboundEvent` (dedup — **currently dead code**, `dal/repo.ts:297`) + upsert conversation `(binding_id, external_thread_id)` on the existing unique index, bump `last_event_at` | `modules/engenty-remote/src/dal/repo.ts` | add `upsertConversation`; return `{ id, ai_thread_id, fresh }` in the op output |
| Gate drops replayed events (`fresh: false`) | `apps/ai/src/api/remote-channels.ts` `createIdentityGateHandler` | replaces reliance on Chat SDK's in-memory dedup across restarts |
| Rewrite `conversations` table comment: "channel routing table — maps a platform thread to its tenant, binding, and backing engenty thread" | migration comment only (no schema change in R1) | |

**Tests:** repo test for upsert idempotency (same `(binding_id,
external_thread_id)` twice ⇒ one row, `last_event_at` bumped); gate test that a
duplicate `external_event_id` produces no agent run; `remote_notify` E2E-shaped
test: resolve_sender(threadX) then notify(threadX) succeeds, notify(threadY)
throws.

**Explicitly kept:** `inbound_events`. It stops being dead code and becomes the
durable dedup Mastra deliberately doesn't provide (restart inside a platform's
retry window = duplicate webhook). Add a retention note (e.g. prune > 7 days)
— follow-up, not R1.

## R2 · Dedicated engenty threads for channel conversations

**Goal:** a Slack/Telegram conversation is a real `ai.thread` on the
`engenty.remote` agent — tenant-scoped storage, visible/auditable like any
other thread, never mixed with copilot threads.

**Mechanism (the pre-create trick):** in the identity gate, after sender
resolution and before `defaultHandler`:

1. If `conversation.ai_thread_id` is null: mint a UUID; create the engenty
   thread via `AgentSessionStore.upsertSession` (`apps/ai/src/dal/agent-sessions/agent-session-store.ts:63`
   — supports caller-supplied `id`, `createdByUserId` ⇒ participant row) with
   `agentId: "engenty.remote"`, `routeContext: { channel: { platform,
   external_thread_id, binding_id } }`; create the **mapping thread with the
   same UUID** in the global Mastra memory store with metadata
   `{channel_platform, channel_externalThreadId, channel_externalChannelId}`
   so `getOrCreateThread` finds it and passes our UUID to `agent.stream`;
   write `ai_thread_id` back via the (extended) resolve op.
2. If set: nothing to do — the SDK finds the mapping thread by metadata.

**Memory binding:** give the channel agent a `memory` resolver
(`DynamicArgument`) that reads the ALS scope set by the gate
(`engentyToolsRunAls`) and returns
`createEngentySessionMemoryRuntime({...}).memory`
(`apps/ai/src/ai/memory/invocation-options.ts:67`). `resolveResourceId` on the
`ChannelConfig` returns the engenty `userId` (the scoped storage prefixes
tenant itself: `engenty-session-memory-storage.ts:437`).

| Change | File |
|---|---|
| Pre-create/lookup in gate; ALS scope already present | `apps/ai/src/api/remote-channels.ts` |
| `memory` resolver + `resolveResourceId` on the agent | `apps/ai/src/api/remote-channels.ts` (`createRemoteChannelsAgent`) |
| `ai_thread_id` write-back (extend resolve op or tiny `remote_runtime_attach_thread` op) | `modules/engenty-remote/src/plugin.ts` + `dal/repo.ts` |
| Reuse, don't reinvent: thread creation pattern from the team-chat mention consumer (`apps/ai/src/api/team-chat-mention-consumer.ts:125` already sets `ai_thread_id` on its side) | reference only |

**Verify before building (the one open risk):** that a dynamic `memory`
resolver is honored on the `agent.stream` call path Chat SDK uses
(`processChatMessage` passes `memory: {thread, resource}` options; the memory
*instance* comes from the agent). Spike first: one DM turn, assert the message
lands in `ai.thread_message` under the right tenant. If the resolver is not
honored there, fallback: keep global-store persistence for channel messages
(status quo) and ship R1+R3 only — the routing table still gives tenancy and
the destination gate still works.

**UI note:** `engenty.remote` threads will appear wherever threads are listed
by agent. Decide: badge them (`route_context.channel` is there to render a
Slack/Telegram chip) or filter them out of the copilot thread list. Small UI
follow-up in `apps/ui`.

## R3 · Thread control from the channel (slash commands) — v2

Start simple (R2 ships without this): one platform thread = one engenty
thread, forever. Then:

- Parse leading `/` in the gate **before** `defaultHandler` (plain text — no
  platform slash-command registration needed; Slack slash commands require app
  config and a different webhook, avoid).
- v2 commands: `/new` (archive pointer, mint fresh thread: update
  `conversations.ai_thread_id` + re-point the mapping-thread metadata),
  `/threads` (list my recent `engenty.remote` threads), `/link <thread-ref>`
  (explicitly attach an existing copilot thread — the only sanctioned mixing,
  user-triggered).
- The existing chat-command catalog (`packages/ai-core/src/chat-commands/`,
  COMMAND.md scanning, `apps/ai/src/api/chat-command-routes.ts`) is for the
  engenty chat UI; reuse its *parser* (`contracts.ts` exact-token match) but do
  not force remote commands through the module catalog in v2 — the remote set
  is tiny and gate-local.

## R4 · Per-tenant credentials — implementation spec (2026-08-04)

Written as an executable spec instead of implemented overnight: the credential
surface (`service-credential.ts`, scheduler invoker, connections) was under
active concurrent refactor (tenant-scoped service tokens), and the
E2E-precondition (decision #4) stands. Grounded against the real APIs.

**Target:** bot credentials live per-tenant in the connections framework;
apps/ai holds no platform tokens; a binding's `connection_id` (column exists,
nullable) points at the installation. Kills the last SYS-10 property (one
platform-level bot for all tenants).

**Step 1 — `slack-bot` connector** (`modules/connections/providers/slack/`):
the existing Slack connector is a USER-token flow (scopes via
`extraAuthParams.user_scope`, `baseScopes: []` — see `connector.ts` header
comment). Add a second connector id `slack-bot` in the same provider: OAuth v2
with BOT scopes in the normal `scope` param (`app_mentions:read`, `im:history`,
`chat:write`, `users:read`), token = `access_token` from the workspace install
response (`team.id` captured as the account anchor → becomes
`bindings.external_workspace_id`). The signing secret stays app-level (one
Slack app per installation signs all workspaces) — platform setting, not
per-connection. Telegram: `telegram-bot` connector, `immediate` kind (token
paste), bot id as account anchor.

**Step 2 — binding ↔ connection:** `remote_bindings_upsert` accepts
`connection_id` (already in the schema/op); Settings UI gains a connection
picker (connections framework list, filter `slack-bot`). Binding creation from
a fresh OAuth install can auto-fill `external_workspace_id` from the
connection's account anchor.

**Step 3 — runtime credential resolution:** the provider layout stays
(`providers/slack.ts` keeps `id`/`isConfigured`/`createAdapter`), but
`createAdapter` becomes per-binding: on boot, the runtime asks core for the
active bindings + their connection-backed bot tokens (new MANAGE op
`remote_runtime_list_installations` returning decrypted tokens over the
service channel — same trust boundary as `remote_runtime_resolve_sender`),
constructs ONE adapter per workspace (Chat SDK `SlackAdapter` supports
`SlackInstallation` storage — `setInstallation(teamId, …)`; prefer that over
N adapter instances if one adapter can host N installations — VERIFY in
`@chat-adapter/slack` before choosing). Env vars remain the fallback when no
connection-backed binding exists (Tier-B single-tenant), so nothing breaks.

**Step 4 — refresh/revoke:** connections framework owns token refresh; the
runtime re-fetches installations on `connections.connected` bus events (the
event exists; subscriber count today: zero) and on a 401 from the platform.

**Step 5 — retire:** once all bindings carry `connection_id`, drop
`SLACK_BOT_TOKEN`/`TELEGRAM_BOT_TOKEN` from the manifest and flip
`isConfigured()` to "has ≥1 connection-backed binding OR env fallback".

**Preconditions unchanged:** real-workspace Slack E2E first (regression
baseline), and land after the concurrent service-credential refactor settles —
both touch the same files.

## R5 · Cleanup

- **DECIDED (Matthias, 2026-08-03): platform validity is a code concern, never
  a database enum.** DONE: migration `20260803213500` drops the platform check
  constraints on `bindings`/`identities`/`pairing_requests` (they permitted
  whatsapp/teams with no adapter installed and forbade discord). Validation
  lives in the provider registry.
- **Provider code layout** (DONE, v1):
  `apps/ai/src/api/remote-channels/providers/` — one file per platform
  (`slack.ts`, `telegram.ts`) implementing `RemoteChannelProvider`
  `{ id, isConfigured(), createAdapter() }`, plus `index.ts` as the registry.
  Adding a platform = one provider file + one registry entry, no migration.
  R4 (`EngentyChannelProvider`, per-tenant credentials via connections) swaps
  each file's internals — env reads become connection lookups — but keeps this
  layout.
- The module keeps `REMOTE_PLATFORMS` (zod) as operation-input validation; when
  a platform is added, extend the provider registry AND that list (both are
  code — acceptable per the decision).
- `conversations.is_dm` — populated by R1 (arrives with the event).
- Retention job for `inbound_events` (7d) — piggyback on an existing sweep.

---

## Decisions needed

| # | Question | Default if unanswered |
|---|---|---|
| 1 | R2 UI treatment of `engenty.remote` threads (badge vs filter) | badge, don't hide |
| 2 | Keep `inbound_events` as durable dedup | yes (R1 uses it) |
| 3 | R3 command set beyond `/new` `/threads` `/link` | none |
| 4 | R4 timing relative to Slack E2E | E2E first, hard precondition |

## Sequencing

R1 (small, unblocks `ddbcf6be0`) → R2 spike → R2 → R5 → R3 → [Slack E2E] → R4.
R1+R5 are releasable alone; R2 is the substance; R3/R4 are independent tails.

---

## Open items (audited 2026-08-03, post-v0.1.91)

Ordered by leverage; ① blocks ⑤⑥, everything else is independent.

1. **Real-workspace Slack E2E** — the only remaining unverified layer is
   Slack's side (event subscription config, real signatures, real thread ids,
   attachment URLs). Everything below the network edge is spike-proven.
   Needs: a Slack app + tunnel to the dev gateway (docs describe it). Hard
   precondition for R4.
2. **Workspace routing** — DONE + verified live 2026-08-03: the gate now
   extracts the workspace anchor from `message.raw` (Slack `team_id`/`team`
   string/`team.id` object/`user.team_id` — all four shapes tested; Telegram
   deliberately null, the bot token is the anchor) and forwards it, so
   workspace-anchored bindings match. Live: event with matching `team` routed
   and provisioned a thread; a foreign workspace was refused ("no active
   binding", no row) — the server's single-null-anchor fallback already
   refused to guess between multiple tenants, so the failure mode was
   unroutability, not misroute.
3. **In-thread approval cards** — TESTED LIVE 2026-08-03, and the "(Phase 3)"
   comment was aspiration: `approvalPolicy: "suspend"` renders NO card. Chat
   SDK's driver renders Approve/Deny only on Mastra's native
   `tool-call-approval` chunk; the engenty approval suspends the run from
   *inside* the tool (workflow suspension), which never emits that chunk — the
   Slack user stared at a spinning tool card while the run parked in the
   in-process 15-min map (RUN-01) with no resume path from Slack. Changed the
   channel policy to `"defer"`: core records a durable approval request, the
   tool returns `approval_pending`, the turn ends with an honest reply, the
   inbox pings a human — aligned with the D2 unified-approvals direction
   (approve mints the grant a retry spends). In-place cards + resume = map the
   engenty approval onto Mastra's native tool-approval flow for channel turns;
   build on top of D2, not before it. NOTE: the defer path is unit-tested but
   its live run was blocked overnight — channel turns started hanging at
   stream init AFTER the concurrent working-tree changes of 2026-08-03 ~22:20
   (turns at 21:07 and 21:34 progressed fine; both suspend and defer variants
   hang identically since). Re-run the stub-Slack approval test once the tree
   settles.
4. **UI treatment of channel threads** — DONE, differently than assumed: the
   copilot drawer filters by agent id, so `engenty.remote` threads never
   appeared anywhere (the "badge" framing was wrong). Added a
   **Conversations** section to the module settings page
   (`/mdl/engenty-remote/settings`) via a new `remote_conversations_list` op:
   platform thread, DM/channel, backing engenty thread, last activity.
5. **R4 — per-tenant credentials** (`EngentyChannelProvider` + connections
   framework, `bindings.connection_id`). The real multi-tenant fix; moves the
   bot token out of apps/ai env. Blocked on ① by decision #4.
6. **Prod enablement steps** (when first turned on in prod): manual PostgREST
   exposed-schemas PATCH for `module_remote` (like every module schema);
   set platform credentials; confirm `core.users.impersonate` on the service
   principal.
7. **Housekeeping** — DONE 2026-08-03 except one: `inbound_events` retention
   now prunes opportunistically on the ingest path (7d, non-fatal, no
   scheduler dependency); `REMOTE_PLATFORMS` aligned to the provider registry
   (slack, telegram); docs updated (routing table, chat controls,
   `SLACK_API_URL`, real-workspace E2E runbook, prod enablement checklist).
   Still open: `/new` leaves detached mapping threads in the global store
   (harmless rows, sweep eventually).
8. **Mastra upgrade watch** — drop `patches/@mastra__core@1.52.1.patch` when
   upstream owns the driverPromise rejection; re-verify the pre-created
   mapping-thread trick (metadata filter shape) on every Mastra bump — R2
   rides an internal behavior, and the regression surface is exactly one
   integration test away (see ①).
