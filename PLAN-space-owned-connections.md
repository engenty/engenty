# PLAN — Space-owned connections, computer and browser

Decided 2026-09-23 (Matthias). Model: Grok Bot's, scoped to Spaces.

- A **Space** is the "account": every agent in it shares the Space's
  connections (Gmail, Slack, …), its computer (files, installed tools) and its
  browser logins.
- Each **agent** gets only its own screen: its own browser window (tab /
  context) inside the Space browser.
- The **Copilot**'s connections, computer and browser are always the person's
  personal Space's (`/s/me`), wherever it is opened. Its run stands in the Space
  the person stands in: apps, hiring, routines and the agent roster are that
  Space's (decided 2026-09-24) — location and resources are separate.

## Decisions

| Question | Decision |
|---|---|
| Existing connections | Fresh start: drop them, reconnect per Space (no prod data) |
| Who approves an `ask` action on a Space connection | Space owner + Space admins (personal Space: its owner) |
| Copilot inside a team Space | Always `/s/me` for connections, computer, browser |
| Browser layer | Same round |

## State before (2026-09-23)

| Layer | Before | After |
|---|---|---|
| Computer | One per Space (`engenty-space-<tenant>-<space>`) | unchanged |
| Connections | Owned by the signer (`owner_user_id`); reach = space mount ∪ `all_spaces` ∪ `connection_agent_grants` | Owned by a Space (`space_id`); reach = the run's Space |
| Approver | `owner_user_id` only | Space owner + admins |
| Browser | One per person (`engenty-browser-<tenant>-<user>`), one seat | One per Space; one window per agent |
| Copilot | Space from the URL; `null` (global) outside `/s/` | `/s/me` for resources; URL Space for the run (apps, hiring, routines) |

## Phases

1. **Service credential** — done (`0b18e25e8`): `AI_SERVICE_CAPABILITIES`
   adds `module.connections.*` + `core.agents.manage`; ensure-local replaces a
   stale row.
2. **Copilot resource Space** — done (`c0423108a`): runs of `engenty.copilot` resolve connections,
   computer and browser against the caller's personal Space; the turn keeps
   its URL location. 2026-09-24: the run's Space is the URL Space again
   (a copilot hire landed in `/s/me` while the person stood in a team Space);
   `/s/me` is carried as `resourceSpaceId`.
3. **Space-owned connections** — implemented (uncommitted on
   `claude/specialist-agent-approvals-51b819`)
   - Migration (fresh start): delete connections; add `space_id` (FK
     `core.spaces`, cascade); `owner_user_id` → `connected_by` (audit only,
     `on delete set null`); drop `sharing`, `non_owner_max_group`,
     `all_spaces`, `connection_agent_grants`; unique
     `(tenant_id, connector_id, space_id, external_account_id)`; RLS by Space
     membership. `space_mount` rows with `resource_type='connection'` go away
     (plugin mounts stay: "this plugin is enabled in this Space").
   - OAuth / API-key / local-files connect requires a Space (the active one;
     `/s/me` when none) and stamps it.
   - SDK reach: `account.space_id === run space`. Delete agent grants,
     all-spaces union, owner stand-in.
   - Approvals: approver = Space owner/admins (connections policy, execute,
     core `module-operation-approvals`).
   - Consumers: inbox, calendar sync (time-tracking), files sources, Slack
     bridge, browser-bridge, retrieval visibility — owner-based visibility
     becomes Space-based.
   - UI: remove "Alle Spaces", "Auf diesem Agenten nutzen", agent grant
     dialog; connect happens inside a Space.
   - Agent `connector_ids` stays as an optional narrowing of what the Space
     offers (not ownership).
4. **Space browser** — implemented (same branch; consent in
   `core.space_browser_grants`, `/api/spaces/:id/browser-grant`)
   - Browser container + profile per Space (`profile/<space>/`); personal
     Space browser = the person's browser today.
   - One tab/context per agent; the seat is per agent, not per browser.
   - Downloads per Space (today tenant-wide).
   - Consent (`core.user_browser_grants`) → Space-level; limits per Space.

## Docs to rewrite with the code

Done with phases 3–4 (plus `docs/internal/time-tracking-calendar-sync.md`,
`docs/content/dev/notifications.md`, superseded notes on the `docs/wip/`
connections/inbox/retrieval designs).


`docs/agent/spaces-runtime.md` (Account/user-scoped section),
`docs/content/dev/connections.md`, `docs/content/dev/agent-computers.md`,
`docs/content/user/agent-operations/connections.md`.
