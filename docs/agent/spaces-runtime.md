# Spaces runtime contract

This is the canonical architecture reference for tenant, Space, catalog, and
execution-evidence semantics in agent runs. The model-facing wording lives in
`packages/ai-core/src/agent-ui/space-contract-prompt.ts` and is injected by
`apps/ai/src/ai/sessions/runtime-instructions.ts`. Module prompts and skills
should rely on that injected contract instead of copying it.

## Boundaries

- **Tenant** is the organization/account and authorization boundary. Tenant
  isolation remains the database and RLS boundary.
- **Active Space** is the run/thread work boundary. It selects which apps,
  agents, connections, skills, and module data are available. It does not drive,
  schedule, or queue work.
- Runtime `current_space` and `space_mounted_modules` describe the authoritative
  surface for the current run.
- A run with no Space by design may be tenant-global. A run that claims a Space
  but cannot resolve it must not widen to tenant-global module work.

An app may exist in the tenant without being mounted in the active Space.
Unmounted therefore means “not part of this Space,” not “missing from Engenty.”
A read-only mount allows reads and refuses writes. Agents must treat unmounted
and read-only refusals as final rather than retrying around the boundary.

## Record scopes

- **Space-owned:** projects and their tasks/phases, tasks/routines,
  Knowledge Bases, and Space files. New records default to the active Space;
  direct record operations must stay inside it.
- **Tenant-shared:** contacts, offers, invoices, company profile, team
  directory, PDF templates, commercial settings, Apps, and currently team chat.
  A Space mount grants access to the tenant library; it does not create a
  `space_id` on those records.
- **Account-scoped (Space-owned accounts):** connector accounts, and the
  records kept against them — inbox mail, calendar sync, connected drives in
  Files, retrieval documents from those sources. A connection belongs to one
  Space (`module_connections.connections.space_id`); `connected_by` records
  who signed in and grants nothing. Every member and agent of that Space uses
  the account; nobody outside it does. There is no per-person ownership, no
  "every space" flag and no per-agent grant. A connector is offered in a Space
  when its plugin is enabled there (`core.space_mount.resource_type =
  'plugin'`, key = connector id); an agent's `connector_ids` only narrows what
  the Space offers. A run that names no Space reaches no account.

  The Space a call names (`x-engenty-space-id`) is a claim, checked by
  `mayUseSpaceInRun` (`packages/connections-sdk/src/space-mounts.ts`): a
  person must be able to enter the Space; an agent or service principal may
  use an open Space, or the Space of its own routine or task. `ask` actions
  on a Space's account are decided by that Space's owners (personal Space
  owner, or a `space_member` with role `owner`) or a tenant admin
  (`core.users.manage`) — the approval context carries `space_id`.
- **Personal:** personal memory/home data. The **personal Space** (`/s/me`:
  private, owner-only, no members) holds the copilot's connections wherever it
  is opened (`RunSpace.resourceSpaceId`). Everything else — its computer and
  browser, apps, hiring, routines, the agent roster — is the Space the person
  stands in (route context), or `/s/me` outside any Space (`resolveRunSpace`).
  Connector and connections calls name the resource Space to core
  (`callSpaceIdFor`).
- **Platform:** operations that are intentionally outside tenant record data.

Mount availability and record scope are separate decisions: mounting determines
whether an app is callable from a Space, while record scope determines which
rows an allowed operation may access.

## Workspace, Data, and deliverables

A **Workspace** is the run's file/context view. It is not the Space, a work
queue, or a module database. Agents use only the named mounts resolved for that
run:

- `/home` is user-personal for the assistant preset and agent-personal for
  staff. On a Space computer it is reachable with file tools only, never from
  the shell — the container is shared by the Space's agents.
- Every run receives `/space` (the Space commons, rw). Its `public/` folder
  (`/space/public`) is what the Space publishes to the company: file-tool
  writes there ask for approval, and the Space computer's shell sees it
  read-only.
- Every run receives `/company` read-only: `/company/files` is the company
  drive (the tenant commons), and `/company/spaces/<key>/` shows the `public/`
  folder of every Space that publishes to the company (`<key>` is the Space
  key), and `/company/apps/<slug>/` the source (`src/`) of every App those
  Spaces own — changed only from the owning Space's `/sandbox/apps`. Agents write the company drive only through `company_files_publish` /
  `company_files_remove`, which park on an approval that a holder of
  `core.company_files.manage` decides.
- `/task` exists only when the run has a task as its subject. `/project` exists
  only when that task's containment chain resolves that record.
- `/skills` is the read-only skill library filtered to what the run may load.
- Code-execution runs may additionally receive `/sandbox`; they do not gain
  `/home` merely because a sandbox exists.

`/data` is separate from those file contexts. It projects records from modules
mounted in the active Space and routes reads/writes through each module's real
operations. It is never scratch space, a notebook, or a place to invent an
assignment folder.

**Files** is the durable file store and **artifacts** are reviewable deliverables
attached to a chat, task, project, or Space. Working files may be copied or
published to those surfaces, but a workspace path alone is not a delivered
result.

## Catalog contracts are not data

`engenty_tools_modules`, `engenty_tools_search`, and
`engenty_tools_discover` describe available operation contracts. Their results
do not prove that an app contains records and cannot support claims about record
names, IDs, counts, amounts, statuses, email addresses, or URLs.

Record facts require evidence from the matching `engenty_tool_execute` result:

1. The operation completed with `ok: true`.
2. The result contains readable `data`.
3. Every reported fact is supported by that data.

An error, a successful empty result, and a missing or unreadable result are
different outcomes and must be reported exactly. None permits guessed records.

## Navigation

Inside a Space, agents prefer canonical `/s/<space_key>/…` paths. These patterns
are conventions, not a route table. The `navigate` tool resolves the running
application's real routes; agents must not invent a route or claim navigation
succeeded without the tool's returned destination.

## Runtime coverage

The contract is added once by `buildSessionRuntimeInstructions`, the shared
builder used by root start, resume, and native session lanes. Dynamic Space
facts remain in runtime context, while the canonical policy text remains in
`@engenty/ai-core`.

Every execution lane must ultimately apply the same resolved Space and operation
policy: text, voice, delegated children, headless runs, workflow graphs, code
mode, direct module tools, and the `/data` module-record projection. Prompt
wording explains the boundary but does not replace runtime authorization and
pre-dispatch enforcement.

## Authoring and CI

When adding module operations, agents, or skills:

- Declare `spacePolicy` on every Space-placed operation (including synthesized
  search). Choose `space_owned`, `tenant_shared`, `account_mounted`,
  `user_owned`, or `platform` — mounting is availability, policy is row scope.
- Direct tools use `ToolExecutionContext.spaceId` and `spaceConfined` (do not
  invent another field). Catalog tools must not describe their output as data.
- Preferred skills are module-owned; other skills appear through Space mounts.
- Prefer `/s/<space_key>/…` and let `navigate` resolve routes.
- Optional `record_scope` frontmatter on `AGENTS.md` / `SKILL.md` must match
  declared policy when present.

How-tos: [define module AI](../../packages/ai-core/docs/howto-define-module-ai.md),
[build tools](../../packages/ai-core/docs/howto-build-tools.md),
[frontend tools](../../packages/ag-ui-bridge/docs/frontend-tools.md),
[workspaces](../../packages/ai-core/docs/howto-workspaces.md).
The container half of a run — per-run sandboxes, the Space computer, the Space
browser, what each can reach — is
[Agent computers](../content/dev/agent-computers.md).
`pnpm ai:check` fails OPEN authoring defects; Package 10 CLOSED modules may
still be in-flight.
