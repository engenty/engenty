# PLAN — Remote channels consolidation: threads, tenancy, credentials

Status: R1–R3 + most of R5 IMPLEMENTED on main (unpushed) · 2026-08-03 —
unit-tested, NOT live-verified (the R2 spike — one real DM turn proving the
dynamic memory resolver lands messages in ai.thread_message — is still owed,
along with the long-standing Slack E2E). R4 not started.
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

## R4 · Per-tenant credentials (`ChannelProvider`) — the real multi-tenant fix

Unchanged from the earlier design discussion; recorded here so this plan is the
single reference:

- Implement `EngentyChannelProvider` against Mastra's `ChannelProvider`
  interface (`configure`, `connect` → `oauth | deep_link | immediate`,
  `listInstallations`, `disconnect` — `channels/types.d.ts`).
- Credentials live in the connections framework;
  `bindings.connection_id` (nullable today, comment says "spike/env-credential
  bindings have no stored connection") becomes the pointer.
- Kills: bot token in apps/ai env (moves custody to core), one-bot-per-
  installation (⇒ N Slack workspaces / N tenants), and the property that made
  SYS-10 cross-tenant.
- Precondition: live Slack E2E exists (owed since v0.1.48) so this has a
  regression baseline. Do not start R4 before that.

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
