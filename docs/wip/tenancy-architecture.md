# Engenty Tenancy & Deployment Architecture

Status: **decided direction** · 2026-07-04 · Branch: `spike/tenant-box` (worktree `engenty-pro-tenant-box`)

Engenty runs as **one shared multi-tenant platform with agent compute separated onto its
own plane**. Tenant isolation for data is row-level (`tenant_id` + RLS in the shared
Postgres); tenant isolation for agent workloads is the **tenant sandbox** (one shared
sandbox per tenant for any AI work). There are no per-tenant installations and no fleet
management — dropped deliberately; see §8.

```
┌── APP PLANE (shared, multi-tenant) ─────────┐   ┌── AI PLANE (agent compute) ──────────┐
│  supabase stack (Postgres, storage, auth)   │   │  engenty-ai (shared service,          │
│  engenty-core   (API/gateway, module        │◄──┤    no own DB — state in app-plane PG) │
│                  server faces)              │   │  tenant boxes: box-<tenant-a>,        │
│  engenty-ui     (module UI faces)           │   │    box-<tenant-b>, … (on demand,      │
│  tenant_id + RLS everywhere                 │   │    idle-stop; OD daemon, CLI runs,    │
│                                             │   │    future agent runtimes inside)      │
└─────────────────────────────────────────────┘   └───────────────────────────────────────┘
        placement is compose/env, not code: same services on one host (self-hosted)
        or split across hosts (SaaS) via ENGENTY_CORE_BASE_URL + SUPABASE_URL
```

## 1. The two planes

**App plane** — the classic multi-tenant web application: supabase stack + `engenty-core` +
`engenty-ui` over one shared Postgres. All business data, all module schemas, sessions,
settings. Scales like any web app (replicas + DB).

**AI plane** — `engenty-ai` plus the tenant boxes it supervises. `engenty-ai` is itself a
shared multi-tenant service with **no database of its own** (Supabase client via
`SUPABASE_URL`; Mastra `PostgresStore` tables live in the shared Postgres). It reaches core
over HTTP (`EngentyCoreClient`, `ENGENTY_CORE_BASE_URL` — `apps/ai/src/ai/core-http-client.ts`).
Separation is **compute, not data**: agent workloads scale and fail independently of the API.

This split already exists in code — `apps/ai` is a separate service and the only app
depending on `@mastra/core`. This document just makes it the deployment architecture.

## 2. Tenant sandboxes (the per-tenant isolation unit)

One shared sandbox per tenant for any AI work — CLI/coding runs, the Open Design daemon,
future long-running agent runtimes — spun up on demand, idle-stopped, rebuildable from
image + synced state. Target density: **10s–100s of tenants per host**.

**Spec and implementation plan: [`tenant-sandbox-runtime.md`](./tenant-sandbox-runtime.md)**
(same branch) — built as an extension of the existing `EngentySandboxProvider`
(`apps/ai/src/ai/sandbox/`, providers `docker` + `gondolin`), which already runs
`engenty.cli` sub-agents in per-run sandboxes today. Phase 0 spike:
[`spike-tenant-box.md`](./spike-tenant-box.md).

## 3. Modules

A module is **one package with three faces**, compiled into the plane that hosts each face —
`src/plugin` → core, `ui/plugin` → ui, `ai/registrar` → ai (loaded via
`module-capability-loader`). The `engenty.plugin.json` capability flags
(`operations`/`ai`/`frontendTools`) are this decomposition. Installed = shipped in the build
artifact (same code for every tenant; adding a module = deploy + migrations). Enabled =
runtime state, two-level: `globalEnabled` per instance + per-scope `overrides`
(`plugin-admin-routes.ts`).

## 4. Deployment stages (VPS/Docker, Coolify)

**Stage 1 — one VPS.** All services as containers on one host: supabase, core, ui, ai, plus
on-demand tenant boxes. This *is* the self-hosted bundle — SaaS and self-hosted are the
same artifact, stage 1 vs stage 2 is only placement.

**Stage 2 — split planes.** VPS-1: supabase + core + ui. VPS-2 (+ more later): engenty-ai +
tenant boxes, joined by a private network (Hetzner vnet/WireGuard); TLS + service tokens on
the core↔ai seam. Scale-out = additional AI-plane hosts; the box registry assigns tenants
to hosts.

**Management split:** Coolify manages the long-lived services; the **dynamic tenant boxes
are not Coolify's job** — the runtime supervisor in `engenty-ai` launches them via the local
Docker API (socket mounted into the supervisor only, never into boxes).

## 5. Filesystem & durability

| What | Where | Durability |
|---|---|---|
| Postgres (`supabase-db` volume) | app plane | **sacred** — all module data, snapshots, sessions, Mastra tables |
| Object storage (`supabase-storage` volume or S3-compatible) | app plane | **sacred** — files incl. mirrored brand assets |
| `engenty-ai` | AI plane | stateless, no volume |
| `box-<tenant>` volumes | AI plane | **semi-disposable** — working state only; anything published/valuable is synced to the app plane (snapshot rule); boxes rebuild from image + syncIn |

Backup policy = Postgres dump + storage snapshot, restore-tested. Losing an entire AI-plane
host costs at most unpublished working files.

## 6. Invariants

1. `tenant_id` + RLS in every module schema — non-negotiable, keeps modules portable.
2. Boxes are never durable stores; durable truth lives in the app plane.
3. No Docker socket inside any box; per-box cgroup limits; per-box tenant secrets at start.
4. Placement is compose/env, never code — one artifact serves self-hosted and SaaS.
5. Sandbox tech stays swappable behind the provider contract (docker default; gVisor/Kata/
   micro-VM or hosted providers by config — memory overhead does not discriminate at our
   density; payload dominates).

## 7. Workstreams building on this

| Workstream | Doc / branch | Status |
|---|---|---|
| **Tenant sandbox runtime** | `docs/wip/tenant-sandbox-runtime.md` · `spike/tenant-box` | adopted; phase-0 spike chartered |
| **Brand-design module (Open Design)** | `docs/wip/brand-design-module.md` · `feat/brand-design` | planned (v3); first service-process consumer of the runtime |
| Agent runtimes (roadmap) | — | future `agent` lifetime class on the runtime |

## 8. Explicitly out (dropped 2026-07-04)

Per-tenant installations, a central manage-plane fleet, and per-tenant databases are **not
part of this architecture**. They were evaluated at length and dropped to keep one
unambiguous direction; the decision history lives in the git log of branch
`docs/single-tenant-installations` (doc there is tombstoned). If data-isolation
requirements ever change (regulated tenants, residency), that history is the starting
point — the invariants in §6 keep the door open without paying for it now.

## 9. Open items

1. Core↔AI contract versioning (lockstep deploys vs versioned gateway operations).
2. UI↔AI streaming path when planes are on separate hosts.
3. Per-tenant secrets management on the AI plane (BYOK for spawned agents).
4. Metering: box-seconds + run counts into the existing `usage` DAL (runtime plan phase 2).
