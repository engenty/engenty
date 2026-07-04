# External Connections Framework

Status: WIP (feat/connections). One central mechanism for external service
connections (Gmail, Drive, Calendar, Outlook, OneDrive, Slack, …), extensible
via connector modules, with a three-axis permission model enforced at the
existing operation gate.

## Architecture

```
packages/connections-sdk        @engenty/connections-sdk — shared types + runtime
  types.ts                      ConnectorDefinition / ConnectorAction / groups
  registry.ts                   process-wide connector definition registry
  token-crypto.ts               AES-256-GCM (CONNECTIONS_TOKEN_ENC_KEY)
  oauth2.ts                     generic OAuth2 (auth URL, code exchange, refresh)
  repo.ts                       module_connections DAL (supabase)
  policy.ts                     allow|ask|deny resolution (action × sharing × principal)
  runtime.ts                    wraps actions → PluginServerOperations

modules/connections             framework module (owns schema, routes, mgmt ops, UI)
modules/connections-google      connectors: google-gmail, google-drive, google-calendar
modules/connections-microsoft   connectors: microsoft-outlook, microsoft-onedrive
modules/connections-slack       connector: slack
```

Connector modules call `defineConnector()` + `registerConnectorModule(engenty, def)`:
this registers one module operation per action (provenance stays with the
connector module) and adds the definition to the shared registry that the
connections module reads for OAuth routes and the UI.

Tokens live ONLY in the app plane (`module_connections.connections`,
AES-256-GCM). Connector actions execute host-side in core; agents (chat, task
jobs, Code Mode `external_*` stubs) never see credentials.

## Permission model — three axes

1. **Action policy** (`allow | ask | deny`) per action, defaulted by action
   group. Groups and static contract mapping:
   - `read`    → idempotent, riskLevel low, no approval  ⇒ readOnly (Code Mode OK)
   - `write`   → riskLevel medium, requiresApproval=true
   - `destructive` (send/delete/trash) → riskLevel high, requiresApproval=true
   Per-connection overrides stored as `connection_action_policies`
   (selector = action id or `group:<name>`). Enforcement:
   - core: connections profile policy (registerProfilePolicy) — deny → 403,
     ask → require_approval (202 backstop), allow → explicit allow (bypasses
     static requiresApproval).
   - AI pre-gate UX: connection-level `allow` grants for statically-gated ops
     are merged into the run context approvalGrants at run start, so chat does
     not suspend for actions the user has durably allowed.
2. **Sharing**: `personal` (owner only) or `org` (tenant-wide). Org connections
   support a non-owner overlay `non_owner_max_group` (e.g. non-owners capped at
   `read`). Group-sharing is deferred until the auth model has groups; the
   schema uses a selector-shaped column to stay forward-compatible.
3. **Run context**: per connection `autonomous_mode: off | read_only | full`.
   Autonomous principals (`principalType` agent/service without a live user
   session) hitting `ask`: the profile policy denies with reason
   `approval_pending`, records an `approval_request`, and notifies the
   connection owner (org: tenant admins) via the notifications inbox. Approving
   writes a durable connection grant so the task's retry/re-dispatch passes.
   Live chat keeps native tool-level suspend/resume; invoker approves.

   Implementation notes (landed):
   - Task jobs run with the new `approvalPolicy: "defer"` — the AI pre-gate
     passes gated calls to core; core's 202 comes back as a structured
     `approval_pending` tool result and pings the tenant inbox
     (`connection_approval_requested`).
   - Chat/resume runs merge `connections_granted_operations` into the run's
     approval grants, so durable "always allow" suppresses the Approve card.
   - FOLLOW-UP: automatic task re-dispatch when an approval is granted
     (`connections.approval.decided` event → tasks module re-enqueue). Today
     the approved retry happens on the next trigger firing or a manual
     "run now"; request rows carry `task_id` for the future wiring.

## OAuth

Generic routes owned by the connections module:
- `GET /api/connections/:connectorId/connect` (auth) → `{ authUrl }`; nonce
  state stored server-side in `pending_oauth_flows` (10 min TTL).
- `GET /api/connections/oauth/callback` (public) → validates nonce, exchanges
  code, encrypts tokens, upserts connection, redirects back to the UI.

Scopes are requested incrementally: the union of provider scopes for the
connection's enabled action groups (Google: `include_granted_scopes=true`).
Enabling a group whose scopes are missing flags the connection as
`needs_reconnect` in the UI.

## Env

- `CONNECTIONS_TOKEN_ENC_KEY` — 32-byte base64 (same contract as legacy inbox key)
- `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET`
- `MICROSOFT_OAUTH_CLIENT_ID` / `MICROSOFT_OAUTH_CLIENT_SECRET` (tenant `common`)
- `SLACK_OAUTH_CLIENT_ID` / `SLACK_OAUTH_CLIENT_SECRET`
- `ENGENTY_PUBLIC_URL` (callback base; falls back to dev service URL resolution)

## Schema (module_connections)

- `connections` — tenant_id, connector_id, owner_user_id, sharing, autonomous_mode,
  non_owner_max_group, auth_kind, access_token_enc, refresh_token_enc,
  token_expires_at, granted_scopes[], external_account, status, error_message.
- `connection_action_policies` — (connection_id, selector) → allow|ask|deny.
- `pending_oauth_flows` — nonce, tenant, user, connector, requested_scopes, expires_at.
- `approval_requests` — connection_id, action_id, requested_by, task_id?,
  input_summary, status pending|approved|denied|expired, decided_by/at.

## MCP connectors (phase 2 of this branch, design-ready)

`ConnectorDefinition.kind: "native" | "mcp"`. For `mcp`, the connections module
hosts the MCP client session app-plane-side and projects discovered tools as
actions (readOnlyHint → group read, else write; default policy `ask`). Tool
naming stays stable under `mcp_<connector>_<tool>` with an alias map so public
skills' `allowed-tools` match.
