---
title: Agent computers
description: The Docker containers behind an agent run — per-run sandboxes, the space computer, a person's browser — and what each one can reach.
---

# Agent computers

An agent's model loop runs **host-side in `apps/ai`**. A container is a pair of
hands: it executes commands and holds bytes. Almost nothing an agent knows about
Engenty arrives through the container — app records, tools and connections travel
the host-side operation pipeline described in the
[Spaces runtime contract](../../agent/spaces-runtime.md).

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
| User browser | `engenty-browser-<tenant>-<space>-<user>` | person × Space | stopped when idle; removed on Reset |

Ids are parsed by [`parse-engenty-sandbox-id.ts`](../../../apps/ai/src/ai/sandbox/parse-engenty-sandbox-id.ts);
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
[`agent-workspace-hook.ts`](../../../apps/ai/src/ai/sessions/agent-workspace-hook.ts).
`task` and `session` keep their own containers because each is a continuity
mechanism of its own; a run with no resolved Space falls back to a per-run lease.

The agent is told which one it landed on — the runtime injects a "Your computer"
block naming persistent-vs-per-run execution, the network tier, and that package
caches are warm per Space.

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

**Commands are serialized per machine.** The machine is shared — concurrent runs
in the Space hold instances with the same sandbox id, resolving to one container
with one `/tmp` and one process table — so `executeCommand` is queued
process-wide, keyed by sandbox id. Queue depth is visible in the Computers view,
and a wait of 3 s or more is logged as `space_computer_queue_wait`. Background
processes (`processes.spawn`) stay unserialized; long-running servers are the
point.

Its scratch is one shared workspace per Space
(`ai/sandboxes/space/workspace/`), so every run and the machine itself see the
same bytes.

## A person's browser

One headless-Chromium container **per user per Space**, driven over CDP by
`apps/ai` **in that person's name**. A service, not an exec sandbox — nothing
executes commands in it.

- It exists only when the person asked for it, and it **never joins a machine's
  network**: agents browse through host-side `browser_*` tools, never raw CDP
  from a sandbox.
- Continuity is the profile bind
  (`tenants/<tenant>/spaces/<space>/ai/browser/profile/<user>/`) — cookies and
  logins survive stops, Resets and image upgrades, and belong to exactly one
  person.
- Two networks: its own egress network (`ENGENTY_BROWSER_EGRESS_NETWORK`,
  default `bridge`; all traffic through the logged browser proxy when
  `ENGENTY_BROWSER_EGRESS_PROXY_URL` is set — open and logged, not the sandbox
  allowlist) and the view network it is attached to after start
  (`ENGENTY_BROWSER_VIEW_NETWORK`), where only `engenty-ai` lives. Without a
  view network, apps/ai dials the published loopback CDP port.
- Downloads land in `/downloads` in the browser and appear to a space computer
  run at `/sandbox/browser-downloads/<user>/` — the same bytes, not a copy.
- Idle stop after `ENGENTY_BROWSER_IDLE_STOP_MS` (15 min), with its own last-use
  stamp and sweep. Ceilings: `ENGENTY_BROWSER_MAX_PER_TENANT` (4),
  `ENGENTY_BROWSER_MAX_PER_USER` (2). Over the ceiling, Start answers 429.

**Consent is part of the tool surface.** The `browser_*` tools are attached only
when the acting person already has a browser in this Space or has allowed agents
to start one. Otherwise the run gets a single `browser_start` tool that asks —
keeping the rest of the schema out of every other prompt. Two standing consents
are separate: `autostart` (an agent may create the browser) and `unattended` (an
agent may drive it with nobody at the keyboard). A run that acts for nobody gets
no browser tools at all. Every step is audited as `engenty.browser.action`, with
arguments recorded as shape, not payload.

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
| `/home`, `/shared` xor `/space`, `/skills`, `/task`, `/project` | the workspace mounts — see [How-to: Agent Workspaces](../../../packages/ai-core/docs/howto-workspaces.md) |
| `/data` | the Space's module records, staged (below) |
| `/cache/{uv,bun,npm}` | per-Space package caches; each tool's cache env var points here |
| `/sandbox/apps/<slug>/{src,data}` | the Space's Apps — the same files the running App reads; `app-host` owns the tree |
| `/sandbox/browser-downloads/<user>/` | every user's browser downloads for this Space |

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
- a person's browser (its own networks; agents drive it host-side).
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

## Operating them

| Surface | What |
| --- | --- |
| `GET /ai/sandboxes` | the Computers view: every container for the caller's scope, with state, age and queue depth |
| `POST /ai/sandboxes/stop` | stop named space computers (`docker stop`; installed state stays) |
| `DELETE /ai/sandboxes` | Reset — `docker rm`, the only thing that discards a machine's installed state |
| `GET`/`POST /ai/sandboxes/browser`, `POST …/browser/stop`, `…/browser/ticket`, `…/browser/sign-out` | a person's browser, including the live-view ticket |

Two sweeps run on the staging reaper's tick: idle space computers are stopped,
idle user browsers are stopped on their own TTL. On AI shutdown, space
computers and user browsers are **stopped** (writable layer and profile stay);
run, session and task containers are **removed**.

## Related

- [Spaces runtime contract](../../agent/spaces-runtime.md) — what a Space makes
  available, record scopes, catalog-is-not-data
- [How-to: Agent Workspaces](../../../packages/ai-core/docs/howto-workspaces.md) — declaring
  presets, mounts and `sandbox.enabled` on an agent
- [Connections](./connections) — connectors and MCP servers; tokens never enter a
  container
