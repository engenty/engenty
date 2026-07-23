---
title: "AI governance — self-managed (open) vs centrally-managed (hosted)"
---

# PLAN: AI governance — self-managed (open) vs centrally-managed (hosted) model settings & usage limits

Status: IMPLEMENTED end-to-end on `spike/tenant-box` (2026-07-22, rebased onto
`main` v0.1.64). Phases 1–4 landed in the worktree for joint debugging before the
tenant-box branch merges to main. Synthesized from a deep read of three lineages:
`main` (incl. the redesigned AI settings page), `spike/tenant-box` (entitlements +
manage app), and the plugins framework.

## Decisions (Matthias, 2026-07-22)

1. Hosted **models** governance = **tenant-picks-within-allow-list** (not fully
   platform-pinned). Implemented: the models tab stays editable, pickers filter
   to the plan's `allowed_models`, with an info note.
2. Hosted **limits** transparency = **show everything, read-only** for now (a
   final model comes later). Implemented: limits tab renders the values but
   disables editing + shows a "Managed by your plan" banner.
3. `ENGENTY_GATEWAY_MANAGE_ENABLED` default = **false unless PRO**. Left as-is:
   deploy artifacts pin it false; the code default (true) only affects dev where
   `/manage` is proxied anyway. No change needed.
4. Do the work **in the tenant-box worktree** (it merges to main next). Done.

## Implementation status (what landed)

- **Phase 1 — enforcement hardening.** Streaming chat path (`startConversationRun`
  route) now preflights `checkUsageLimits` and returns 429 on block; `allowed_models`
  enforced at model resolution (`resolvePurposeModel` allow-list demotion) + in the
  gateway `model-options` picker; admin gate added to `PATCH /ai/registry/agents/:id`.
  `included_*` left as a billing/metering input (not a hard gate — correct).
- **Phase 2 — governance seam.** `ai.tenant_usage_policy.managed_by` column
  (migration `20260722170000`) + `PATCH /ai/v1/usage/policy` 409 `usage.policyManaged`
  lock (superadmin bypasses); limits tab read-only + banner; models tab allow-list
  note; page moved `/setup/ai` → `/settings/ai` (+ redirect) resolving the
  setup-vs-config placement; nav item moved to the Settings group.
- **Phase 3 — entitlements wiring.** `applyAiUsagePolicy` → `toTenantUsagePolicyRow`
  now stamps `managed_by = 'entitlement'` for packaged tenants (`'tenant'` when
  un-packaged, so removing a plan reverts to self-service).
- **Phase 4 — manage editor.** AI governance panel on `TenantEntitlementsTab`:
  per-tenant model allow-list + AI hard limit + enforcement mode, saved into the
  entitlement override and re-materialized via `syncAiPolicy`.
- **Tests.** +4 `resolvePurposeModel` allow-list cases, +2 `toTenantUsagePolicyRow`
  managed_by cases, supervisor-usage test updated for the allow-list demotion.
  Green: ai-core (176), core packages.test, app-shell nav (47), all typechecks (39).
  Pre-existing failures NOT caused by this work: `apps/core` `server.test.ts` and
  `apps/ai` `parallel-tool-approval-resume.test.ts` both fail on the untouched base
  (Vitest-4 migration fallout on the rebased branch).

## 1. Problem

We ship two flavors of the same product:

- **Open-source / self-hosted**: the installation owner *is* the platform. Tenant
  admins manage AI model settings and usage limits themselves (today: `/setup/ai`).
- **Managed platform (hosted tenants, Tier A now / Tier B satellites later)**:
  engenty operates the installation. Model settings and usage limits are governed
  from the **manage app**. Tenant users must not see the `/setup/*` surfaces
  (superadmins only), and tenant admins must not be able to loosen their own limits.

Question posed: can the plugins framework / hooks API be the abstraction seam?

## 2. What already exists (research findings)

### 2a. The managed backbone is half-built on `spike/tenant-box`

- `packages/entitlements` — packages (free/team/business/enterprise) with a full
  `aiUsagePolicy` per package: `period_mode/unit`, `included/soft/hard_limit_cost_micros`,
  `enforcement_mode`, `currency`, **`allowed_models: string[] | null`**.
- Resolver composes **tenant override > package > free-default** (`resolver.ts`).
- **Critically**: on every package/override change, `applyAiUsagePolicy(tenantId)`
  (`apps/core/src/dal/packages.ts:277`) materializes the resolved policy into
  **`ai.tenant_usage_policy`** — the exact row the AI usage engine reads
  (`apps/ai/src/dal/usage/usage-store.ts:349`). The manage→AI-plane transport
  already exists and is a **materialized DB row**, not an RPC.
- Manage app (`apps/manage`, PRO, superadmin, gateway-gated) already governs
  per-tenant: modules, feature flags, entitlement package + sparse override,
  seats, automation rules, billing/invoices. `TenantEntitlementsTab` is where an
  AI editor belongs; it doesn't exist yet.
- None of this is on `main` (apps/manage, packages/entitlements, 4 migrations —
  all exclusive to `spike/tenant-box`, which sits on v0.1.38).

### 2b. The AI settings stack spans THREE stores (main)

| Store | Contents | Written by |
|---|---|---|
| `core.tenant_settings` key `ai.config` | model pins per purpose, doc-converter, voice, `caps.max_steps` | tenant admin via `PATCH /api/tenant-settings/ai.config` (cap `tenant-settings.write`) |
| `ai.tenant_usage_policy` (+ `ai.user_usage_policy`) | budgets, soft/hard limits, `allowed_models`, `enforcement_mode`, tier, included allowances | tenant admin via `PATCH /ai/v1/usage/policy` (superadmin-only: tier/included/currency) |
| `ai.engenty_ai_agents` | per-agent `model_override`, `purpose`, `max_steps`, budget | `PATCH /ai/registry/agents/:id` |

Model resolution precedence: **session > agent > tenant (`ai.config`) >
platform (env, boot-hydrated from `core.platform_settings`) > default**
(`packages/ai-core/src/config/model-purposes.ts`).

### 2c. Enforcement gaps found (must fix regardless of governance)

1. **The primary streaming chat path never preflights limits.**
   `checkUsageLimits` (`packages/ai-core/src/usage/limit-check.ts`) has exactly ONE
   caller — the non-streaming `session-service.generate()` path. `startConversationRun`
   → `conversation-run.ts` only *records* usage post-hoc. Hard limits and
   `allowed_models` are effectively bypassed for normal chat.
2. **No lock: a tenant admin can loosen/remove their own hard limits** and edit
   their own allow-list via `PATCH /ai/v1/usage/policy`. Nothing marks a policy
   as centrally managed.
3. **`allowed_models` is not enforced at model-selection time** — only inside
   `checkUsageLimits` (which mostly doesn't run, see 1). A disallowed tenant pin
   in `ai.config` resolves happily.
4. `included_*` allowances and `tier` are stored but never consumed by enforcement.
5. `PATCH /ai/registry/agents/:id` has no explicit admin check in the handler.

### 2d. What the plugins framework offers (and doesn't)

Usable primitives (all module-tier):

- **Provider-style registration exists as a pattern**: `registerSearchIndexProvider`,
  `registerRetrievalSource`, `registerService` — precedent for a single-slot
  `registerAiGovernanceProvider`.
- **Veto surfaces**: `registerProfilePolicy` can deny/require-approval on ANY
  plugin operation — including the generic `tenant-settings.write` that carries
  `ai.config` — and `core`-namespace event interceptors (`operation.beforeInvoke`)
  can block with 403 + audit. This is the hooks-API answer for locking writes.
- **UI hook engine**: `EngentyUiApi.on("ui.routes" | "ui.settingsItems" | ...)`
  is the ONLY mechanism by which one plugin can hide/replace another plugin's UI
  contributions (duplicate route paths are dropped first-wins, not overridden).
- **Per-tenant plugin enable/disable** (`core.tenant_plugin_overrides` +
  `capability-resolver.ts`) and **feature flags** (tenant > global > default).

Hard limits of the framework for this problem:

- **`apps/ai` never loads plugin code.** It consumes core over HTTP. Any hook
  registered in the core plugin host cannot intercept model selection or usage
  accounting inside apps/ai. Model choice + usage are closed to plugins today.
- No handler *replacement* server-side (veto/mutate only); no named UI slots.
- No first-class "edition" signal. Managed-vs-open today = three ad-hoc switches:
  `VITE_MANAGE_APP_ENABLED` (UI build), `ENGENTY_GATEWAY_MANAGE_ENABLED`
  (gateway; verify default — code on main reads default TRUE, memory says false),
  and per-key `configurable: "platform" | "tenant"` in the env manifest
  (enforced server-side by `platform-settings-routes.ts`).

## 3. The concept

### 3.1 Answer to the direct question

**Yes — use the plugins framework as the *packaging and gating* vehicle, but NOT
as the per-request resolution mechanism.** Governance ships as a PRO module
(`entitlements`) that plugs into existing seams; the runtime authority travels as
**materialized policy rows**, because (a) that path is already built and proven
(`applyAiUsagePolicy`), (b) apps/ai can't run plugin hooks anyway, and (c) a
materialized row is exactly what a future Tier-B satellite config-push can sync,
whereas live hook calls could never reach a satellite.

Rule of thumb: **hooks gate the writes and the UI; materialized rows carry the
policy; the resolver stays plugin-free.**

### 3.2 Governance model — one new first-class concept

Introduce **governance domains** with a per-tenant governance source, resolved by
the entitlement layer and defaulting to self-service when no entitlement module
is installed:

```
ai.limits   : "tenant" | "platform"   // usage policy (budgets, hard/soft, enforcement_mode)
ai.models   : "tenant" | "platform"   // who may pin models; allow-list always applies
ai.agents   : "tenant" | "platform"   // per-agent overrides/budgets
```

- **Open-source build**: no entitlements module → every domain = `"tenant"`.
  Nothing changes for self-hosters. This IS the open-source version.
- **Managed build**: package/override declares governance per domain. Typical
  hosted profile: `ai.limits = "platform"` (always centrally governed),
  `ai.models = "tenant"` *within* the package's `allowed_models`,
  `ai.agents = "tenant"` within budget caps.

This deliberately extends the proven `configurable: "platform" | "tenant"`
pattern from platform-settings — same mental model, one level up (domains
instead of env keys), and dynamic per tenant instead of static per key.

### 3.3 Data plane: extend the materialized row, add a lock

1. Add to `ai.tenant_usage_policy`: `managed_by text NOT NULL DEFAULT 'tenant'`
   (`'tenant' | 'entitlement'`). `applyAiUsagePolicy` writes `'entitlement'`.
2. `PATCH /ai/v1/usage/policy` rejects with `409 policy_managed` when
   `managed_by = 'entitlement'` (tenant admins keep READ; superadmin admin-routes
   keep working — they are the manage app's path).
3. Enforce `allowed_models` in **three places** (defense in depth):
   - write-time: validating `ai.config` model pins against the allow-list;
   - resolution-time: `resolvePurposeModel` skips a tenant pin not in the
     allow-list and falls through to platform/default (so a later tightening of
     the plan doesn't break tenants — their pin silently degrades to inherited);
   - catalog: `GET /ai/v1/gateway/model-options` filters to the allow-list, so
     pickers only offer legal models.
4. **Close the streaming enforcement gap**: preflight `checkUsageLimits` in
   `startConversationRun` (and any other run entrypoints) — without this,
   central governance is decorative.
5. Wire `included_*` allowances into `checkUsageLimits` (or explicitly drop the
   columns); add the missing admin check on `PATCH /ai/registry/agents/:id`.

### 3.4 Where the plugins/hooks API is used (concretely)

The `entitlements` module (module-tier, PRO, absent from open builds) registers:

1. **`registerProfilePolicy`** — vetoes `tenant-settings.write` on key `ai.config`
   when `ai.models = "platform"`, and vetoes model pins outside `allowed_models`
   otherwise. This locks the third store (`ai.config`) without touching the
   generic tenant-settings plugin. (The usage-policy lock lives natively in
   apps/ai via `managed_by` — apps/ai can't consult core hooks.)
2. **A governance resolver service** (`registerService` + an internal core route
   `GET /api/ai-governance/:tenantId`, service-token) — core-side single source
   for "what are this tenant's governance domains + allow-list". Core's workspace
   bootstrap and the effective-settings endpoint embed its answer.
3. **UI hook engine** — in the hosted UI build, the entitlements UI face uses
   `engenty.on("ui.settingsItems", ...)` / `("ui.routes", ...)` to strip or
   redirect surfaces that must not exist for hosted tenants (mirrors the existing
   `isManageAppEnabled()` handoff that already reroutes Setup→Plugins to
   `/manage/modules`).
4. Optional later: promote (2) into a first-class single-slot
   **`registerAiGovernanceProvider`** in the plugin SDK (precedent:
   `registerSearchIndexProvider`), so alternative governance backends (e.g. an
   external billing system) can be swapped in.

### 3.5 UI concept (tenant app)

Carry a `governance` block on the workspace bootstrap (or effective-settings)
response: `{ aiLimits: "tenant"|"platform", aiModels: ..., allowedModels }`.
The AI settings page adapts per tab — no forked pages, no hidden-by-CSS:

| Tab | `tenant` mode (open) | `platform` mode (managed) |
|---|---|---|
| Models | editable matrix (today) | pickers filtered to allow-list; if models fully platform-governed → read-only matrix + "Managed by your plan" banner |
| Limits | editable (today) | **read-only** policy view + plan name + "contact us to upgrade" affordance |
| Usage | visible | visible (tenants must always see their own consumption) |
| Agents | editable | editable within caps, or read-only per `ai.agents` domain |
| Voice / Doc-converter | editable | editable (not governance-relevant) unless keys are platform-only via existing `configurable` |

The existing `governancePro` prop on the limits tab is the seed of this — it
becomes driven by the governance block instead of a hardcoded default.

**Placement fix rides along**: the page returns to `/settings/ai` (it edits
TENANT config — resolves the deferred "setup vs config mixup"). `/setup/*`
remains the installation owner's area (platform defaults, integration keys) and
is already superadmin-only in nav — in hosted tenants, tenant users never see it.
The manage app is where engenty staff govern hosted tenants; `/setup` on the
hosted platform stays superadmin-only.

### 3.6 Manage app additions

- **AI panel on `TenantEntitlementsTab`**: edit the per-tenant entitlement
  override's `aiUsagePolicy` (limits, `allowed_models` multi-select from the
  gateway catalog, `enforcement_mode`) on top of the package default; every save
  re-runs `applyAiUsagePolicy`.
- **Per-tenant usage view** in manage (superadmin usage endpoints already exist:
  `GET /ai/v1/usage/admin/tenants/:tenantId`).
- Package catalog (`packages/entitlements/src/config/packages/`) gets real
  `allowed_models` per plan (today all `null`) and governance-domain defaults.

### 3.7 Tier B satellites (future-proofing, not in scope)

Because the authority is a materialized row, the (designed-but-unbuilt) satellite
facade only needs to **sync two things** to govern a satellite's AI: the
`ai.tenant_usage_policy` row (+ `managed_by`) and relevant `core.platform_settings`.
No hook RPC across installations is ever needed. Design nothing that assumes
same-process hooks between manage and the governed runtime.

## 4. Phasing

Ordered so every phase is independently shippable and phase 1–2 land on `main`
with zero dependency on the tenant-box branch:

1. **Enforcement hardening (main, open-source-valuable on its own)**
   Preflight `checkUsageLimits` in the streaming run path; enforce
   `allowed_models` at resolution + catalog + write-time; admin check on the
   agent-override route; decide `included_*` (wire or drop).
2. **Governance seam (main)**
   `managed_by` column + PATCH lock; `governance` block on workspace/effective
   responses (hardcoded `"tenant"` defaults for now); AI settings page adapts
   (read-only states, filtered pickers, banner); move page `/setup/ai` →
   `/settings/ai` with redirect.
3. **Land entitlements on main**
   Extract `packages/entitlements` + core entitlement routes + migrations from
   `spike/tenant-box` (rebase across ~154 commits or cherry-pick as a fresh
   series). `applyAiUsagePolicy` writes `managed_by='entitlement'`. Governance
   resolver starts answering from entitlements.
4. **Manage app AI editor**
   AI panel on TenantEntitlementsTab + per-tenant usage view + plan catalog
   `allowed_models`. (Requires apps/manage — lands with, or after, the broader
   tenant-box landing.)
5. **Plugin-facing polish (optional)**
   `registerAiGovernanceProvider` slot in the SDK; profile-policy veto on
   `ai.config` writes; UI hook-engine stripping for hosted builds.

## 5. Explicitly rejected alternatives

- **Pure hooks-based runtime resolution** (a plugin intercepts every model pick /
  limit check): rejected — apps/ai loads no plugin code, satellites never could,
  and per-request hook fan-out adds latency for nothing the materialized row
  can't do.
- **Forked UI builds** (separate hosted UI without the settings screens):
  rejected — one UI that renders governance state keeps open/hosted from
  drifting; build-time stripping remains available via the hook engine as a
  hardening layer, not as the mechanism.
- **A monolithic `EDITION=managed` env flag**: rejected — governance must be
  per-tenant (mixed fleets: some tenants on enterprise self-govern models, some
  on free don't), so it belongs in the entitlement resolver, not the process env.

## 6. Open questions for Matthias

1. Governance default for hosted **models** domain: tenant-picks-within-allow-list
   (recommended) or fully platform-pinned?
2. Should tenant admins in managed mode see their `hard_limit` value, or only
   "included in your plan" framing? (Doc assumes: show everything, read-only.)
3. `ENGENTY_GATEWAY_MANAGE_ENABLED` default on main reads **true** in code
   (`prod-gateway.ts` envBoolean default) while deploy files pin false — verify
   which is intended before hosted rollout.
4. Landing strategy for tenant-box (rebase vs cherry-pick extraction) — phase 3
   assumes extraction of entitlements first, manage app later.
