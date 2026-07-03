# Tenant Sandbox Runtime

Status: **plan** · Branch: `spike/tenant-box` · Worktree: `engenty-pro-tenant-box` · 2026-07-03

**One shared sandbox per tenant for any AI work.** A platform capability of `apps/ai` —
independent of any module. Spun up on demand, idle-stopped, hosting all of a tenant's
agent-adjacent workloads: CLI/coding runs, long-lived service daemons (first consumer:
Open Design for the brand-design module), and the roadmap's agent runtimes.

## Scope split (decided 2026-07-03)

This work was untangled from two other plans and is now the base layer:

| Workstream | Doc | Visibility |
|---|---|---|
| **A. Tenant sandbox runtime** (this doc) | `docs/wip/tenant-sandbox-runtime.md` | platform capability |
| **B. Hosting / manage plane** (installations per tenant, fleet, central manage app) | `docs/wip/single-tenant-installations.md` (branch `docs/single-tenant-installations`) | **PRO feature — closed. Never syncs to the public/framework repo.** |
| Brand-design module | `docs/wip/brand-design-module.md` (branch `feat/brand-design`) | consumer of A, not owner of anything here |

A works under every tenancy/hosting model (shared SaaS today, installations later) — it only
assumes "there is a Docker-capable host reachable from apps/ai". B consumes A but A never
depends on B.

## What exists today (code facts, verified)

- `EngentySandboxProvider` (`apps/ai/src/ai/sandbox/sandbox-provider.ts`): contract with
  `runCommand`, `syncIn`/`syncOut`, `destroy`; providers `docker` (default) and `gondolin`
  (micro-VM, local dev); `sandbox-factory.ts` resolves provider from declaration + env.
- Per-**run** identity and lifetime only: `engenty.cli` sub-agent sandboxes are created for
  a turn and torn down after (`sandbox-run-teardown.ts`). Tenant `/shared` layouts are
  staged and bound in.
- `apps/ai` is a shared multi-tenant service with no own DB (state in the shared Postgres).

The runtime is therefore an **extension of this seam — new lifetime, wider contract — not a
new system.**

## Design

### The tenant box

- Identity: `tenant` (today: run). One box per tenant, per AI-plane host.
- Lifetime: created on first demand → serves any number of runs/services → idle-stop after
  N minutes → wake on next demand. Never a durable store: **image + synced state rebuilds
  any box** (a wiped box costs at most unpublished working files).
- Inside the box: a minimal init/supervisor (PID 1) that (a) executes run commands in
  **per-run workdirs** (concurrency + hygiene), (b) starts/stops declared **service
  processes** (e.g. the OD daemon), (c) reports health.
- Resources: cgroup memory/CPU/pid limits per box; no Docker socket inside any box, ever.
- Secrets: injected per box at start (tenant-scoped BYOK keys etc.), never baked into images.

### Contract extensions (the actual interface work)

1. **Lifetime class** in sandbox identity: `run | tenant` (roadmap: `agent` for long-running
   agent runtimes — same mechanics as `tenant`, different owner).
2. **Network endpoint**: a box can expose named ports; the provider returns reachable URLs
   (per-run sandboxes never needed this; the OD daemon does).
3. **Hydration lifecycle**: `wake → syncIn → serve → syncOut → sleep` as first-class
   provider operations — this is what makes ephemeral *hosted* providers implementable later.
4. **Service processes**: declarative list (name, command, port, health path) the in-box
   supervisor manages.

### Provider matrix

`docker` (default, self-hosted + SaaS) · `gondolin` (micro-VM, local dev; also the
isolation upgrade path) · later, behind the same contract: `fly-machines` (best hosted fit
for persistent boxes), `vercel-sandbox` / `cloudflare` / `e2b` (ephemeral — fit per-run
bursts; persistent boxes only via full hydration each wake). Tech choice stays swappable;
at the target density (**10s–100s tenants per host, not 1000s**) memory does not
discriminate between techs — payload dominates (idle Node daemon ~150–300 MB vs ~10–20 MB
container overhead).

### Consumers

| Consumer | Uses | When |
|---|---|---|
| `engenty.cli` sub-agents | per-run workdirs in the tenant box (or keep per-run sandboxes — both remain valid) | opt-in after phase 2 |
| brand-design module | OD daemon as a service process in the box | brand phase 1 |
| agent runtimes (roadmap) | `agent` lifetime class | future |

## Implementation

**Phase 0 — spike (running now).** `docs/wip/spike-tenant-box.md`: OD headless in Docker
(Part A) + tenant-lifetime prototype on the docker provider with OD inside (Part B).
Go/no-go gates: idle box ≤ ~400 MB, wake ≤ ~10 s, no headless blockers.

**Phase 1 — contract + registry** (all in `apps/ai/src/ai/sandbox/`):
- `sandbox-types.ts`: lifetime class in `SandboxRunIdentity` (→ `SandboxIdentity`),
  endpoint + service-process types.
- `sandbox-provider.ts`: add `endpoints()`, `startService()/stopService()`, explicit
  `sleep()/wake()`; default implementations so the existing per-run path is untouched.
- New `tenant-box-registry.ts`: box state (tenant → container/volume/endpoints/last-used),
  persisted in the shared Postgres (apps/ai DAL pattern), in-memory cache + idle-stop timers.
- `docker` provider: persistent volume naming (`box-<tenant-slug>`), restart-safe container
  labels, port publishing.

**Phase 2 — supervisor + lifecycle:**
- `ensureTenantBox(tenantId)` as the single entry point for all callers (tools, module ai
  faces); wake path incl. hydration; idle-stop sweep.
- Box image v1: minimal init (tini + small agent), per-run workdir layout, health endpoint.
- Secrets injection + cgroup limits from tenant config; usage metering hooks (box-seconds,
  run counts) into the existing `usage` DAL.

**Phase 3 — first real consumers:**
- OD daemon as declared service process (brand-design phase 1 builds on this — its plan's
  "supervisor" section is superseded by this doc).
- `engenty.cli` gains the option to run in the tenant box (feature-flagged; per-run
  sandboxes remain the fallback).

**Phase 4 — later:** `fly-machines` provider as the first hosted implementation; `agent`
lifetime class for long-running agent runtimes; gVisor/Kata runtime option per box.

**Placement note:** all of the above ships in the normal artifact and works on one VPS
(self-hosted) or with `apps/ai` on its own host (SaaS) — placement is compose/env, not code
(`ENGENTY_CORE_BASE_URL`, `SUPABASE_URL`). Nothing in A requires workstream B.

## Non-goals (owned elsewhere)

Brand/OD semantics, snapshots, approval workflow → brand-design plan. Fleet provisioning,
manage app, per-installation DBs, central identity → hosting plan (PRO-only). Marketplace-
style runtime module installation → not planned.
