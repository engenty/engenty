# `/company` and `/space/public` — plan

Status: implemented (2026-09-25), except Phase 3. Replaces the tenant-wide read-write `/shared`.

## Problem

Every run and every Space computer mounts `/shared` read-write
(`workspace-presets.ts:149,166,181`, `access:"rw", scope:"tenant"`). A file one
Space writes there is readable and writable from every other Space, so a
private Space leaks through it. `spaceConfined` would drop the mount, but
nothing sets it.

What a company actually wants is the file-server shape:

| File server | Engenty |
|---|---|
| `\\corp\Company`, `/srv/company` — read by all, written by few | `/company` |
| the team's folder / team site | `/space` (unchanged) |
| `Marketing\Public`, macOS `~/Public` — the team's folder others may read | `/space/public` |
| `\\corp\Departments\*\Public` | `/company/spaces/<key>/` |
| `/home/<user>` | `/home` (unchanged) |

## Folder structure

### What a run sees

```
/space/                    this Space's commons            rw (Space members + agents)
/space/public/             what this Space publishes       rw people · agents with approval
/company/                  the company                     ro, every run, every Space
  files/                   company drive (today's /shared) publish with approval
  spaces/<key>/            every Space's public/           ro mirror
/home  /skills  /data  /sandbox  …                         unchanged
```

- `<key>` is the Space's `key` (`core.spaces.key`), readable by agents; a
  renamed key moves the folder.
- A Space sees its own public folder at `/space/public` and, when it
  publishes, also under `/company/spaces/<key>/` (read-only).
- Phase 3 (not built) adds `/company/apps/<slug>/` (read-only `src/` of Apps owned by
  other Spaces). `/skills` and `/data` stay where they are: `/skills` is
  filtered per Space and bot, `/data` already routes writes through
  operations.

### Where the bytes live

| Folder | Object key (bucket `files`) | Host staging |
|---|---|---|
| `/company/files` | `tenants/<t>/ai/workspace/commons/` — **today's `/shared` key, no data move** | `<root>/tenants/<t>/company/files` |
| `/space` | `tenants/<t>/spaces/<s>/ai/workspace/commons/` (unchanged) | unchanged |
| `/space/public` | `tenants/<t>/spaces/<s>/ai/workspace/commons/public/` — the `public/` folder inside the Space commons, not its own prefix: Mastra refuses nested mounts | inside the `/space` staging folder |
| `/company/spaces/<key>` | mirror of every publishing Space's `public/` folder, the viewer's own Space included | `<root>/tenants/<t>/company/spaces/<key>` |

## Access control model

Four layers, each enforced on its own — a gap in one does not open the next.

| # | Layer | Rule | Enforced by |
|---|---|---|---|
| 1 | Tenant | Nothing crosses tenants | server lane RLS + `tenants/<t>/` prefix (unchanged) |
| 2 | Mount | `/company` is read-only for every run | file tools: `readOnly` spec · shell: Docker bind `:ro` (**new** — today no bind is `:ro`; read-only mounts are simply not bound) |
| 3 | Publish | Writing company-visible bytes is an act of publishing | `/company/files`: only through `company_files_publish` or the UI · `/space/public`: `:ro` in the shell, writable by file tools behind an approval gate |
| 4 | Visibility | Who may publish, and which Spaces show up | permission `core.company_files.manage` · Space setting "Publish to company" |

### Who may do what

| Actor | `/space` | `/space/public` | `/company/files` | `/company/spaces/*` |
|---|---|---|---|---|
| Space member (person) | rw | rw (UI) | read | read |
| Holder of `core.company_files.manage` (admins by default) | — | — | rw (UI), approves agent publishes | read |
| Agent in the Space — file tools | rw | write **with approval** by the person in the run (chat card), or an approval grant headless | propose → approval by a permission holder | read |
| Agent in the Space — shell | rw | read | read | read |
| Space owner | as member | toggles publishing | read | read |
| Other tenant | — | — | — | — |

Why agents need approval for `/space/public`: it is the one door from a
private Space to the whole company. A shell write cannot be paused for
approval, so the shell sees it read-only (nested `:ro` bind over the `rw`
`/space` bind) and writes go through file tools, where the existing approval
machinery applies (`workspacePublishApprovalGate` in
`workspace-tool-guards.ts`, beside `workspaceDeleteApprovalGate`).

### Visibility rules

- Every Space has `public/`. A Space's folder appears under
  `/company/spaces/` only when it publishes (`core.spaces.publish_to_company`;
  Space settings → "Share the public folder with the company"). NULL means the
  default by visibility: on for open team Spaces, **off for private and
  personal Spaces**.
- Turning it off removes the Space's folder from every mirror on the next run.
- `spaceConfined` is deleted: `/company` is read-only, so reading it cannot
  leak, and a Space that publishes nothing exposes nothing.

## Build plan

### Phase 1 — `/company/files` read-only (closes the leak)

1. `workspace-presets.ts`: replace `/shared` with `/company/files`,
   `access:"ro"`, same `commons` tenant prefix; delete `spaceConfined` /
   `applySpaceConfinement`.
2. Docker provider: honour `readOnly` on a layout as a `:ro` bind; bind
   `/company/files` read-only (it is `ro`, so today's rule would not bind it at
   all).
3. Core operations `company_files_publish { path, content, encoding? }` and
   `company_files_remove { path }`. A person needs `core.company_files.manage`;
   an agent's call always parks on an approval only a holder can decide
   (`PluginOperationMeta.approverCapability`, enforced in policy — also in
   `pass-all` — and by the decision route, 403
   `approvals.approverCapabilityMissing`). Credential-looking files are
   refused.
4. Core: register `core.company_files.manage`; admins hold it via `*`,
   custom roles can grant it. File-storage byte routes check the key is in the
   caller's tenant and refuse company-drive writes without the capability.
5. Instructions, `workspace-mount-note.ts`, docs listed below: `/shared` →
   `/company`.

### Phase 2 — `/space/public` and `/company/spaces/<key>`

1. `/space/public` is the `public/` folder of the `/space` mount; nested `:ro`
   bind in the Space computer; file-tool writes gated by approval (the person
   in the run, or an approval grant headless).
2. `core.spaces.publish_to_company boolean`, NULL = default from visibility;
   Space settings toggle.
3. Mirror builder (`apps/ai/src/ai/sandbox/company-mirror.ts`, at run start):
   lists publishing Spaces of the tenant, pulls the drive and each `public/`
   folder into `<root>/tenants/<t>/company/`, **deletes what is gone** —
   unpublished files and the folders of Spaces that stopped publishing (a
   mirror that keeps them is a leak). Bound `:ro` once as the parent folder,
   so new Spaces appear without a Reset. The sandbox sync now also propagates
   deletions: a file pulled at run start and missing at push is deleted in
   storage (`sandbox-sync.ts`).
4. UI: a `/company` page ("Company files") lists the drive (upload/delete
   with `core.company_files.manage`) and every publishing Space's `public/`
   (upload/delete for people who can enter that Space); linked from the Space
   settings toggle.

### Phase 3 — `/company/apps/<slug>` (not built)

Read-only `src/` of every active App whose `module_apps.apps.space_id` is
another Space; the owning Space keeps `/sandbox/apps/<slug>` read-write
(unchanged). Needs no schema change.

## Tests

One E2E in `e2e/smoke/`, plus one isolated test for the mirror. Failure modes
first:

- a shell write to `/company/files` or `/space/public` succeeds (expect EROFS);
- an agent file-tool write to `/space/public` lands without approval;
- Space B does not see a file Space A published, or sees one A unpublished
  (mirror does not delete);
- a private Space's `public/` shows up while publishing is off;
- another tenant's run sees anything under `/company`.

## Upgrade

- Existing Space computers need a Reset to get the new binds (same as the
  egress key).
- No byte migration: `/company/files` reads today's `/shared` prefix.

## Docs to update

`docs/agent/spaces-runtime.md`, `docs/agent/who-drives.md`,
`docs/content/dev/agent-computers.md`, `docs/content/dev/work-model.md`,
`packages/ai-core/docs/howto-workspaces.md`,
`modules/engenty-copilot/dev/copilot-personal-workspace.md`,
`modules/engenty-specialists/ai/instructions/SPECIALIST.md`,
`apps/ai/ai/skills/sandbox-code-execution/SKILL.md`, and the `/shared`
strings in `apps/ai` (engenty.cli instructions, `workspace-mount-note.ts`,
`sandbox-types.ts`).

## Open decisions

- Default for "Publish to company" on open Spaces (proposed: on).
- Whether a person's personal Space may publish at all (proposed: yes, off by
  default — macOS `~/Public`).
