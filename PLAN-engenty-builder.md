# PLAN: engenty.builder — coder Version B (AgentOS + Pi) and Version C (shared-SaaS lite apps)

Status: PLANNED 2026-07-25. Companion to `PLAN-engenty-coder.md` (Version A: Mastra-native coder on the
Docker sandbox — built on `feat/coder`, 5 phases committed, not merged). This document scopes:

- **Version B — "a Lovable inside engenty":** a builder module for **trusted, private installations**
  (local or dedicated Tier B satellite — never shared SaaS) that lets the tenant extend their own
  engenty with **MCP Apps and full modules** (server plugin + own DB schema included), powered by
  **Pi running on AgentOS**, orchestrated by engenty (tasks/goals), behind a hard credential wall.
- **Version C — lite apps for shared SaaS:** what "user-built apps" can mean when NO tenant-authored
  code may execute server-side: widgets/artifacts, MCP apps, skills, a2ui — with a data-story ladder
  (none / file / libSQL-in-browser / scoped kv / external) and an explicit list of safe surfaces.

Related documents this builds on (read them, don't re-derive):
- `PLAN-engenty-coder.md` — Version A. Repo checkout provisioning, GitHub connector, review card,
  `scaffoldEngentyModule`, coder skills. Version B **reuses** most of it.
- `/Users/m/.cursor/plans/evaluate_agentos_3ff88952.plan.md` — AgentOS as a gated third sandbox
  provider. Its four decision gates (HITL durability across apps/ai restart, security review, tenant
  metering, Python compat) apply to B unchanged. Its rule "agents stay on Mastra — never AgentOS ACP"
  remains true **for existing engenty agents**; Version B introduces ACP only for the *guest coding
  brain* (Pi), which is deliberately outside engenty's agent framework (see B-Arch).
- `PLAN-where-work-lives.md` — containment hierarchy; builder runs ride the same Task seams.
- Tenancy tiers (spike/tenant-box, shipped v0.1.68/69): Tier A shared platform, Tier B per-tenant
  satellites, `apps/manage`, entitlements-materialized policy.

---

## The one-sentence split

| | A (built) | B (this plan) | C (this plan) |
|---|---|---|---|
| Where it runs | any install | **private install only** (local / Tier B) | shared SaaS |
| Coding brain | Mastra agent (engenty.coder) | **Pi on AgentOS** (untrusted guest) | Mastra agent (existing) |
| Sandbox | Docker (`engenty-sandbox`) | AgentOS VM (V8 + WASM, persistent FS) | none needed (authoring only) |
| Output | PRs against external repos | **installable engenty modules + MCP apps** | widgets / a2ui / skills / MCP-app configs |
| Output runs | wherever the repo deploys | **inside this engenty install** (after approval) | browser iframe / beside engenty |
| DB for output | n/a | per-module Postgres schema in the tenant DB | none / file / libSQL-wasm / scoped kv |

---

# Version B — engenty.builder (trusted private installs)

## B-Goal

The tenant (or their agents) says "build me a returns-management module" → a builder task is created →
Pi implements it in an AgentOS workspace using engenty authoring doctrine → validation runs → a human
reviews the diff → on approval the module is **installed into this engenty installation** (plugin
registered, migrations applied, schema exposed, UI plugin loaded) → it's live. Same loop for MCP apps,
minus the install step (they run beside engenty).

Because module code executes **inside the engenty core process** (jiti-loaded plugin factory, DB
adapter in hand), this is only offerable where the blast radius is the tenant's own dedicated stack:
- **local install** (desktop / self-hosted docker), or
- **Tier B satellite** (dedicated core+DB per tenant).

Gate it with entitlements (precedent: time-tracking is PRO-only; manage app is tier-gated). The module
refuses to activate on Tier A: an entitlement key like `builder.enabled`, materialized per-tenant,
default off, settable only from `apps/manage`.

## B-Answer: the Lovable database question

**No dedicated Supabase per app.** Lovable provisions one backend per app because its apps are
homeless — they have no platform to live in. Engenty apps do: 

1. **The "dedicated backend per tenant" already exists — it's Tier B.** A private installation *is*
   one dedicated Postgres + core + AI stack per tenant. That's the correct isolation unit.
2. **Per-app isolation inside that DB is the module schema.** Every module gets its own
   `module_<name>` schema, own migrations (aggregator + `supabase-sync.mjs`), own PostgREST exposure,
   RLS, and grants. That's "a backend and db (own schema)" for free, with shared auth, shared
   realtime, one backup, one connection pool.
3. **Escape hatch:** a generated module that genuinely needs an external store declares a connection
   via platform-settings/secrets (existing tenant-credential override machinery) — the builder's
   doctrine should treat this as exceptional, not default.

So: recommend **one DB per tenant (Tier B), one schema per app** — not one DB per app. Revisit only
if a tenant wants hard resource isolation between their own apps (unlikely; and satellites can always
be split further).

## B-Arch: three tiers, one wall

AgentOS's own trust model maps cleanly (Client / Sidecar / Executor):

```
┌─ engenty (trusted) ──────────────────────────────────────────────┐
│ apps/ai + modules/engenty-builder (the CLIENT)                   │
│  • holds ALL credentials (actor token, git token, DB)            │
│  • orchestrates via tasks/goals (Mastra stays the orchestrator)  │
│  • builder-broker MCP server (scoped engenty capabilities)       │
│  • ACP event pump → task comments / chat stream                  │
└───────────────┬──────────────────────────────────────────────────┘
                │ AgentOS SDK (AgentOs.create / session / vm)
┌─ SIDECAR (TCB) ──────────────────────────────────────────────────┐
│  policy enforcement: AgentOsLimits — network allowlist,          │
│  tool permissions, resource caps                                 │
└───────────────┬──────────────────────────────────────────────────┘
┌─ EXECUTOR (untrusted guest) ─────────────────────────────────────┐
│  persistent POSIX FS · node/shell · git (meta-packages)          │
│  Pi coding agent (via ACP) — sees code, docs, tests.             │
│  NEVER sees: engenty tokens, git credentials, DB URLs.           │
└──────────────────────────────────────────────────────────────────┘
```

**The credential wall (non-negotiable, from the design constraint "the pi agent should NOT have
engenty credentials / access token — it should code, not run engenty"):**

1. **No engenty secret ever enters the Executor** — not in `env` of `CreateSessionOptions`, not in
   files, not in MCP server configs passed to Pi. Assume Pi (and anything the repo's own code prints)
   can read every byte inside the VM.
2. **Engenty access is capability-brokered, not credentialed.** Pi's `mcpServers` entry points at the
   **builder-broker** — an MCP server hosted on the *Client* side (loopback through the sidecar). The
   broker holds a **delegated actor token** (reuse core `POST /api/auth/actor-token`, the
   engenty-remote machinery — `apps/core/src/api/routes/auth/actor-token-routes.ts`) and exposes a
   curated allowlist. Pi calls `task_get`/`task_comment`/`goal_get`/`artifact_put`/`builder_validate`
   *as tools*; the broker executes them with credentials Pi never sees. Writes ride the existing
   durable tool-approval flow (v0.1.66) where policy says so. This is how "Pi is controlled via
   engenty as an orchestrator" coexists with the wall: **capabilities out, credentials never**.
3. **Git credentials never enter the Executor — stricter than Version A.** Version A injected
   `GIT_CONFIG_*` env per provisioner-run command; in B the guest is running an autonomous agent that
   could plant hooks/aliases to exfiltrate a later credentialed exec. So:
   - Clone-in: Client fetches on the trusted side, produces a `git bundle`, writes it into the VM
     (`vm.writeFile`), guest-side `git clone repo.bundle` (no creds needed).
   - Push-out: guest commits locally; Client reads a bundle out (`vm.exec("git bundle create …")` +
     `vm.readFile`), verifies it (`git bundle verify`, ref allowlist `refs/heads/builder/*`), and
     pushes from a **trusted throwaway checkout** using Version A's `gitCredentialEnv`. No
     credentialed command ever executes inside the VM.

**Why ACP here doesn't violate "Mastra — never AgentOS ACP":** that rule protects engenty's agent
framework — governance, memory, attribution, approvals all live in Mastra, and engenty agents are not
being ported to another framework. Pi is not an engenty agent. It's an untrusted *tool* the builder
module drives, exactly like Docker is an untrusted place code runs. ACP is the wire protocol to that
tool; Mastra remains the only orchestrator, and every governed action still flows through
Mastra/gateway (via the broker) with engenty identity and approvals attached.

## B-Skills: teaching Pi to build engenty

Pi learns from files, so the Client **materializes doctrine into the workspace FS before the session
starts** (`vm.writeFile`), no prompt-stuffing:

- `/workspace/AGENTS.md` — builder doctrine (adapted from Version A's AGENTS.md: work only in the
  repo, the project's own checks are the arbiter, delivery is a bundle for review — never push).
- `/workspace/docs/engenty/` — rendered from the Version A skills + generators:
  - `module-authoring.md` (from `coder-module-authoring` SKILL.md): plugin manifest, `defineModuleAi`,
    migration rules (timestamp-collision gotcha!), schema/zod/DAL layering, gateway-op exact-list
    tests, UI plugin entry + `generate:plugins`.
  - `mcp-app-authoring.md` (new): MCP server skeleton, `mcp-app-frame` integration contract.
  - `a2ui.md` (new): the component catalog + `validateEngentyA2uiComponents` rules.
- A fresh scaffold from `scaffoldEngentyModule` (Version A P5) as the starting tree for module tasks.
- `additionalInstructions` in `CreateSessionOptions` for the short mandate; `skipOsInstructions`
  stays default. *(VERIFY exact option names against the pinned agentos-sdk version at build time.)*

Doctrine content is generated from the same sources Version A uses — one source of truth; B renders
it to files instead of loading it as Mastra skills.

## B-Loop: the Lovable loop, engenty-shaped

1. **Intent → Task.** User (chat) or agent (goal decomposition) creates a builder task. Reuses
   Version A's repo binding (`tasks.repo_full_name`/`repo_base_ref`) when extending an existing repo;
   for a brand-new module the task carries the module name and the builder creates the repo
   (standalone repo per module — Version A P5 decision; GitHub connector `repo_create` is a small
   connector addition).
2. **Session.** Builder opens/resumes the AgentOS session keyed by task id (persistent FS = warm
   re-dispatch), materializes doctrine + bundle-clone, `session.sendPrompt(brief)`.
3. **Stream.** ACP events pump into: (a) task comments (headless), (b) the chat stream as tool
   data-parts when a user is watching (`builder_delegate` tool on a thin Mastra front-agent), (c) an
   artifact transcript for audit. Engenty's HITL stays possible mid-run: broker tools can suspend on
   approval exactly like any gateway op.
4. **Validate.** Guest-side: typecheck, unit tests, biome — the repo's own checks. Broker-side
   `builder_validate` op: Client pulls the bundle and runs *trusted* checks outside the VM —
   `checkPluginManifest`-style strict manifest validation, migration-prefix collision check against
   the installed set, boundary checks (`check-module-boundaries.mjs`), dependency allowlist (no
   arbitrary postinstall scripts). Results go back to Pi as tool output; it iterates.
5. **Deliver.** Bundle-out → trusted push → PR (Version A `github_pr_create`, approval-gated) →
   review card (`buildCoderReviewCard`, upgraded to an artifact per the pending Version A follow-up).
6. **Install (the new step).** On human approval, the builder invokes the **A4 install surface**:
   `engenty modules add <package>` (CLI `scripts/engenty-cli.mjs modules add`, registry source in
   `engenty.plugins`) — publish to the tenant's registry scope first (A5 flow, GitHub Packages), or
   add a `path`/`bundle` source variant to `engenty.plugins` for the tight local loop (small A3
   extension; the resolver already handles multiple sources). Then: aggregate migrations → apply →
   PostgREST schema exposure (the known manual-PATCH gotcha on cloud Supabase — satellites are
   self-hosted, automatable) → `generate:plugins` for the UI entry → **coordinated restart** of
   core/ai/ui. Restart orchestration is the genuinely new machinery: on local installs a supervisor
   step; on satellites a manage-app deploy hook.
7. **Use.** The module is a first-class citizen: own schema, gateway ops, agent faces, UI pages.
   Other agents can call its ops the moment it's enabled — which is the whole point: **apps built by
   the builder are usable by users AND agents inside engenty**.

MCP-app track is the same loop minus step 6: the app is started as a long-lived process on the tenant
box (or an on-demand AgentOS actor for light JS servers), and registered as an engenty MCP connection
with its own scoped auth. Faster to ship, lower risk — do it first (B6 before B7 below is
deliberately ordered app-then-module).

## B-Phases

- **B1 — AgentOS foundation (gated).** Pin the SDK; stand up sidecar/executor in the private-install
  topology (never on the shared AI host — evaluate_agentos rule); wire `AgentOsLimits` (network:
  registry mirrors + nothing else; FS quotas). Run the four evaluate_agentos decision gates. Exit
  criterion: a Pi session survives an apps/ai restart with work recoverable from FS+git.
- **B2 — builder-broker.** `modules/engenty-builder/src/broker/`: MCP server (stdio or
  loopback-HTTP), actor-token minting + scope allowlist, tool set v1 (`task_get`, `task_comment`,
  `goal_get`, `artifact_put`, `builder_validate`), approval wiring. Unit-testable without AgentOS.
- **B3 — session lifecycle + streaming.** Session-per-task, doctrine materialization, bundle
  clone-in, ACP pump → comments/chat/artifact. `builder_delegate` Mastra tool for interactive runs;
  task-job step variant for headless runs (same dispatch seams as Version A — reconcile with
  where-work-lives when it lands).
- **B4 — delivery.** Bundle-out + verify + ref allowlist + trusted push; PR + review-card artifact.
  Reuses Version A Phases 1/2/4 code nearly verbatim.
- **B5 — trusted validation.** `builder_validate` server side: strict manifest check, migration
  collision scan, boundary/dependency policy. This is the security-relevant reviewer's assistant.
- **B6 — MCP-app track.** Authoring doctrine + hosting (tenant box process or AgentOS actor) +
  auto-registration as a connection. First end-to-end "user extends engenty" milestone.
- **B7 — module install loop.** `path`/`bundle` plugin source, publish-to-tenant-scope, migration
  apply + exposure automation, restart orchestration, manage-app approval surface, entitlement gate.
- **B8 — hardening.** Metering (tokens + VM time per tenant), quotas, kill-switch, audit artifacts,
  red-team pass on the broker (prompt-injection from repo content is *expected* — the wall, ref
  allowlist, and trusted validation are the containment).

## B-Risks

- **Native toolchains:** AgentOS's V8+WASM guest can't run browsers/node-gyp/compilers. Modules that
  need them fall back to Version A's Docker path (per-task provider selection — the coder.ts comment
  already points there). Doctrine tells Pi to keep generated modules toolchain-light.
- **Executor FS durability** is host-process-bound → git/bundles are the only source of truth;
  sessions must be reconstructable (B1 exit criterion).
- **Install blast radius:** a bad module can take down the tenant's core at boot. Mitigations:
  trusted validation (B5), staged enable (install disabled → health-check boot in a canary process →
  enable), one-command rollback (`plugins` disable + migration repair playbook), and — structurally —
  it's the tenant's own dedicated stack, never shared infra.
- **Broker = the attack surface.** Keep the tool allowlist tiny and versioned; every write approval-
  gated by default; actor token minimal-scope + short-lived; broker treats ALL Pi input as untrusted.

---

# Version C — lite apps in shared SaaS

## C-Constraint

On Tier A, tenant-authored code **never executes inside engenty's server processes**. Everything in C
follows from that single rule. What remains is a surprisingly capable ladder — because the runtimes
already shipped:

## C-Ladder: app kinds, lightest first

1. **Skill** — a SKILL.md the user/agent authors. "App" = new agent behavior. Pure text, zero code
   execution, already installable per-module; needs only an authoring/gallery surface. *Cost: ~0.*
2. **a2ui card** — declarative UI (`show_ui`, `packages/a2ui-catalog`,
   `validateEngentyA2uiComponents`). Forms/dashboards/actions with NO code at all; actions route
   through governed gateway ops as the user. *Cost: ~0, needs saved/named-card surface.*
3. **Widget app (the core "little app")** — self-contained HTML persisted as an artifact
   (`created_by_kind` provenance), rendered by `show_widget` in the sandboxed iframe: CSP
   `default-src 'none'`, opaque origin, no `allow-same-origin`, **network blocked**. Runs
   client-side, in the viewing user's browser, under **that user's** credentials via the widget
   bridge ("as far as the user" — the bridge is the permission boundary). Safe to run without review
   because both walls (iframe + bridge scoping) are platform-owned.
4. **MCP app** — the app is an external process the tenant hosts (their infra, their cost), engenty
   is the client via `mcp-app-frame` + a scoped connection. This is the "I need a real backend"
   answer on shared SaaS: the backend exists, it's just **theirs**, reached through the connections
   framework with per-action policies.

Explicitly **not** on Tier A: server plugins, own DB schemas, gateway ops, cron/routine hooks,
anything jiti-loaded. Those are exactly what Version B + Tier B are for — and the upsell path is
clean: "your app outgrew a widget → move to a private install, the builder turns it into a module."

## C-Data: the db-story for widgets

| Option | How | Persistence | When |
|---|---|---|---|
| none | state in iframe memory | none | calculators, viewers |
| **file-based** | widget bridge → workspace file storage / artifact update | per-tenant, user-scoped, already exists | most little apps — **default** |
| **libSQL (in-browser)** | libsql/sql.js **WASM inside the iframe** (bundled into the self-contained HTML — no CDN, network is blocked); DB image loaded from / saved to a workspace file via the bridge | real SQL, file-backed | list/CRUD apps that want queries; ship as a template |
| scoped kv/table | NEW small bridge API: `app_data` (tenant_id, app_id, scope user\|tenant, key, jsonb) in a platform schema, namespaced + quota'd | server-side, governed | shared-between-users app state |
| external | via an MCP app or connection-brokered bridge call — **never** direct fetch (iframe network is blocked by design; keep it that way) | theirs | real backends |

The libSQL-wasm-persisted-to-a-workspace-file combo is the sweet spot: real database ergonomics,
zero server surface, still inside both walls.

## C-Surfaces: what the bridge may safely expose

Everything below executes with the **viewing user's** session — the widget can never do more than
the user could:
- workspace files read/write (exists), artifact read/update-own (exists)
- `app_data` kv (new, C3) with per-app namespace + size/row quotas
- invoke a **user-approved allowlist** of gateway ops (declared in the app manifest, consented once
  at first run — like OAuth scopes; the connections per-action policy model reused one level up)
- `sendPrompt`-style handoff to chat (exists in spirit via MCP-Apps)

Never: raw fetch, credentials of any kind, other users' scope, tool surfaces the user lacks.

## C-Builder-lite

No AgentOS, no new sandbox: the **existing** assistant/coder authors these apps — an
`app-authoring` skill (templates: plain widget, libsql-wasm widget, a2ui card, MCP-app skeleton,
manifest format) and it writes the artifact directly; optionally a Docker-sandbox lint/test pass for
quality. Authoring is safe everywhere because **running** is what's gated, and these kinds run inside
platform-owned walls.

## C-Phases

- **C1 — App identity + gallery.** An `app` manifest marker on artifacts (name, icon, kind, declared
  scopes), a tenant App Gallery page (list/launch/pin), launch-in-chat and launch-as-surface.
  Provenance + share gates ride existing artifact machinery.
- **C2 — Authoring.** `app-authoring` skill + templates (incl. the libsql-wasm template with the
  bridge save/load harness), publish flow with provenance, "remix" (copy + edit) support.
- **C3 — `app_data` + scoped-op consent.** The kv surface with quotas; manifest-declared op
  allowlist + first-run consent card; per-app usage metering.
- **C4 — MCP-app polish.** Guided "register your hosted app" flow (connection + frame config),
  health indicator, doc for the Version-B upgrade path.

C1+C2 are days-not-weeks — every runtime primitive already shipped; this is mostly identity, gallery,
and doctrine. C3 is the only new server surface and it's deliberately tiny.

---

## Recommendation & sequencing

1. **Version C first** (C1–C2): cheapest, works for every tenant today, exercises the app-identity
   and gallery concepts B will reuse for its review/install UX.
2. **Version B behind the evaluate_agentos gates**, MCP-app track (B6) before module install (B7);
   land where-work-lives and rebase/land Version A's `feat/coder` first — B reuses its connector,
   repo plumbing, review card, and scaffold generator directly.
3. Keep Version A as the general-purpose repo coder for external codebases and native-toolchain work;
   A, B, C are one product ladder, not competitors.

## Open questions for Matthias

1. Entitlement naming/tier for B (`builder.enabled` on which package tier?) and whether local
   (desktop) installs get it by default.
2. Tenant registry scope for generated modules: reuse `@engenty` GitHub Packages with per-tenant
   naming, per-tenant scopes, or skip publishing entirely for local installs (`path` source only)?
3. B restart orchestration on satellites: is a manage-app-triggered redeploy acceptable v1, or do we
   need in-place plugin (re)load?
4. C3 consent UX: is manifest-declared-ops-with-first-run-consent the right model, or should v1 stay
   bridge-files-only (no gateway ops from widgets at all)?
5. Pi licensing/pinning and the AgentOS SDK version policy for private installs.
