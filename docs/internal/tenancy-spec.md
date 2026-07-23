# Engenty Tenancy Spec — Two Tiers, One Manage App

Status: **draft spec** · 2026-07-07 · Branch: `spike/tenant-box`
Supersedes: `tenancy-architecture.md`, `tenant-sandbox-runtime.md` (design absorbed here),
and reverses the 2026-07-04 "no per-tenant installations" decision in a narrower form (Tier B).

Model reference: [Vercel for Platforms](https://vercel.com/platforms) — one product, two
architectures: **single-codebase multi-tenant** (shared app, subdomain/custom-domain routing)
and **multi-project** (programmatically created isolated deployments for custom code).
Engenty's tiers map 1:1 onto these. Vercel provides domains, deploy automation, and project
claiming — *not* databases, billing, or data isolation; those are ours in both tiers.

```
                       ┌──────────────────────────────┐
                       │  MANAGE APP (control plane)   │
                       │  tenants · tiers · provisioning│
                       │  domains · billing · health   │
                       └──────┬──────────────┬────────┘
                              │              │
        ┌── TIER A: PLATFORM ─▼──────┐   ┌── TIER B: SATELLITE (per tenant) ─▼─┐
        │ shared core+ui (all modules)│   │ own core+ui build (custom modules)  │
        │ shared supabase (tenant_id  │   │ own supabase (or dedicated schema)  │
        │   + RLS)                    │   │ own storage                          │
        │ shared apps/ai              │   │ own apps/ai + sandbox               │
        │   └ tenant box per tenant   │   │ still: same artifact lineage,        │
        │     (agents share the box,  │   │ centrally managed by the manage app  │
        │      per-run workdirs)      │   │                                      │
        └─────────────────────────────┘   └──────────────────────────────────────┘
```

## 1. Tier A — Platform (multi-tenant, shared everything)

The Vercel "single-codebase" model. This is the default tier and today's architecture.

- **Shared core + ui**, one build, all standard modules compiled in. Enablement is runtime
  state per tenant (existing `globalEnabled` + per-scope overrides).
- **Shared supabase**: one Postgres, `tenant_id` + RLS in every module schema
  (non-negotiable — this invariant is what keeps modules portable across tiers).
- **Routing**: subdomain per tenant (`<tenant>.engenty.app`) + custom domains, resolved to
  `tenant_id` at the gateway. (The one genuinely new Tier-A work item — today tenancy is
  session-based, not host-based.)
- **apps/ai separated**: agent compute is its own service/plane (already true in code —
  `apps/ai` is the only `@mastra/core` consumer, talks to core over HTTP, no own DB).
  Scales and fails independently of the API; can live on the same host or its own.

### A-isolation: one tenant box per tenant, not per agent

**Decision: the tenant shares one sandbox; agents get per-run workdirs inside it.**

- Per-agent sandboxes would be 10–50× the container count for zero additional *tenant*
  isolation — the security boundary that matters is between tenants, not between one
  tenant's own agents. Cross-agent hygiene inside a box is workdir + process separation.
- The box is the unit of: cgroup limits, tenant secrets injection, network policy,
  idle-stop, metering (box-seconds).
- Lifecycle: created on first demand → serves runs + service processes (e.g. OD daemon) →
  idle-stop → wake on demand. Never a durable store: image + syncIn rebuilds any box.
- Escape hatch kept: the existing per-run sandbox path stays valid (it's the same provider
  contract with `run` lifetime); a paranoid or heavyweight workload can opt into its own
  per-run sandbox without architectural change.
- Implementation: extension of `EngentySandboxProvider` (`apps/ai/src/ai/sandbox/`) —
  lifetime class `run | tenant` (later `agent`), network endpoints, service processes,
  wake/sleep hydration, `tenant-box-registry` in the shared Postgres. Phase plan absorbed
  from the previous runtime doc; go/no-go spike gates unchanged (idle ≤ ~400 MB, wake ≤ ~10 s).

## 2. Tier B — Satellite (isolated per-tenant deployment)

The Vercel "multi-project" model: a programmatically provisioned, isolated instance —
for tenants that need **custom modules**, hard data isolation, or residency.

Each satellite is:

- **Own core + ui build** — base platform + the tenant's custom/private modules compiled in.
  Modules stay "one package, three faces" (`src/plugin` → core, `ui/plugin` → ui,
  `ai/registrar` → ai); a custom module is just a package added to *that satellite's* build.
  No runtime marketplace installation — customization = a build, produced by the manage app.
- **Own supabase** (own Postgres + auth + storage). `tenant_id` + RLS stay in the schema
  even with one tenant — same code both tiers, and satellites can be consolidated back to
  Tier A (or host sub-tenants) later.
- **Own apps/ai + own sandbox host** — custom module `ai` faces and their sandbox workloads
  run inside the satellite's boundary, never on the shared AI plane. This is the core
  safety argument for Tier B: *custom code never executes in shared infrastructure.*
- **Centrally managed**: provisioned, upgraded, monitored, and billed by the manage app.
  The tenant gets a product, not a server.

Deployment unit: the existing prebuilt-image deploy (ghcr images + compose, as on the VPS
today) parametrized per satellite — one compose stack per tenant, on shared satellite hosts
or dedicated VPSes as their size demands.

## 3. Manage app (the control plane)

The piece Vercel keeps for itself and we must build. One app that "sets up everything":

- **Tenant registry**: tenant → tier, domains, plan, module set, versions, endpoints, status.
- **Provisioning**:
  - Tier A: create tenant row + auth org + subdomain → seconds.
  - Tier B: build image (base + custom modules) → provision supabase → run migrations →
    deploy compose stack → wire domain/TLS → smoke check. Fully automated, driven by the
    manage app (Coolify or plain Docker API as executor — an implementation detail).
- **Upgrades**: platform tier rolls with the main deploy; satellites upgrade per-tenant
  (staged rollout, per-satellite version pinning — the price of Tier B, made explicit).
- **Domain management**: wildcard + custom-domain verification and TLS (the Vercel-domains
  feature, self-hosted: Traefik/Caddy + DNS challenge).
- **Health + metering**: per tenant across both tiers — uptime, box-seconds, run counts,
  storage — feeding billing.
- **Tier migration**: A→B is a first-class operation (dump tenant's rows + storage objects →
  restore into satellite supabase). Possible *because* schemas are identical in both tiers.
- Manage app is PRO-only, never syncs to the public/framework repo. It is *not* a workspace
  package of the deploy bundle (per existing deploy constraints).

## 4. Invariants (both tiers)

1. `tenant_id` + RLS in every module schema — even in single-tenant satellites.
2. One artifact lineage: a satellite build = platform build + extra module packages;
   never a fork.
3. Placement/tier is compose/env + build manifest, never code branches.
4. Sandboxes are never durable stores; durable truth lives in Postgres + object storage.
5. No Docker socket inside any box; per-box cgroups; secrets injected at start.
6. Custom (tenant-authored) module code runs only inside that tenant's satellite.
7. Sandbox tech stays swappable behind the provider contract.

## 5. What changed vs. the 2026-07-04 decision

Per-tenant installations were dropped then to avoid a fleet-management swamp. Tier B
reintroduces them **narrowly**: not "every tenant gets an installation" but "the platform is
the default; satellites are the paid escape hatch for custom modules / isolation". The
manage app is scoped to provisioning + upgrades + domains + metering — not a second
product. The tombstoned analysis on branch `docs/single-tenant-installations` remains the
reference for the hard parts (fleet upgrades, identity).

## 6. Build order

1. **Tenant box runtime** (Tier A isolation) — phases as previously planned; spike phase 0
   already chartered (`spike-tenant-box.md`).
2. **Host-based tenancy**: subdomain → tenant resolution at the gateway + wildcard TLS.
3. **Manage app v0** *(Phase 1 landed — see `manage-app.md`)*: `apps/manage` shell +
   tenant/user/module/feature-flag management on the shared DB; `core.tenants` gained
   `tier` + `status`. Remaining: Tier-A provisioning + domains.
4. **Satellite v0**: parametrized compose stack + build-with-extra-modules pipeline +
   provisioning flow in the manage app (reuse the proven ghcr/Coolify deploy).
5. **Metering/billing + tier migration.**

## 7. Open questions

1. Tier B supabase: full own stack per satellite (clean, heavier) vs shared Postgres
   cluster with database-per-tenant (cheaper, weaker story)? Leaning full stack — it's
   what "own supabase" promises and matches the compose-stack deploy unit.
2. Identity: central auth (manage app as IdP, satellites federate) vs per-satellite auth
   (simpler, but no SSO across tiers)? Satellites-own-auth is the simpler v0.
3. Satellite custom-module authoring workflow: who builds/reviews tenant modules, and does
   the manage app gate them (signing, review) before a build?
4. Core↔AI contract versioning (carried over — matters more once satellites pin versions).
