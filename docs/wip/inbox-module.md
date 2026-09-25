# Inbox module — design & plan

> **Superseded in part (2026-09-23):** connections belong to a Space
> (`module_connections.connections.space_id`; `connected_by` is audit only).
> `sharing`, `non_owner_max_group`, owner-based reach and owner approvals are
> gone. Current model: `docs/content/dev/connections.md`,
> `PLAN-space-owned-connections.md`. Inbox rows carry the mailbox's
> `space_id` instead of `owner_user_id`.

Status: v1 IMPLEMENTED 2026-07-05 on `feat/connections` (phases 1–4:
schema/repo, sync engine, UI, search + agent surface). Phases 5–6 (triage
model, reply/send) remain open.
**Prerequisite:** `docs/wip/connections-multi-account-groundwork.md`
(workstreams A, C, D; B before reply-flows) — shipped.

Implementation deltas vs. the plan below (`modules/inbox`):

- **Scheduling:** the triggers substrate only materializes agent Tasks
  (`triggers_fire` requires a task template), so the deterministic sync pulse
  is a **system job** `inbox-sync` in `apps/ai` (`*/5 * * * *`) that invokes
  the `inbox_sync_run` module operation over the service JWT — the sync body
  runs in core, where the connector registry lives.
- **Agent surface = module operations:** `inbox_threads_list`,
  `inbox_thread_get`, `inbox_set_status`, `inbox_accounts_list`,
  `inbox_sync_settings_update`, `inbox_sync_run`, plus the synthesized
  `inbox_message_search` (op names differ slightly from the sketch below).
- **Search v1 is lexical-only:** `module_inbox.search_messages` FTS RPC over
  the base table (provider id `inbox.message`, no derived index, no
  embeddings — semantic can be layered later without changing the tool). The
  owner-visibility filter (`owner_user_id is null or = user_id`) is in the
  first version as decided; the host injects authenticated
  `filters.tenant_id`/`filters.user_id`.
- **Backfill window is per connection** (`sync_state.backfill_days`, default
  90), not per tenant; the per-account sync toggle lives on the same row.
- Cursor-expiry handling: one automatic null-cursor re-backfill per run
  (dedup on `(connection_id, provider_message_id)` absorbs the overlap).
- UI routes follow module conventions: `/mdl/inbox`, `/mdl/inbox/settings`,
  `/mdl/inbox/:threadId`. HTML bodies render inside `sandbox=""` iframes;
  reply-split + cid-resolve lifted from legacy with their tests.
- Threads are grouped by `(connection_id, provider_thread_id)`; messages
  without a provider thread id get a synthetic single-message thread.

A fresh module on the current substrate — connections framework, hybrid
search, Mastra triggers/tasks, native approvals. The legacy inbox
(`/Users/m/code/engenty/legacy/modules/inbox`) is a *parts bin, not a
template*: it proved sync-to-local works and left reusable pieces, but the
concept here stands on its own.

## What it is

A general, simplified email client inside engenty:

- synced local message store across all connected mail accounts
- account switcher/filter (personal + org mailboxes side by side)
- triage states (`new → read → archived`) as first-class mailbox data; agent
  processing progress is reserved for `message_routes` (per-consumer), not the
  email status column
- hybrid search over messages (UI + agent tool)
- the substrate that routines and, later, the customer-care module process

## Decisions (settled)

| Decision | Choice |
|---|---|
| Data plane | Sync-to-local store; provider APIs never in render/triage path |
| Provider fetch | Connector-side `stream` capability (groundwork D) — inbox is provider-agnostic |
| Accounts | No accounts table — accounts ARE connections; `external_account` is the label |
| Background consent | Sync requires connection `autonomous_mode ≥ read_only`; `off` = visible no-op |
| Outbound writes | Through connector actions (`gmail_send_message`, …) — allow/ask/deny + approvals unchanged |
| Search | `registerSearchIndexProvider` (KB pattern) with owner-scoped visibility from v1 |
| Body storage | Text + HTML bodies local; attachment metadata local, content on demand |
| Backfill | ~90 days default, per-tenant configurable |

## Open: triage/classification model (TBD)

Two candidate models — deliberately NOT decided yet:

**Model 1 — stream hook (centralized pipeline).** Inbox owns a classify
stage in the sync pipeline; other modules register hooks/processors
(legacy-style dispatcher). One cheap pass per message, one consistent
`classification` column, natural dedup — but inbox becomes an orchestrator
and hooks run on its terms.

**Model 2 — per-module triage (decentralized).** Inbox only maintains the
store and emits bus events (`inbox.message.synced`); each module/routine
subscribes via event triggers and processes on its own terms, keeping its
own marks. Maximum flexibility and decoupling — but N passes over the same
message (duplicate LLM spend), no single "processed" truth, ordering is
per-consumer.

**Likely hybrid:** inbox provides *shared cheap signals* as a common good
(a small-model/deterministic classify stage writing
`classification`/`classification_reason` — read-only hints, never actions),
while acting consumers subscribe to events and run their own deep triage.
"Processed" then splits: a global user-facing `status` on the message +
per-consumer marks (`message_routes`-style rows) for modules. Decide when
building phase 5; schema below keeps both doors open.

## Architecture

```
connections framework       auth, tokens, consent, approvals   (shipped)
connector stream cap.       pull(cursor) → normalized InboundMessage[]   (groundwork D)
module consumption API      policy-checked server-side access  (groundwork C)
module_inbox                local data plane
search-index provider       hybrid search + agent tool
heartbeat/event triggers    sync scheduling; triage routines (defer approvals)
```

### Schema (`module_inbox`)

- `threads` — subject, participants digest, last_message_at, message_count,
  provider refs (`connection_id`, `provider_thread_id`).
- `messages` — thread_id, `connection_id`, `provider_message_id` (unique per
  connection), from/to/cc, subject, `body_text`, `body_html`,
  `attachments_json` (metadata + content_id), `received_at`.
  Triage: classic mailbox `status new|read|archived`, `status_set_by`
  (user id | task/routine ref), machine hints `classification` +
  `classification_reason` (nullable; superseded in practice by `ai_category`),
  user override `user_classification`.
- `sync_state` — per `connection_id`: cursor, backfill window/progress,
  last_synced_at, last_error.
- `message_routes` — per (message, consumer) status/retry rows. Ships empty
  in v1; carries Model 1/hybrid dispatch later without a schema break.
- RLS: org-connection messages tenant-readable; personal-connection messages
  owner-only (mirror of connections sharing semantics).

### Sync engine

- Heartbeat trigger (existing substrate) → sync job iterates active,
  stream-capable connections via the module consumption API.
- Incremental `pullStream` per connection; upsert threads/messages; emit
  `inbox.message.synced` bus events (feeds search reindex + Model-2
  consumers for free).
- Backfill on first sync (window-bounded, chunked, resumable via
  `sync_state.backfill_progress`).
- Failure isolation per connection: one broken account never blocks others;
  errors surface on the account row in the UI.

### Search (hybrid)

`registerSearchIndexProvider` over `inbox.message.*` events → UI search +
auto agent tool. Payload carries `owner_user_id` (null for org) — the
visibility filter lands in the FIRST index version (retrofit is painful).

### Agent surface

- Local reads (fast, no provider quota): `inbox_search`, `inbox_get_thread`,
  `inbox_set_status`.
- Writes via connector operations — consent machinery applies unchanged.
  Reply-from-a-specific-account needs groundwork B (account addressing).

### UI

- Routes: `/inbox` (list: account filter chips, status lanes, search) and
  `/inbox/:threadId` (thread view, reply composer → connector action).
- Settings: per-account sync toggle + backfill window; account rows link to
  the connections detail page (consent lives there, not duplicated here).
- Lift from legacy WITH tests: `email-reply-split.ts` (quoted-reply
  collapsing), `cid-resolve.ts` (inline CID images).
- Realtime on `messages` for live updates (legacy precedent; live-cache).

## Build plan

| Phase | Scope | Depends on | Est. |
|---|---|---|---|
| 1 | Schema + migration + repo (threads/messages/sync_state) | groundwork A | 0.5 d |
| 2 | Sync job (heartbeat trigger, incremental + backfill, per-connection isolation) | groundwork C+D | 1–1.5 d |
| 3 | UI: list + thread view + account filter (lift reply-split/cid-resolve) | 1 | 1.5 d |
| 4 | Search-index provider + `inbox_*` agent tools | 2 | 0.5–1 d |
| 5 | Triage: decide Model 1/2/hybrid; status flows; routine template (approval-gated) | 2, 4 | 1–1.5 d |
| 6 | Reply composer + send via connector action (needs groundwork B); Outlook stream; provider push via webhook trigger edges | 3, B | 1–1.5 d |

Phases 3 and 4 parallelize. v1 = phases 1–4 (usable synced inbox with
search); 5–6 make it act.

## Open decisions (beyond triage model)

- Attachment mirroring: metadata-only (current lean) vs. copying small
  attachments into file-storage for preview/indexing.
- Body retention/PII: how long full bodies stay local; per-tenant retention
  setting?
- Org-mailbox creation: stays open to all members or admin-only?
- Label write-back: mirror engenty `processed` status to a provider label?

## Legacy parts bin (reference)

Reusable with tests: `ui/lib/email-reply-split.ts`, `ui/lib/cid-resolve.ts`;
envelope shape (`RawEmailMessage` → groundwork's `InboundMessage`); Gmail
history.list handling in `src/providers/gmail.ts`; dual
machine/user-classification columns; `message_route` per-consumer rows.
Explicitly NOT carried: own OAuth/token store, `EmailProvider` auth+fetch
mix, bespoke classify queue, provider live-search.
