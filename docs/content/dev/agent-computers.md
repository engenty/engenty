---
title: Agent computers
description: The Docker containers behind an agent run — per-run sandboxes, the space computer, the space browser — and what each one can reach.
---

# Agent computers

An agent's model loop runs **host-side in `apps/ai`**. A container is a pair of
hands: it executes commands and holds bytes. Almost nothing an agent knows about
Engenty arrives through the container — app records, tools and connections travel
the host-side operation pipeline described in the
Spaces runtime contract (`docs/agent/spaces-runtime.md`).

This page is the container half: which containers exist, what is mounted in
them, what they can reach, and how a program inside one still calls Engenty
tools.

## The container classes

| Class | Id | One per | Ends when |
| --- | --- | --- | --- |
| Run sandbox | `engenty-run-<runId>` | run | the run ends (destroyed) |
| Session sandbox | `engenty-session-<threadId>-<agentId>` | conversation × agent | session teardown |
| Task sandbox | `engenty-task-<tenant>-<space\|"tenant">-<taskIdentifier>` | task checkout | task teardown |
| Space computer | `engenty-space-<tenant>-<space>` | Space | never — stopped when idle, removed only on Reset or Space deletion |
| Space browser | `engenty-browser-<tenant>-<space>` | Space | stopped when idle; removed on Reset |

Ids are parsed by `apps/ai/src/ai/sandbox/parse-engenty-sandbox-id.ts`;
every container carries Mastra's `mastra.sandbox.id` label, which is how the
Computers view, the sweeps and Reset find them.

The id is the **scope key**, never the raw run id on a session sandbox — that is
what makes a session container one container across a suspend → approve →
resume round-trip, since resume arrives with a fresh run id. A task identifier is
unique per tenant and Space rather than globally, which is why only that key
carries both prefixes (`"tenant"` when the run has no Space).

Docker is the **only** execution provider. `ENGENTY_SANDBOX_PROVIDER` accepts
`docker` and fails loudly on anything else — there is no host-execution fallback,
by doctrine, so a misconfigured sandbox can never run model-generated code on the
AI host.

## Which one a run gets

An agent declares `run`, `session` or `task` in `workspace.sandbox.lifecycle`.
The run-time resolver adds the fourth:

```
declared "run" + a resolved Space  →  space   (the Space's shared computer)
everything else                    →  the declaration stands
```

`resolveRunSandboxLifecycle` in
`apps/ai/src/ai/sessions/agent-workspace-hook.ts`.
`task` and `session` keep their own containers because each is a continuity
mechanism of its own; a run with no resolved Space falls back to a per-run lease.
No built-in agent declares `session` or `task` today: the Copilot and its CLI
sub-agent (`engenty.cli`) declare `run`, so both land on the computer of the
Space the person stands in — `/s/me` outside any Space.

The agent is told which one it landed on — every run with a sandbox, chat
included, gets a "Your computer" block (`apps/ai/src/ai/sessions/compute-instructions.ts`):
the container class, which mounts its commands reach and which are file tools
only (the same rule the binds use), where installs go and whether they stay,
the network tier, and that package caches are warm per Space.

## The space computer

One long-lived container per Space, shared by every run that targets it. Same
provider machinery as a run lease; what makes it a machine is what does *not*
happen:

- run teardown keeps the container;
- the idle sweep runs `docker stop` (image-layer state survives) after
  `ENGENTY_SPACE_COMPUTER_IDLE_STOP_MS`, default 30 min;
- the next command wakes it with `docker start`;
- `docker rm` happens only on **Reset** (a user action) or Space deletion.

So installed packages, dotfiles and files under `/sandbox` persist across runs.
A space computer also binds its drive home at `/opt/sandbox` (the image `HOME`),
so user-installed packages survive idle-stop the same way.

**A space computer binds only what is the same for every run in the Space.**
Docker fixes a container's binds when the first run creates it, so a per-run
source would be whoever came first. The agent's or person's `/home` is therefore
not bound on a space computer: it stays a direct storage mount, reachable with
file tools only (`buildSyncedWritableMounts` in `apps/ai/src/ai/workspace/loader.ts`).

**Commands are serialized per machine.** The machine is shared — concurrent runs
in the Space hold instances with the same sandbox id, resolving to one container
with one `/tmp` and one process table — so `executeCommand` is queued
process-wide, keyed by sandbox id. Queue depth is visible in the Computers view,
and a wait of 3 s or more is logged as `space_computer_queue_wait`. Background
processes (`processes.spawn`) stay unserialized; long-running servers are the
point.

### The Space drive

Everything the host keeps for a Space is one folder,
`$ENGENTY_SPACES_DIR/tenants/<tenant>/spaces/<space>/` — the **Space drive**.
It is a directory on the apps/ai host, not Supabase:

| Folder | Bound at | What it holds |
| --- | --- | --- |
| `home/` | `$HOME` (`/opt/sandbox`) | installs, dotfiles, CLI logins |
| `sandbox/` | `/sandbox` | the machine's scratch — every run and the machine see the same bytes |
| `cache/{npm,uv,bun}` | `/cache/*` | package caches, for every run in the Space |
| `browser/profile/` | the browser's `/profile` | cookies and logins |
| `browser/downloads/` | `/downloads`, `/sandbox/browser-downloads` | what the browser saved |
| `apps/` | `/sandbox/apps` | the Space's App repositories and databases (app-host) |
| `ai/…` | — | staged copies of the Space's object-storage mounts |

**Rule:** work lives in object storage (`/space`, `/shared`, `/home`, …) and
records in Postgres (`/data`). The drive holds the computer's own state and may
be lost — except `apps/`, which has no other copy (`deploy/scripts/backup-spaces.sh`).
So a space computer's `/sandbox` is **not** synced to storage: results worth
keeping go to `/space`. Reset removes the container and leaves the drive; the
reaper only ages out package caches and per-run staging, never a drive's
`home/` or `sandbox/`. On the same tick, `space-drives.ts` reconciles the
drives with `core.spaces`: once core has **purged** a Space (the row is gone —
a soft-deleted Space keeps it and stays restorable), its computer and browser
are removed and its folder deleted. A tenant whose lookup fails or shows no
Space is left alone. Every other drive is measured with `du` against
`ENGENTY_SPACE_DRIVE_MAX_BYTES` (default 20 GiB): over it, the Space's
`cache/` is cleared unless a container has it bound, and what is still over
shows as "over quota" on the Computers view, with each space computer's disk
use. `ENGENTY_SPACES_DIR` is the only host root — app-host
uses the same one, and it must be the same path inside the containers and on
the host (`/opt/engenty/spaces`; `~/.engenty/spaces` in development).

**What an installer leaves on the computer is offered to the Space, never used
directly.** The skills CLI (`npx skills add`) writes one canonical copy to
`~/.agents/skills` (`-g`) or `/sandbox/.agents/skills` (project scope, the
default) and links each target agent's own folder to it — `~/.claude/skills`,
`~/.config/opencode/skills`, `~/.gemini/antigravity/skills` and ~70 more. MCP
servers go to `~/.claude.json`, `~/.cursor/mcp.json` or
`~/.gemini/settings.json`. Nothing reads them there. Two hire-floor tools read
`$HOME` and `/sandbox` from the host. A skill is any `skills/<name>/SKILL.md`
up to five levels deep (caches and `node_modules` skipped), so no list of
agent folders is kept. Links are followed only while they resolve inside the
tree (`space-computer-home.ts`; on Linux the opened fd is checked against
`/proc/self/fd`), so a link planted in the container cannot make the host read
its own files:

| Tool | Offers | Who decides |
|------|--------|-------------|
| `computer_skills_find` | the skills, on the `skills_find` card (provider `computer`) | a person picks Add to Space / Prefer for this agent; the install route checks the caller can read that Space |
| `connector_import_request` | a remote (http/sse) MCP server as a connector; stdio ones are listed as not importable | the person approves the card; core's import route requires a tenant admin, otherwise the Space gets a `connector_import_requested` inbox row |

After an import, the connector's OAuth runs through `connections_request_connect`
in the person's browser — no browser on the computer is needed.

A CLI that signs in itself (`<cli> login` prints a URL and waits on
`127.0.0.1:<port>`) goes through `browser_sign_in`. The bot starts the login
with `background: true` and passes the URL; it opens in the bot's window of the
[space browser](#the-space-browser), the controls go to the person, and the run
parks on a Done / Decline card. The one navigation to that port is caught in
the window and replayed with `curl` inside the computer by `docker exec` from
apps/ai (`loopback-forward.ts`), so the browser never joins the computer's
network. The CLI's reply is shown as text, not rendered. A device-code login
passes `code` instead and needs no forward. The image sets `BROWSER` and an
`xdg-open` that print the URL, so a CLI that tries to open a browser keeps
waiting instead of failing. The login lands in the CLI's dotfile in `$HOME`,
shared by the Space's agents; the CLI's API host must be one of the Space's
allowed hosts (below).

## The space browser

One headless-Chromium container **per Space**
(`apps/ai/src/ai/sandbox/space-browser.ts`), driven over CDP by `apps/ai` for
every agent working in that Space. Logins and cookies are the Space's, shared
by its agents — like its connections. The copilot uses the browser of the
Space the person stands in, like its computer. A run with no
Space has no browser. A service, not an exec sandbox — nothing executes
commands in it.

- **One window per agent.** Each agent gets its own window in the Space's
  browser — its own `AgentBrowser` over CDP, opening a tab of its own on
  first use — so agents never fight over one page
  (`apps/ai/src/ai/browser/user-browser-registry.ts`, keyed
  `<sandboxId>#<agentId>`).
- It exists only when someone asked for it, and it **never joins a machine's
  network**: agents browse through host-side `browser_*` tools, never raw CDP
  from a sandbox.
- Continuity is the profile bind
  (the Space drive's `browser/profile/`) — cookies and logins survive
  stops, Resets and image upgrades, and belong to exactly one Space.
- Two networks: its own egress network (`ENGENTY_BROWSER_EGRESS_NETWORK`,
  default `bridge`; all traffic through the logged browser proxy when
  `ENGENTY_BROWSER_EGRESS_PROXY_URL` is set — open and logged, not the sandbox
  allowlist) and the view network it is attached to after start
  (`ENGENTY_BROWSER_VIEW_NETWORK`), where only `engenty-ai` lives. Without a
  view network, apps/ai dials the published loopback CDP port.
- Downloads land in `/downloads` in the browser
  (the Space drive's `browser/downloads/`) and appear to that Space's
  computer at `/sandbox/browser-downloads/` — the same bytes, not a copy. No
  other Space sees them.
- Idle stop after `ENGENTY_BROWSER_IDLE_STOP_MS` (15 min), with its own last-use
  stamp and sweep. Ceiling: `ENGENTY_BROWSER_MAX_PER_TENANT` (4). Over the
  ceiling, Start answers 429.

**Consent is part of the tool surface, and it is the Space's.** The
`browser_*` tools are attached only when the Space already has a browser or
has allowed agents to start one. Otherwise the run gets a single
`browser_start` tool that asks — keeping the rest of the schema out of every
other prompt. Two standing consents are separate: `autostart` (an agent may
create the browser) and `unattended` (an agent may drive it with nobody at the
keyboard). Both live per Space in `core.space_browser_grants`: every person
who can enter the Space reads them, only its owners (or a tenant admin) set
them (`GET`/`PUT /api/spaces/:id/browser-grant`). They ride the Space surface
the run fetches anyway. Every step is audited as `engenty.browser.action`,
with arguments recorded as shape, not payload.

**One seat per window, and the agent can pass it.** The seat belongs to the
agent's window, not the browser. A person and the agent never drive that
window at once: "Take over" in the browser pane gives the person the seat and
fails the agent's in-flight step; "Hand back" returns it. The agent can switch
the seat too: `browser_request_user` hands the page to the person and waits for
their answer (the pane opens with the controls already theirs, and the seat
comes back with the answer), `browser_hand_over` switches it without waiting —
`to: "person"` to let them browse, `to: "agent"` once they said they are done.
The desk opens the pane on the first `browser_*` call of a run.

**Experimental: the fast loop.** With `ENGENTY_BROWSER_FAST_LOOP=true`
(platform-configurable) the same toolset gains `browser_run_fast`. Jev is
reached through the Vercel AI Gateway (`typesafe-ai/jev`, on the gateway key
every install already has); a `TYPESAFE_API_KEY` switches to TypeSafe's own
API. The agent LLM hands it one page's worth of mechanical work
("set departure to 12 Oct, pick the first suggestion, click Search"); inside,
each step is one call to TypeSafe's Jev classifier with two questions: act on
an element, scroll, wait, done or blocked — and, speculatively in the same
call, which element. The element's kind names the operation (a field is typed
into, a dropdown value is selected, everything else is clicked), so the
classifier never splits its mass between "click the field" and "type into the
field". Model output never becomes a selector or script: every target
resolves to an element the page itself indexed and is re-checked for
freshness and occlusion right before input. The gate is a margin on the joint
probability P(act) × P(element), not absolute confidence: on a form with a
dozen look-alike fields the right one may hold 0.4 of the mass and still be
the unambiguous winner. A step whose pick does not lead the runner-up by
`ENGENTY_BROWSER_FAST_MIN_MARGIN` (0.1) gets one tiebreak question (this
step, that step, or neither); if that does not settle it either, the call
returns `uncertain` with the element table and a note naming both candidates,
and the agent does that one step with the normal `browser_*` tools and calls
`browser_run_fast` again. Field values come from the goal's own words first:
the classifier picks, per typeable field, which span of the goal (a date, a
name, a quoted string) is its value, or none; only a value that has to be
rewritten goes to the run's low-tier model (`model.low`, with minimal
reasoning effort). Both are asked once per page and goal, for every field at
once, as soon as a page with a field is observed — alongside the decision, not
after it. `ENGENTY_BROWSER_FAST_MAX_STEPS` (60) bounds one call. Every inner
step is audited as `engenty.browser.action` with its confidence, margin,
tiebreak, text source, latency and token usage under `fast_step`. Design and
measurements: `PLAN-browser-fast-loop.md`.

## The image

`engenty-sandbox:latest`, built from `deploy/Dockerfile.sandbox` — one unified
runtime rather than a per-language image split:

| Prebaked | Why |
| --- | --- |
| `node` + `npm`/`npx` | the runtime a model assumes by default |
| `bun` | TypeScript with no build step; Code Mode's runner |
| `python3` + `uv` | from the base image, plus a fast installer |
| `jq`, `git`, `curl` | what a model writes when post-processing JSON |
| `zod` (both resolvers), `httpx`, `requests` | universal libs, so the common case needs no install |

It runs as uid 1000 (`ENGENTY_SANDBOX_UID`) with `HOME=/opt/sandbox` — *not*
`/home`, which is the agent's own mount and would shadow an OS home.

## What is mounted inside

| Path | Contents |
| --- | --- |
| `/sandbox` | the run's scratch (per Space on the machine, per run otherwise) |
| `/shared`, `/space` | the writable commons — see `packages/ai-core/docs/howto-workspaces.md` |
| `/home` | the agent's or person's own mount — per-run sandboxes only, never a space computer |
| `/data` | the Space's module records, staged (below) — per-run sandboxes only, never a space computer |
| `/cache/{uv,bun,npm}` | per-Space package caches; each tool's cache env var points here |
| `/sandbox/apps/<slug>/{src,data}` | the Space's Apps — the same files the running App reads; `app-host` owns the tree |
| `/sandbox/browser-downloads/` | the Space's browser downloads (space computer only) |

The caches, `/data` and the Apps and downloads binds carry an **empty storage
prefix** so the sandbox's own object-storage sync never uploads a wheel, a
record or a repository.

### `/data` in a container

Outside a sandbox, `/data` is a Files-SDK adapter whose every read and write is a
module operation as the run's principal — reading
`/data/Contacts/People/anna__<id>.contact.md` is a `contacts_get`, writing it is
a `contacts_update`, with the same capability check, audit row and approval card.

A program cannot speak HTTP to that adapter through a bind mount, so inside a
sandbox the tree becomes a **read-through cache** at the run's edges:
materialized on `syncIn`, changed files flushed on `syncOut` through the same
update operation, with the version read at materialization time. A record
somebody else changed while the program ran comes back 409 and is **reported,
not overwritten** — a sandbox is where last-write-wins would do the most damage,
because a program can rewrite a hundred records in a second.

The staging directory sits in the sandbox's own scratch, never under a Space
prefix: for byte-mounts the prefix *is* access, so materialized records there
would be a hole in the boundary.

A space computer gets no staged `/data`: its scratch is bound once for every
run in the Space, while the tree is materialized as the run's principal. There
`/data` stays the direct adapter, reachable with file tools only.

## Network and limits

| Tier | Docker network | Who chooses |
| --- | --- | --- |
| `none` (default for per-run sandboxes) | `none` | the agent's `workspace.sandbox.network` |
| `egress` (default for the space computer) | `ENGENTY_SANDBOX_EGRESS_NETWORK` (default `bridge`); proxy env injected when `ENGENTY_SANDBOX_EGRESS_PROXY_URL` is set | the **Space** (`core.spaces.computer_network_tier`), host default `ENGENTY_SPACE_COMPUTER_NETWORK_TIER` |

`none` is the default because the two things model code normally needs —
Engenty tools and Code Mode's RPC — travel over stdio to the host, not over the
network. The machine's tier is the Space's call and never the declaring agent's:
the machine's `HostConfig` is fixed by whoever creates it first, so a per-agent
declaration would make its reach depend on run ordering. Without a proxy URL,
`egress` still attaches to that Docker network and reaches whatever it can —
there is no silent fallback to `none`.

**What `egress` may reach** is decided by the egress proxy
(`deploy/egress-proxy/proxy.mjs`), default deny:

- every sandbox: the shared list in `deploy/egress-proxy/filter` — the package
  registries;
- a Space computer, in addition: the Space's own hosts,
  `core.spaces.computer_egress_hosts`, set in **Space settings → Security →
  Allowed hosts** (`api.example.com`, or `*.example.com` for every subdomain).

The proxy cannot tell containers apart, so a Space computer names its Space in
its proxy URL (`http://<spaceId>:<key>@…`). The key is made once per Space and
kept in the Space folder beside — never inside — the folders the container
binds (`egress.key`). On every run apps/ai writes
`<ENGENTY_SPACES_DIR>/egress/<spaceId>.json` (the key's hash and the hosts),
which the proxy reads per request, so a settings change applies without a
restart. A wrong key is refused (407); no key gets the shared list only.
`apps/ai/src/ai/sandbox/space-egress.ts`.

Ceilings (Docker defaults are unlimited, so without these one runaway allocation
takes the host down):

| Setting | Default | Env |
| --- | --- | --- |
| CPUs | 1 | `ENGENTY_SANDBOX_CPUS` |
| Memory | 512 MB | `ENGENTY_SANDBOX_MEMORY_BYTES` |
| PIDs | 256 | `ENGENTY_SANDBOX_PIDS_LIMIT` |
| Command timeout | 120 s | `ENGENTY_SANDBOX_TIMEOUT_MS` |
| Max output | 256 KB | `ENGENTY_SANDBOX_MAX_OUTPUT_BYTES` |
| Read-only rootfs | off | `ENGENTY_SANDBOX_READONLY_ROOTFS` |

Admission is a slot table, not a bare counter — `ENGENTY_SANDBOX_MAX_CONCURRENT`
(8), `…_PER_TENANT` (4), `…_PER_SPACE` (2), `…_ADMISSION_TIMEOUT_MS` (60 s) —
so the reconcile pass can tell which holder leaked.

## What a container can and cannot reach

Reachable:

- the filesystem it is given (the table above);
- with `egress`: package registries and third-party APIs (through the proxy when
  one is configured);
- the host, over stdio, for Code Mode `external_*` calls.

**Not** reachable — and this is deliberate, not an oversight:

- the core API. No Engenty base URL and no access token are injected into any
  container. Injected env is `TZ`, the proxy vars, the cache paths — nothing else.
- the Space's browser (its own networks; agents drive it host-side).
- another Space's anything: scratch, caches and binds are rooted per Space.

## How a program still calls Engenty

Code Mode. The model writes one TypeScript program; it is staged in the
sandbox's bind-mounted working directory and run with `bun`, and its
`external_*` calls are framed back over stdout/stdin to host-side dispatch —
the same `invokeTool` path as a chat tool call, with schema validation, run
context and audit intact.

The program sees exactly two tools:

| Tool | Behaviour in a program |
| --- | --- |
| `engenty_tools_search` | catalog discovery, Space-filtered |
| `engenty_tool_execute` | reads run; a gated write runs **only** when a pre-existing grant covers it |

The gate cannot suspend from inside a running program — Code Mode dispatch has
no agent context — which is exactly why grants must pre-exist. An ungranted
write fails *into* the program with the recovery path: run
`engenty_tools_preapprove` in chat, take the one card that grants the program's
write set, re-run.

`DockerCodeModeTransport` exists only because Mastra's shipped
`StdioCodeModeTransport` stages programs on the **host**, a path that does not
exist inside a container. It reads the host↔container path mapping from
`DockerSandbox`'s `_volumes`/`_workingDir` fields — plain JS fields, not in the
`.d.ts` — so re-verify it on every `@mastra` bump, and delete it when upstream
becomes container-aware.

The shell. `engenty tools list|schema|call` is on every sandbox image
(`deploy/sandbox/engenty.mjs`) and runs the same sandbox-gated execute as Code
Mode — `engenty tools call … | jq` from bash, exit 2 when a write needs a
grant. No token and no network: on the first command apps/ai starts one relay
per container (`docker exec -i -u 0 … engenty relay`), which listens on a unix
socket in a fresh root-owned dir under `/tmp` and passes requests over that
exec's stdio. A socket bound in from the host is not used — Docker Desktop
refuses to connect to one (`ENOTSUP`). Every command gets `ENGENTY_SOCKET` and
an `ENGENTY_RUN_TICKET` minted when it starts and dropped when it returns; a
request is answered in the async context of the run that minted it, so the CLI
has that run's token, Space gate and grants, and a ticket from another
container is refused. Background processes outlive their ticket and get none
(`engenty-cli-relay.ts`).

## Operating them

| Surface | What |
| --- | --- |
| `GET /ai/sandboxes` | the Computers view: every container for the caller's scope, with state, age and queue depth |
| `POST /ai/sandboxes/stop` | stop named space computers (`docker stop`; installed state stays) |
| `DELETE /ai/sandboxes` | Reset — `docker rm`, the only thing that discards a machine's installed state |
| `GET`/`POST /ai/sandboxes/browser`, `POST …/browser/stop`, `…/browser/ticket`, `…/browser/sign-out`, `GET`/`PUT …/browser/grant` | a Space's browser (`?space_id=`, default the caller's personal Space; Space members only), one agent's live-view ticket (`&agent_id=`) and the Space's consents (proxied to core) |

Two sweeps run on the staging reaper's tick: idle space computers are stopped,
idle space browsers are stopped on their own TTL. On AI shutdown, space
computers and space browsers are **stopped** (writable layer and profile stay);
run, session and task containers are **removed**.

## Related

- Spaces runtime contract (`docs/agent/spaces-runtime.md`) — what a Space makes
  available, record scopes, catalog-is-not-data
- How-to: Agent Workspaces (`packages/ai-core/docs/howto-workspaces.md`) — declaring
  presets, mounts and `sandbox.enabled` on an agent
- [Connections](./connections) — connectors and MCP servers; tokens never enter a
  container
