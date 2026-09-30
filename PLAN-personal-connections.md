# PLAN — Personal connections, no personal Space

Decided 2026-09-29 (Matthias). Supersedes the Copilot and personal-Space parts
of [PLAN-space-owned-connections.md](./PLAN-space-owned-connections.md); the
Space-owned part stays.

**Status:** phases 1–4 implemented 2026-09-29 (branch
`claude/confident-sutherland-14d4a3`). Phase 4 needed nothing: the redesigned
wizard on `main` already has no personal Space. Open questions below still
stand; the answers taken are marked.

## Why

The Copilot's reach depended on the URL. At `/copilot` or `/s/me` it ran in the
personal Space, which mounts only the baseline apps, so "check my mail, create
a task in Projects, log the time" was refused. The rule changed three times on
2026-09-23/24 (`c0423108a`, `16543ea20`, `6de9a14f1`) and nobody could say where
the Copilot "lives".

The personal Space also existed only as the Copilot's connection holder, and
the database created one silently for every person who joined a team.

## Model

| | Personal connection | Space connection |
|---|---|---|
| Owner | A person (`owner_user_id`) | A Space (`space_id`) |
| Used by | That person's Copilot, in any Space | The Space's members and engenties; a member's Copilot while in that Space |
| Data | Live tool reads only — the result stays in the chat, nothing is synced or stored | May be synced (inbox, calendar, retrieval) |
| Unattended work | Never | Yes, through the Space's engenties and routines |

- **Copilot reach** = the person's personal connections + the connections and
  apps of the Space it runs in.
- **Engenties** never see a personal connection.
- **No private data in shared Spaces.** The Copilot reads a personal mailbox
  and writes its own output (an offer, a task) into a Space. Nobody else sees
  the mail.
- **Private work** is an ordinary Space with one member. A person may have
  several. No special personal Space; a "home" (`/me`) may come later.
- Storing data from personal accounts (a personal inbox, personal files) needs
  a reworked inbox or files module — postponed.

## Phases

One plan, in order. Fresh start by the no-production-data rule: personal Spaces
and everything in them are deleted, personal accounts are reconnected.

### 1. Connections owned by a Space or a person

- Migration (`modules/connections`): `space_id` nullable, add `owner_user_id`
  (FK `core.users`, cascade), check `num_nonnulls(space_id, owner_user_id) = 1`.
  Unique index per owner:
  `(tenant_id, owner_user_id, connector_id, external_account)` beside the Space
  one. Same for `pending_oauth_flows`. `connected_by` stays (audit).
- RLS `connections_read`: Space members as today, OR
  `owner_user_id = core.current_user_id()`.
- Connect flows (OAuth, API key, local files) take `for: "me" | "space"`;
  "me" stamps `owner_user_id`, never a Space.
- Approvals (`modules/connections/src/lib/space-access.ts`, connections
  policy, execute): a personal connection's `ask` actions are decided by its
  owner; Space connections unchanged (Space owners + admins).
- Sync consumers only take Space connections: inbox sync
  (`modules/inbox/src/sync/sync-service.ts`), calendar sync
  (`modules/time-tracking/src/sync/calendar-sync-service.ts`), files sources,
  Slack bridge, retrieval indexing. Each selects by `space_id`; verify, and
  refuse a personal connection explicitly.
- Connect UI: "Connect for me" / "Connect for this Space"; the personal list
  shows on the person's own settings (`/settings/connections`), not in a Space.

### 2. Copilot run without `/s/me`

- `resolveRunSpace` (`apps/ai/src/ai/sessions/run-space.ts`): drop
  `resolvePersonalSpaceId` and `resourceSpaceId`. The Copilot's Space is the
  route context, else none (`global`, the existing tenant-wide kind).
- Connector reach: a run of `engenty.copilot` adds the acting person's personal
  connections to the run Space's `connectorPrefixes`. Every other agent gets
  the Space's only. Core needs one read: the caller's personal connections.
- `callSpaceIdFor` (`apps/ai/ai/tools/engenty-tools/lib/space-gate.ts`): a
  personal connection call names no Space; core authorizes it by owner.
- SDK reach (`packages/connections-sdk/src/space-mounts.ts`):
  `account.space_id === run Space` OR (`account.owner_user_id === acting
  person` AND the agent is the Copilot).
- Sandbox routes (`apps/ai/src/api/sandbox-routes.ts`): no `space_id` means no
  computer — no fallback to a personal Space.
- Tests (isolated, list the failures first): an engenty never reaches a
  personal connection; another person's Copilot never does; the Copilot keeps
  it inside any Space and outside all Spaces.

### 3. Remove the personal Space

Everything that exists only because every person had one.

- **Database** (`apps/core`):
  - `core.ensure_personal_space` → keeps only "add the new person to the
    default Space"; rename to match.
  - Drop `core.personal_space_key`, `core.forbid_personal_space_member`,
    `spaces.owner_user_id`, and delete existing personal Spaces.
  - Rewrite the policies that read `spaces.owner_user_id`: connections,
    inbox (`20260923221100`), retrieval visibility (`20260923221000`),
    notifications/MCP (`20260919230000`) — access becomes membership only.
- **Core DAL/routes**: `space-membership.ts` (owner access,
  `claimOrphanedSpace`), `spaces.ts` (`space_is_personal`, open-space check),
  `spaces-routes.ts` (owner shortcut on settings access).
- **AI**: `task-job-specialist-step.ts`, chat and artifact retrieval sources
  (personal visibility).
- **UI**: `/s/me` route and `PersonalSpaceRedirect`; `DefaultPlaceRedirect`
  (last visited, then the default Space); rail pinning
  (`packages/app-shell/src/lib/rail-spaces.ts` `isPersonal`); Space home and
  members (`SpaceHomeAudience`, `SpaceHomeTopbarActions`,
  `SpaceMembersSection`, `space-audience.ts`, `use-space-people.ts`);
  `SpaceSettingsPage`; connections UI (`connection-space.ts`
  `findPersonalSpace`, `use-connection-space.ts`).
- Sweep: `rg "owner_user_id|ownerUserId|isPersonal|/s/me|personal_space"`
  must come back with connections' `owner_user_id` only.
- Docs: `docs/agent/spaces-runtime.md` ("Personal"),
  `docs/content/dev/work-model.md` if it names the personal Space,
  `PLAN-space-owned-connections.md` (mark superseded parts).

### 4. Setup wizard

Coordinate with the parallel wizard work (`packages/auth-ui`):

- No personal Space: drop `readPersonalSpace` / `namePersonalSpace` from the
  setup API and the personal card from the spaces screen.
- The first Space is the one real Space the wizard creates.

## Open questions

| Question | Recommendation | Implemented |
|---|---|---|
| Outside any Space (`/copilot`), what may the Copilot write? `global` is tenant-wide today — verify what it allows for Space-scoped records | Writes name a target Space: the one Space where the app is mounted, else ask | Open — unchanged `global` behaviour |
| Computer and browser outside any Space | None; the Copilot says to open a Space | Yes |
| A private Space whose only member leaves the team | Same rule as a shared Space whose last owner leaves; replaces `claimOrphanedSpace` | Kept the superadmin claim, now for any private Space with no member left (admins cannot enter private Spaces) |
| A write the Copilot makes into a shared Space | That Space's approval rules, like any write there | Unchanged — already the case |
| Who configures a private one-member Space (setup, hiring)? The personal-owner exception is gone | — | Tenant admins only, like every Space |
