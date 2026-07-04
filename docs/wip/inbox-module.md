# Inbox module — design (from scratch, on the new substrate)

Status: WIP design, 2026-07-04. Successor to the legacy inbox module
(`/Users/m/code/engenty/legacy/modules/inbox`), rebuilt on the connections
framework, hybrid search, Mastra triggers/tasks, and native approvals.

## What it is

A general, simplified email client inside engenty: synced local message store,
account switcher/filter, triage states, hybrid search — plus the stream that
routines and (later) the customer-care module process.

## Lessons mined from the legacy inbox

The legacy module worked end-to-end (Gmail + Outlook OAuth, incremental sync
via `last_history_id`, staged pipeline `inbox → classifying → finalize` with
crash recovery, LLM classification, multi-module dispatch to
expenses/leads/projects, full three-view UI). What its architecture teaches:

**Absorbed by the connections framework (delete, don't port):**
- Own OAuth routes + `pending_oauth_flows` + token crypto + encrypted token
  columns on `accounts` — all of it is now `module_connections`.
- The `EmailProvider` interface mixed auth concerns (`getAuthUrl`,
  `exchangeCodeForTokens`) with fetch concerns (`getMessages`,
  `getAttachment`). Auth is gone; fetch becomes the connector-side `stream`
  capability (below).

**Carry forward (validated by legacy):**
- Sync-to-local with provider cursors (`last_history_id`) — worked; keep.
- The `RawEmailMessage` normalized envelope (from/to/cc, `body_text` +
  `body_html`, attachments with `content_id`, `thread_id`,
  `provider_message_id`) — directly reusable as the stream item shape.
- Message rows carrying BOTH machine classification (`classification`,
  `classification_reason`) and user override (`user_classification`,
  `user_action`) — the triage model; keep the dual columns.
- The processor/dispatch registry (`registerProcessor`, per-message
  `message_route` rows with per-route status/retry) — this is the seed of the
  customer-care module. Keep the concept; revisit bus-backed vs. explicit
  routes at build time (explicit routes win on auditability/retry).
- UI email-rendering utilities: `email-reply-split.ts` (quoted-reply
  collapsing), `cid-resolve.ts` (inline CID image resolution) — lift as-is
  with their tests. Painful to rediscover.
- Realtime on the messages table (live inbox updates); per-processor
  tenant settings.

**Do differently:**
- Search: legacy did live provider search (`searchMessages`). New: hybrid
  local search via `registerSearchIndexProvider` (KB pattern:
  auto agent tool + reindex from bus events + admin backfill).
- Classification: legacy ran a bespoke classify queue. Keep a *cheap*
  deterministic/small-model classify stage that only writes columns; anything
  that ACTS (reply, label, dispatch) is a routine/task on the Mastra
  substrate, approval-gated through connections policies.
- Scheduling: heartbeat triggers (trigger-heartbeats phase) instead of a
  custom job loop; provider push (Gmail watch / Graph subscriptions) later
  via the existing webhook trigger edges.

## Architecture on the new substrate

```
connections framework      auth, tokens, per-action consent, approvals
connector stream cap.      gmail/outlook: pull(cursor) → {items, nextCursor}
module_inbox               local data plane: threads/messages, sync state,
                           triage state, dispatch routes
search-index provider      hybrid search over messages (+ agent tool)
triggers + task jobs       sync heartbeat; triage routines (defer approvals)
```

### Schema (module_inbox)

- `messages` / `threads` — provider-agnostic index: participants, subject,
  `body_text` + `body_html`, `attachments_json` (content fetched on demand via
  connector action), `received_at`, provider refs (`connection_id`,
  `provider_message_id`, `provider_thread_id`).
  Triage: `status: new | triaged | processed | archived`,
  `classification` + `classification_reason` (machine),
  `user_classification` + `user_action` (override), `processed_by`
  (user id | routine/task ref).
- `sync_state` — per `connection_id`: cursor (Gmail `historyId`, Graph
  `deltaLink`), backfill progress, last error.
- `message_routes` — dispatch rows per (message, processor) with status/retry
  (carried from legacy; powers customer-care later).
- NO accounts table. Accounts ARE connections (`module_connections`), joined
  live; `external_account` is the display label.

### Sync engine

- Per-connection incremental pull through the connector `stream` capability;
  driven by a heartbeat trigger; backfill window ~90 days (configurable).
- Consent: background sync requires the connection's
  `autonomous_mode ≥ read_only` — the existing setting already means "may
  read unattended". Sync is a no-op (visible in UI) for `off` connections.
- Writes back to providers (reply, label-mirror) go through the normal
  connector actions ⇒ allow/ask/deny + approval machinery unchanged.

### Agent surface

Reads from the LOCAL store (fast, no provider quota):
`inbox_search` (hybrid), `inbox_get_thread`, `inbox_set_status`.
Writes via connector operations (`gmail_send_message`, …) — consent applies.

### Search scoping (design-in from day one)

Personal-account messages must be searchable/visible ONLY to the owner; org
mailboxes tenant-wide (action caps via `non_owner_max_group` still apply).
The search payload carries an owner/visibility filter — retrofitting this is
painful, so it lands with the first index version.

## Prerequisites (connections framework additions)

1. **Multi-account + addressing** — re-key uniqueness on `external_account`
   (`(tenant, connector, owner, external_account)` personal,
   `(tenant, connector, external_account)` org); inject optional `account`
   param into connector tools; candidates listed in tool description; fix the
   personal-shadows-org resolution.
2. **Module consumption API** — sanctioned server-side path for modules to
   call connector actions / streams under policy + autonomous-mode checks
   (thin wrapper over `resolveConnectionForPrincipal` + policy +
   `withFreshAccessToken`).
3. **Connector `stream` capability** — optional per connector:
   `stream.pull(cursor, ctx) → {items: NormalizedMessage[], nextCursor}` with
   the legacy `RawEmailMessage` envelope as the item shape. Gmail first;
   Outlook = same interface later. Sync-shaped provider calls stay in the
   connector module (`visibility: system`, not in the agent tool catalog).

## Build sequence

1. Primitives 1+2 (one focused session; everything builds on them)
2. Stream capability on the Gmail connector (mine legacy `providers/gmail.ts`
   for history.list handling + message parsing — partially already ported
   into `connections-google` for `get_thread`)
3. Inbox core: schema, sync worker + heartbeat, list/detail UI
   (lift reply-split + cid-resolve), account filter
4. Search-index provider + agent tools
5. Triage: classify stage (cheap pass) + routine template on the trigger
   substrate; approval flow already works (defer + inbox notifications)
6. Outlook stream; provider push (Gmail watch / Graph subscriptions) via
   webhook trigger edges; `message_routes` dispatch → customer-care seed

## Open decisions

- Dispatch: explicit `message_routes` registry (legacy pattern) vs. pure bus
  events — leaning explicit routes for auditability/retry.
- Attachment storage: metadata-only locally, content on demand (lean) vs.
  mirroring small attachments into file-storage for preview/indexing.
- Org-mailbox UI visibility default; whether creating org connections stays
  open to all members or becomes admin-only.
- Body retention/PII: how long full bodies stay local; per-tenant retention
  setting?

Related docs: `docs/wip/connections-framework.md`,
`docs/content/dev/connections.md`.
