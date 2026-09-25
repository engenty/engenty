# Connections groundwork — multi-account + module consumption + streams

> **Superseded in part (2026-09-23):** connections belong to a Space
> (`module_connections.connections.space_id`; `connected_by` is audit only).
> `sharing`, `non_owner_max_group`, owner-based reach and owner approvals are
> gone. Current model: `docs/content/dev/connections.md`,
> `PLAN-space-owned-connections.md`.

Status: IMPLEMENTED 2026-07-04 on `feat/connections` (all four workstreams).
Extends the connections framework (`docs/wip/connections-framework.md`,
shipped on `feat/connections`). Companion plan: `docs/wip/inbox-module.md`
(first consumer).

Implementation deltas vs. the plan below:

- The migration is `20260704120000_plugin_connections_multi_account.sql`
  (module migrations must use the `plugin_` slug prefix).
- Unique indexes use `NULLS NOT DISTINCT` (PG 17), so even raw inserts cannot
  stack duplicate null-account rows; the upsert additionally adopts a
  null-account row as its replace target when the same scope reconnects with
  a resolved account.
- The shared resolver lives in `packages/connections-sdk/src/accounts.ts`
  (`selectConnectionForAccount`); typed failures (`ConnectionsActionError`
  with `code` + `details.candidates`) come from `errors.ts`.
- The shared execution path is `executeConnectorAction()` (`execute.ts`);
  the module client is `createConnectionsModuleClient(supabase, { moduleId })`
  (plus `…FromRepo` for composition/tests) in `client.ts`.
- `client.pullStream` policy check runs as a read-group pseudo-action with
  selector `stream_pull` (overridable per connection); it requires a resolved
  `allow`, and defaults the acting principal to the connection owner.
- Gmail stream cursors are opaque strings: plain historyId when incremental,
  a JSON `{"backfill":{historyId,pageToken}}` continuation while the initial
  `messages.list` window is still paging. An expired historyId throws
  `gmail_stream_cursor_expired`; the consumer re-pulls with a null cursor and
  dedupes by `provider_message_id`.

## Goal

Evolve connections from "one connection per user (personal) / per tenant
(org) per connector" to:

1. **N accounts per connector** (two personal Gmails; `office@` + `support@`
   org mailboxes) with explicit account addressing in tools,
2. a **sanctioned server-side consumption API** so modules (inbox, KB,
   customer care) can use connections under the same consent rules,
3. a **connector-side stream capability** (DECIDED) — connectors declare how
   to pull normalized inbound items; consumers stay provider-agnostic.

Everything is additive to the shipped framework; no schema rewrites.

---

## Workstream A — multi-account storage

**Today:** partial unique indexes allow one `personal` row per
(tenant, connector, owner) and one `org` row per (tenant, connector);
`upsertConnectionWithTokens` replaces tokens on reconnect.

**Change:** discriminate by `external_account` (already captured at callback
via `resolveAccount` — the Google/MS email, Slack user).

- Migration (new file in `modules/connections/supabase/migrations/`):
  - drop `uq_module_connections_personal` / `uq_module_connections_org`
  - recreate:
    - personal: unique (tenant_id, connector_id, owner_user_id, external_account)
    - org: unique (tenant_id, connector_id, external_account)
  - `external_account` may be null (resolveAccount failure): keep nullable;
    upsert treats a null-account row as the replace target so a degraded
    connect never strands duplicates.
- `repo.upsertConnectionWithTokens` (packages/connections-sdk/src/repo.ts):
  match on `external_account` as well — same account reconnect replaces
  tokens (connection id stable, downstream cursors survive); different
  account inserts a new row.
- UI (modules/connections/ui): keep the Verbinden button visible when already
  connected ("Add account"); per-connection panels are already list-shaped —
  no structural change.

**Acceptance:** connect two different Google accounts personally → two
panels, independent policy matrices; reconnect the same account → tokens
refreshed, same connection id. Org: two shared mailboxes coexist.

Effort: ~0.5 day incl. tests.

## Workstream B — tool addressing + resolution fix

**Today:** `resolveConnectionForPrincipal` picks personal-if-exists else org
(repo.ts:196) — personal *shadows* org; no way to target an account.

**Change:**

- `resolveConnectionForPrincipal` → `listCandidateConnections` (all active
  connections the principal may use: own personal + org).
- Inject an optional `account` string param into every projected action's
  input schema (`runtime.ts` `buildActionOperation` wraps `inputSchema`).
  Selection: explicit `account` matches `external_account`/`display_name`
  (case-insensitive substring); no `account` + exactly one candidate → use
  it (zero friction, fully backward compatible); no `account` + several →
  **structured error** listing candidates (`connection_ambiguous` with
  account labels) so the agent self-corrects or asks.
- New read operation `connections_list_accounts` (connector id → account
  labels + sharing) — cheap discovery for agents. (Static tool descriptions
  cannot enumerate per-tenant accounts — the operation catalog is
  process-global — so the error path + discovery op carry that job.)
- Same selection logic in the profile policy gate (policy evaluation needs
  the same candidate the handler will use — share one resolver).

**Known coarseness (accepted for v1, documented):** durable approval grants
are keyed by operation id only — "always allow `gmail_send_message`" spans
all connected accounts. Tightening to (operation, connection) pairs touches
the chat pre-gate; separate follow-up.

**Acceptance:** with personal + org Gmail connected, `gmail_search_threads`
without `account` returns the candidate-list error; with
`account: "office"` it hits the org mailbox. Single-account tenants see no
behavior change.

Effort: ~1 day incl. tests.

## Workstream C — module consumption API

**Today:** connector actions are reachable only as gateway operations
(agent/HTTP-shaped). Modules have no sanctioned server-side path.

**Change:** refactor the body of `buildActionOperation`'s handler
(candidate resolution → policy check → `withFreshAccessToken` → handler)
into a shared `executeConnectorAction()` in the SDK, used by BOTH the
operation and a new module-facing client:

```ts
const client = createConnectionsModuleClient(supabase, { moduleId: "inbox" });
await client.listConnections({ tenantId, connectorId? });        // active only
await client.callAction({
  connectionId, workflowId, input,
  principal: { type: "service", id },   // or a user principal
  isAutonomous: true,                    // background ⇒ autonomous clamps apply
});
```

- Policy is NOT bypassed: `isAutonomous: true` enforces
  `autonomous_mode` clamps + ask→deny-with-approval-request exactly like the
  gateway path; deny reasons surface as typed errors.
- Audit: calls record the consuming `moduleId` in the audit event detail.

**Acceptance:** a test module reads via `callAction` on a `read_only`
connection; the same call on an `off` connection is denied; a write action
records an approval request instead of executing.

Effort: ~1 day (mostly refactor + tests; logic exists).

## Workstream D — connector stream capability (DECIDED: connector-side)

**Change:** optional `stream` on `ConnectorDefinition`:

```ts
stream?: {
  kind: "messages";                  // envelope discriminator; more kinds later
  pull(ctx: StreamPullCtx, cursor: string | null): Promise<{
    items: InboundMessage[];         // normalized envelope (legacy RawEmailMessage shape)
    nextCursor: string | null;
    hasMore: boolean;
  }>;
}
```

- `InboundMessage` envelope: from/to/cc, subject, `body_text` + `body_html`,
  attachments (metadata + `content_id`, content fetched on demand),
  `provider_message_id`, `provider_thread_id`, `received_at`.
- Exposed ONLY through the module consumption API (`client.pullStream`) —
  never as an agent tool; consent requires `autonomous_mode ≥ read_only`.
- Gmail first (`connections-google`): incremental via `history.list`
  (cursor = historyId), backfill via `messages.list` with date window;
  message parsing already exists in the connector (ported for `get_thread`).
  Outlook later: identical interface over Graph delta queries.

**Acceptance:** two consecutive pulls return no duplicates; cursor survives
token refresh; pull on `autonomous_mode: off` is denied.

Effort: ~1–1.5 days (Gmail).

---

## Sequencing

```
A (storage)  ──►  C (consumption API)  ──►  D (stream, Gmail)
      B (addressing) — independent, any time before agent write-flows
```

A before C/D so "N connections per connector" semantics are settled first.
B is only a hard prerequisite for agent flows that WRITE via a specific
account (e.g. reply-from-inbox) — sync/read never needs it.

Total: ~3–4 focused days. Branch off `feat/connections`.

## Out of scope (tracked follow-ups)

- Per-(operation, connection) approval grants (chat pre-gate change)
- Automatic task re-dispatch on approval decision
- MCP connector kind
- Delegated-principal personal-connection resolution
- Provider push (Gmail watch / Graph subscriptions) — plan 2, phase 6
