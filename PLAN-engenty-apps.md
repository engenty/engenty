# PLAN — engenty Apps

Tenant-owned applications with a frontend, a backend, and their own local storage. Authored by an
engenty agent, stored in the tenant, rendered as an artifact, used by `engenty.copilot`
interactively and by `engenty.coordinator` headlessly.

This plan stands alone. It supersedes `PLAN-engenty-builder.md` (Versions B and C) and does not
depend on `PLAN-engenty-coder.md` or the unmerged `feat/coder` branch. Every claim about the
current codebase below was verified on main on 2026-07-25 and carries a `file:line` anchor.

---

## 1. What an App is

An **App** is a tenant-scoped unit with four parts:

| Part | Where it runs | Where it lives |
| --- | --- | --- |
| **Frontend** | opaque-origin sandboxed iframe in the engenty SPA | one inlined HTML document, built from source |
| **Backend** | V8 isolate + WASM kernel inside an agentOS VM | `@rivet-dev/agentos-apps`, hosted by a new internal service |
| **Local storage** | per-app SQLite in the app's own actor | the app host |
| **Definition** | — | `module_apps` in the tenant Postgres (source of truth) |

An App is *code*, not a declarative definition. Its rules and evaluations are plain JavaScript.
There is no DSL, no rules engine, and no form-builder — those would be a badly-built programming
language, and an agent authors this code anyway.

**Runtime dependency:** `@rivet-dev/agentos-apps` (Apache-2.0, `0.2.14`, published 2026-07-25,
labelled preview). API: `setupApps()` supplies actor definitions, `deployApp({appId, source|files})`
builds and activates an immutable release, `appsRouter` routes HTTP to it. Builds happen in a
disposable build VM; releases are bundled JS + WASM + static assets. Source and release chunks live
in a stable app actor's SQLite. Scaling defaults `minReplicas: 0, maxReplicas: 128,
targetConcurrency: 8`; ~22 MB RAM per app. Guest VMs receive opaque app-scoped capabilities and
host management tokens are never exposed inside them.

The repo currently has **zero** Rivet dependencies — `rivetkit`, `@rivet-dev/*`, `actor-core` do not
appear in any `package.json` or in `pnpm-lock.yaml`. The existing VM sandbox is
`@earendil-works/gondolin@0.12.0` (`apps/ai/package.json:25`) and is a *different* thing: it executes
agent commands, it does not serve HTTP. agentOS Apps is not a sandbox provider and must not be
wedged into `apps/ai/src/ai/sandbox/`.

### Non-goals

- **Not engenty's spine.** Mastra + Postgres keep owning agent state, threads, runs and identity.
  Rivet Actors host tenant apps only.
- **No public origin per app in v1.** No wildcard DNS or TLS exists anywhere in this repo
  (`deploy/`, `docs/` — zero hits), and the production gateway is single-origin path-based.
- **No cross-tenant marketplace.** Apps are tenant-scoped; sharing is a later question.
- **No git, no repo checkout, no external coding agent.** Authoring an App is writing a handful of
  files, validated by a build. It needs none of Version A's GitHub machinery.

---

## 2. Verified state of the world

### 2.1 The AI service is a Hono app with a clean route seam

`apps/ai/src/app.ts:159` creates `new Hono<...>()`; `createApp` registers one
`registerXRoutes(app, deps)` per group (`app.ts:369-692`), and `new MastraServer({app, mastra, prefix:
AI_BASE_PATH})` is grafted on last at `app.ts:810-815`. New routers mount before that line.
`AI_BASE_PATH = "/ai"` (`apps/ai/src/config/constants.ts:5`). Canonical minimal example:
`apps/ai/src/api/work-files-routes.ts:58-117`.

Browser auth: `appsAiRequestHeaders()` sends only `Authorization: Bearer <supabase session JWT>`
(`packages/ai-ui/src/ag-ui/apps-ai/apps-ai-api.ts:37-46`). There is **no global auth middleware** —
`app.ts:233-239` only stashes the bearer in an ALS and calls `next()` even when absent. Each route
calls `resolveScope(c, resolver)` (`apps/ai/src/api/http.ts:38-69`), which resolves tenant + user by
asking core `GET /api/users/setup/context` (`http.ts:71-147`), cached 60s
(`core-http-client.ts:168-172`).

### 2.2 Actor tokens are full user-equivalent bearers — do not give one to an App

`apps/core/src/api/routes/auth/actor-token-routes.ts` mints a token whose `capabilities` are the
**target user's full grants** (`:125-128`), with `scopes: []`, `module_ids: []`, `permissions: []`
(`:138-152`), TTL clamped to 60–900s (`:33-35`). It is validated by the ordinary
`verifyAccessToken` (`apps/core/src/security/auth.ts:115-183`) with no actor-specific check.

The only two subsetting checks that exist — `moduleIds` and `scopes` in
`apps/core/src/security/policy.ts:60-66` — are disabled by empty arrays, and `scopeId` is never even
passed into `evaluatePolicy` (`module-operation-routes.ts:583-594`). `delegation_chain` is written
but never read by any authorization code.

**Definitive: there is no server-side mechanism restricting a caller to a declared set of operation
ids.** Everything named "grant" in the codebase *widens* (bypasses approval), never restricts:
`approvalGrants`, `core.agent_goal_grants`, `module_tasks.tasks.approval_grants`. Remote channels
already rely on this full-user-equivalence — apps/ai holds a cached actor token per `tenant:user`
(`apps/ai/src/api/remote-channels.ts:99-151`) and it can do anything that user can.

**Consequence for this plan:** an App never receives an engenty token of any kind. Engenty access is
mediated by a platform-owned proxy that enforces a per-app allowlist. See §4.

### 2.3 The gateway is single-origin and path-based — which is a trap for apps

`apps/core/src/api/gateway-paths.ts:41-66` maps path prefixes to
`"ai" | "docs" | "manage" | "studio" | "ui" | null`; production terminates TLS at Coolify/Traefik and
forwards everything to `engenty-edge:8787` (`deploy/DEPLOY.md:15`). Only `engenty-edge` publishes a
port (`deploy/docker-compose.yaml:33-34`); every other service is reached by Docker DNS on the
internal `engenty` bridge network (`:192-194`).

Serving tenant-authored HTML on the main origin would make it same-origin with the engenty SPA and
therefore able to read the Supabase session out of `localStorage`. **Apps are never served on the
platform origin.** v1 avoids the problem entirely: the app host publishes no port and is not added
as a gateway target.

### 2.4 Artifacts are the right record for an App instance

`ai.artifact` (`apps/core/supabase/migrations/20260713163800_ai_artifacts.sql:11`) has
`type`, `title`, `scope_type check in ('thread','task','project','goal')`, `scope_id`, `thread_id`,
`created_by_kind check in ('agent','user')`, `current_version`, `metadata jsonb`, `status`.
`ai.artifact_version` (`:39`) carries `content text` with `unique (artifact_id, version)` as the
concurrency gate. Inline content cap is **262 144 bytes** (`artifact-store.ts:22`, HTTP 413
`artifacts.contentTooLarge`). Realtime broadcasts inserts on `ai.artifact` only
(`20260713163900_ai_artifacts_realtime.sql:15-29`).

Types are a closed enum `["markdown","html","table"]` (`apps/ai/src/ai/artifacts/artifact-types.ts:47`)
but rendering is an open registry: `registerArtifactRenderer` / `resolveArtifactRenderer`
(`packages/ai-ui/src/artifacts/artifact-renderers.tsx:24-64`), dispatched at
`artifact-pane.tsx:114-115`. Agents create via tools `artifact_create` / `artifact_update` /
`artifact_get` / `artifact_list` / `artifact_store` (`apps/ai/ai/tools/artifact-tools.ts:53-251`) —
note there is no `artifact_version` tool — and open the pane via the **frontend** tool
`show_artifact` (`modules/engenty-copilot/ai/frontend-tools/show-artifact/definition.ts:7`).

**There is no per-artifact key/value or state store.** The only writable JSON is
`ai.artifact.metadata`, reachable solely through `ArtifactStore.mergeMetadata`
(`artifact-store.ts:351`), which no route or tool exposes. An interactive HTML artifact today has
nowhere to persist working state except rewriting the whole `content` string.

### 2.5 The bridge exists, in the wrong place

`packages/ai-ui/src/components/copilot/tool-call/mcp-app-frame.tsx` is a working MCP Apps host
(spec `io.modelcontextprotocol/ui`, rev 2026-01-26): sandboxed `srcdoc` iframe with an opaque
origin (`sandbox="allow-forms allow-popups allow-scripts"`, `:260`), MCP JSON-RPC over postMessage,
`ui/initialize` / `ui/notifications/*` / `tools/call` / `ui/open-link` /
`ui/request-display-mode` / `ui/notifications/size-changed` / `ping` (`:173-249`), per-widget CSP over
a `default-src 'none'` base (`buildWidgetCsp:54-66`), height clamped 120–640 (`:34-36`).

It is reachable **only** from the transcript, via the `_meta.engenty.mcp_app` tool-result marker
(`readMcpAppMeta` at `mcp-app-tool-call-card.tsx:32-84`). The artifact pane's `html` renderer
(`artifact-renderers.tsx:82-91`) uses the same sandbox attributes but has **no bridge at all**.

Closing that gap — a bridged frame in the pane — is the single highest-value piece of frontend work
in this plan.

`/ai/mcp-apps/call` (`apps/ai/src/api/mcp-app-routes.ts:62`) shows the proxy shape to copy: resolve
scope from the user's own JWT (`:63-66`), validate the target, forward. Its known weaknesses to *not*
inherit: server-URL granularity only, so a widget may call any tool on any other server registered
to the same tenant (`:104-110`), and no per-tool allowlist anywhere in the route.

### 2.6 Governance, gating and tool reach already have shapes to copy

- **`agent_propose`** — `ai.engenty_ai_agents` gains `status check in ('proposed','active','archived')`,
  `proposed_config jsonb`, `created_by_agent`
  (`apps/core/supabase/migrations/20260722130000_ai_agent_registry_governance.sql:11-29`); store
  transitions `proposeAgent` / `approveAgent` / `rejectAgent`
  (`apps/ai/src/dal/registry/registry-store.ts:201-361`); UI
  `packages/ai-ui/src/features/agent-proposals/agent-proposals-card.tsx:21`, mounted at
  `overview-page.tsx:60`. **Bug not to copy:** `requireAgentAdmin` guards only
  `PATCH /ai/registry/agents/:id` (`registry-routes.ts:327`) — propose/approve/reject are gated by
  `resolveScope` alone, listed as outstanding in `docs/internal/ai-governance.md:198`.
- **Feature flags** — `server.registerFeatureFlags([...])` in a module's `plugin.ts`
  (`modules/team-hr/src/plugin.ts:46-54`), key regex
  `^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$` (`packages/feature-flags/src/catalog.ts:3`), precedence
  tenant > package > global > default (`packages/feature-flags/src/merge.ts:11-29`), UI via
  `useFeatureFlag` / `FeatureGate` (`packages/ui-plugin-sdk/src/feature-flags.tsx:68-86`).
- **PRO gating** — module absent from a package's `modules` list ⇒ tenant activation blocked with
  `package_module_not_licensed` (`apps/core/src/plugins/capability-resolver.ts:276-291`); build-side
  exclusion via `CLOSED_PREFIXES` in `scripts/publish-open.sh:44`.
- **Tool reach** — once `engenty_tool_execute` is attached, an agent can reach the whole tenant
  catalog, bounded only by token capabilities server-side. So a new module operation is
  automatically reachable by copilot and coordinator with **zero** agent-assembly changes.
  Operation risk is declared per op (`requiredCapabilities`, `riskLevel`, `requiresApproval` —
  `modules/tasks/src/api/gateway-methods.ts:75-91`), and the durable approval flow already carries
  headless runs (`apps/ai/src/ai/jobs/task-job-steps.ts:185-205`,
  `modules/tasks/src/api/task-approval-service.ts:87-190`).

---

## 3. Architecture

```
  Browser (engenty SPA, platform origin)
  ├─ artifact pane
  │   └─ <AppFrame>  opaque-origin sandboxed iframe, srcdoc = inlined app HTML
  │        │  MCP JSON-RPC over postMessage  (no cookies, no platform origin, no tokens)
  │        ▼
  └─ POST /ai/apps/:appId/call        ← user's own Supabase JWT, resolveScope()
         │
         ▼
  apps/ai  (Hono)
  ├─ app-proxy-routes.ts
  │    1. resolve tenant+user from the caller's JWT
  │    2. load the app's manifest allowlist  (module_apps)
  │    3. dispatch:
  │         action  → app host  (internal, server-to-server)
  │         engenty → core gateway with the *caller's* token, op ∈ allowlist
  │    4. audit
  ▼
  apps/app-host  (new service, no published port, internal DNS only)
  ├─ Hono + setupApps() + appsRouter        @rivet-dev/agentos-apps
  └─ per app: agentOS VM (V8 isolate + WASM kernel) + its own SQLite
       │  backend → engenty needs no browser: opaque capability handle
       ▼
  POST /ai/apps/:appId/call  (handle resolves to user+app+allowlist at the proxy)
       │
       ▼
  apps/core  gateway → module operations → tenant Postgres (RLS)
```

Three properties this buys, each of which was a hand-built page in the previous plan:

1. **The app never holds a credential.** The browser carries the user's own JWT; the backend carries
   an opaque handle that is worthless anywhere except at engenty's own proxy.
2. **The app has no origin.** No cookies, no `localStorage` reachable, no CORS, no wildcard TLS, no
   gateway target.
3. **Postgres is the record, the app host is the runtime.** `module_apps` holds source and manifest;
   losing all actor state means redeploying, not losing an app. The one genuine exception is app
   *data* in per-app SQLite — hence the snapshot duty in Phase 7.

---

## 4. The capability wall

Three call directions, three different mechanisms. No token is ever shared across them.

**(a) Frontend → app backend.** The iframe issues MCP `tools/call` over postMessage. The host frame
forwards to `POST /ai/apps/:appId/call` with the *viewing user's* JWT. The proxy resolves scope, then
calls the app host server-to-server. The browser never learns the app host's address.

**(b) Frontend or agent → engenty.** Same route, `kind: "engenty"`. The proxy intersects the
requested `operation_id` with the app manifest's declared `engenty.operations`, then invokes core
with the **caller's own token** via `EngentyCoreClient.invokeTool`. Undeclared op ⇒ 403. This is what
"the app connects using the user's auth" means concretely: the user's identity, the app's declared
subset, enforced server-side, never delegated.

**(c) App backend → engenty.** The backend has no browser and must not have a bearer. On each
invocation the proxy mints an **opaque capability handle**: 32 random bytes, stored hashed in
`module_apps.app_capability` with `(tenant_id, app_id, user_id, allowed_operations text[],
expires_at, revoked_at)`, TTL ≤ 300s, single-purpose. The handle is injected into the guest as an
app-scoped capability — which is precisely agentOS's own model — and is only accepted at
`/ai/apps/:appId/call`, where it resolves to `(user, app, allowlist)`.

The handle **must not be a JWT signed with `ENGENTY_SECURITY_JWT_SECRET`**: `verifyAccessToken`
(`apps/core/src/security/auth.ts:115-183`) accepts any HS256 token carrying `tenant_id` + `sub` as an
ordinary access token, so a signed handle would be a full session token by accident. Opaque +
hashed row also gives revocation, which JWTs here do not (only `jti` revocation exists).

**Consent.** First time a user runs an app, the declared operation list is shown and confirmed once,
recorded per `(tenant, app, app_version, user)`. A new version with a widened allowlist re-asks. Read
ops (`riskLevel: low`) ride the consent; anything `requiresApproval` still goes through the existing
approval flow unchanged — no new bypass is introduced.

---

## 5. Data model

New module `modules/engenty-apps`, schema `module_apps` (migration named
`<ts>_plugin_module_apps.sql`, schema exposed in `supabase/config.toml`, aggregated by
`scripts/aggregate-module-migrations.mjs:82-96`):

- **`apps`** — `id`, `tenant_id`, `slug`, `name`, `description`, `status check in
  ('draft','active','archived')`, `active_version_id`, `created_by_kind check in ('agent','user')`,
  `created_by`, timestamps. Unique `(tenant_id, slug)`.
- **`app_versions`** — `id`, `app_id`, `tenant_id`, `version int`, `manifest jsonb`, `files jsonb`
  (path → source text), `status check in ('proposed','active','archived')`, `build_log text`,
  `deployed_at`, `created_by_kind`, `created_by`. Unique `(app_id, version)` as the concurrency gate,
  mirroring `ai.artifact_version`.
- **`app_capability`** — as §4(c).
- **`app_consent`** — `(tenant_id, app_id, app_version, user_id, operations text[], granted_at)`.
- **`app_data`** — the App's own working store, standing in for the per-app SQLite that agentOS Apps
  cannot yet provide (§9a). `(tenant_id, app_id, session_id, key, value jsonb, updated_at)`, unique
  `(tenant_id, app_id, session_id, key)`, RLS-scoped like every other module table, reachable only
  through the proxy as `kind: "data"`. The app-facing API is deliberately a narrow
  `get/set/delete/list` over `(session_id, key)` so the backing store can become per-app SQLite later
  without changing a single App.

**Manifest** (`app_versions.manifest`), validated by zod at the write boundary:

```jsonc
{
  "name": "Travel expenses",
  "entry": { "frontend": "index.html", "backend": "server.ts" },
  "engenty": { "operations": ["inbox_threads_list", "connections_files_write"] },
  "storage": { "sqlite": true },
  "egress": { "connect": [] },          // deny-by-default; declared hosts only
  "actions": [                          // what copilot/coordinator may invoke
    { "id": "collect",  "risk": "low",  "summary": "…" },
    { "id": "finalize", "risk": "high", "requiresApproval": true, "summary": "…" }
  ],
  "rules": "rules.ts"                   // pure module, see §7
}
```

**App instance = artifact.** A new artifact `type: "app"` whose `content` is
`{"app_id": "…", "app_version": 3, "session_id": "…"}` — small, well under the 256 KB cap, versioned
by the existing machinery, realtime-broadcast on insert, listed by the existing pane queries. The
app's *working data* lives in its SQLite, keyed by `session_id`. This is what "apps as artefacts"
means in practice: the artifact is the handle you see, open, list and scope to a thread/task/project;
the App is the code behind it.

---

## 6. Phases

Each phase is independently shippable and independently revertable. Releases stay patch `0.1.x`.

### Phase 0 — Spike (throwaway, ~1 day)

Prove the dependency before designing around it. In a worktree, a standalone script — not wired into
anything:

1. `pnpm add @rivet-dev/agentos-apps` in a scratch package. Mount `appsRouter` on a bare Hono server.
2. `deployApp` a hello-world; `fetch` it. Then one with SQLite; write and read across a restart.
3. Measure: cold start, warm latency, RSS per app, disk per app.
4. Answer definitively: **does it need Rivet Cloud or a separate engine process?** The package
   "supports ordinary Rivet connections" and defaults to the configured namespace, and self-hosted
   Rivet documents three components (your backend with an envoy that executes actor code, the Rivet
   Engine, a persistence layer) with persistence options **filesystem** (single-node),
   **Postgres — experimental**, **FoundationDB — enterprise license**. Establish which of these we
   actually need for `agentos-apps` specifically.

**Gate:** if it cannot run self-contained inside one node process with filesystem persistence, stop
and re-decide. Everything downstream assumes it can.

### Phase 1 — `apps/app-host`

New workspace app: Hono + `setupApps()` + `appsRouter`, `ENGENTY_APP_HOST_PORT` (default 8795 — free
against the SSOT port table in `apps/ports.config.mjs:22-28`, which occupies
5173/5174/8787/8790/3002/43111 and steps by 10 per worktree slot). **No published port, no gateway
target, no `GatewayTarget` literal.** Internal API consumed only by apps/ai:
`deploy(appId, files) → {version, buildLog}`, `call(appId, action, input, capability) → result`,
`destroy(appId)`.

Deploy artifacts: `deploy/Dockerfile.app-host`, a service on the internal `engenty` network in both
compose files, and a new entry in the `build-images.yml` matrix (`:38-45`). Pin the dependency to an
exact version — it is `0.2.x` and labelled preview.

**Verify:** apps/ai deploys and calls a hello-world app in local dev and in the compose stack.

### Phase 2 — `modules/engenty-apps`

Module skeleton per the standard file set (`engenty.plugin.json`, `package.json` with
`engenty.migrationsDir`, `src/plugin.ts`, `src/api/gateway-methods.ts`, `supabase/migrations/…`,
`ui/plugin.ts`, `ai/registrar.ts`), registered in root `package.json` `engenty.plugins` as
`"engenty-apps": { "source": "workspace" }` — and **update the exact op-list test** in the module's
`src/api/index.test.ts` (the v0.1.64 lesson).

Schema per §5. Operations:

| op | risk | approval | purpose |
| --- | --- | --- | --- |
| `app_list`, `app_get`, `app_actions_list` | low | no | discovery for agents and UI |
| `app_create`, `app_file_write` | high | yes | authoring (agent-callable) |
| `app_release_propose` | high | yes | build + propose a version |
| `app_release_approve`, `app_release_reject` | high | yes | **admin-gated** activation |
| `app_call` | per manifest action | per manifest action | invoke an app action |
| `app_data_export` | high | yes | snapshot an app's SQLite |

Gating: feature flag `apps.enabled` registered in `plugin.ts` (valid under the key regex), plus the
module-licensing decision in §9. Governance mirrors `agent_propose` — and **adds the admin check
that flow is missing** on approve/reject.

**Verify:** unit tests for the state machine (propose → approve activates and deploys; reject leaves
the active version untouched; non-admin approve is 403).

### Phase 3 — The bridged app frame in the artifact pane

The frontend half, and the phase that makes Apps visible.

1. Generalize `McpAppFrame` into a reusable bridged frame (its props are already shaped for the
   official `@modelcontextprotocol/ext-apps` AppBridge exit ramp noted at
   `mcp-app-frame.tsx:16-19`). Keep the protocol; parameterize the transport target so `tools/call`
   can route to `/ai/apps/:appId/call` instead of `/ai/mcp-apps/call`.
2. `registerArtifactRenderer("app", AppArtifactView)` — reads `{app_id, app_version, session_id}`
   from the artifact content, fetches the inlined HTML for that version, mounts the bridged frame.
   Add `"app"` to `ARTIFACT_TYPE_IDS` (`artifact-types.ts:47`) with mime `text/html`.
3. Frontend tool `show_app` mirroring `show_artifact`
   (`modules/engenty-copilot/ai/frontend-tools/show-artifact/`) so an agent can open an app in the
   pane mid-conversation.
4. Agent → open frame updates: reuse the existing `ui/notifications/*` push direction so the agent
   can tell a live frame "I added three receipts". Frame → thread: a `notify` method that appends a
   user-visible line to the conversation.

**Verify:** browser E2E — agent creates an app artifact, pane opens, the app reads and writes its own
SQLite through the bridge, agent pushes an update into the open frame, frame reports back into chat.

### Phase 4 — The proxy and the capability wall

`apps/ai/src/api/app-proxy-routes.ts`, registered in `createApp` before the `MastraServer` graft:
`POST /ai/apps/:appId/call` with `resolveScope` first, per §4. Manifest allowlist intersection,
opaque capability handles with hashed storage and TTL ≤ 300s, first-run consent, audit on every call.

Explicitly avoid the two known weaknesses of `/ai/mcp-apps/call`: enforce per-**operation**
granularity (not per-server), and never forward an undeclared name.

**Verify:** tests that an undeclared op is 403; that a handle is single-app, single-user, expiring,
revocable; that a `requiresApproval` op still triggers the normal approval path; that the handle is
rejected by `verifyAccessToken` as a session token.

### Phase 5 — Authoring: `engenty.coder` writes Apps

The agent that creates apps, with no git and no repo checkout. Agent `engenty.coder` (module
`modules/engenty-apps/ai/agents/…`, `agent.json` + `AGENTS.md` doctrine — remember `model` is
forbidden in `agent.json`, enforced at `packages/ai-core/src/define-module-ai.ts:221`) with
`app_create` / `app_file_write` / `app_release_propose` and a build-error feedback loop: propose →
build fails → read `build_log` → fix → propose again.

Skills (`ai/skills/*/SKILL.md`):

- **app-authoring** — the manifest, the file layout, the single-inlined-HTML frontend constraint,
  the bridge API (`tools/call`, notifications), the deterministic-rules convention.
- **engenty-bridge** — which operations exist and how to declare them; that undeclared ops fail
  closed; that writes may be approval-gated and the app must handle a pending result.

**Verify:** the agent produces a working two-file app from a prose brief, unaided, and iterates from
a deliberately broken build.

### Phase 6 — Consumption: copilot and coordinator

- **`engenty.copilot`** needs nothing assembled: `app_call` and `app_actions_list` are ordinary
  catalog operations reachable through `engenty_tool_execute`. Add a skill for the interaction
  pattern (discover app → open artifact → converse → finalize). Later refinement, if discoverability
  disappoints: per-tenant rows in `ai.engenty_ai_tools` giving actions first-class tool names, using
  the same executable-dynamic-tool path as `parseMcpAppToolConfig`
  (`apps/ai/src/ai/registry/database-tool.ts:58-77`).
- **`engenty.coordinator`** calls `app_call` headlessly inside task runs. The durable approval flow
  already covers it: `approvalPolicy: "request"`, merged grants from
  `task.approval_grants ∪ approval_grants_once ∪ trigger.approval_grants`
  (`task-job-steps.ts:185-205`), blocked task + inbox card, approve once/task/routine.
- **Monthly batch** — a routine calls the app's `rules` module headlessly per §7, then produces a
  list of prepared items the user steps through in the pane. Same code, no browser.

**Verify:** end-to-end travel-expense walkthrough — interactive collection in chat + pane, then a
routine-driven monthly batch over the same rules.

### Phase 7 — Hardening

Done, and what each is actually worth:

- **`createNamespace: true` per app** — on by default, verified live: a deployed app lands in its
  own namespace (`agentos-app-<id>-<hash>`), not a shared one.
- **Resource ceilings.** agentOS Apps exposes replica scaling but **no per-app memory or CPU knob**,
  so the container boundary is the only real lever: `mem_limit: 3g`, `cpus: 2.0`,
  `pids_limit: 4096` on `engenty-app-host`, plus `maxReplicas` lowered from the package default of
  128 to 32. This is weaker than per-app limits and should be said out loud rather than implied.
  (The existing Docker sandbox sets *no* limits at all — `docker-sandbox-provider.ts:52-58` passes
  no `network`/`memory`/`cpuQuota` despite `DockerSandboxOptions` supporting them. Not repeated
  here.)
- **Egress deny-by-default** — enforced for the frontend by the frame CSP (`default-src 'none'`
  base, `connect-src` opened only for manifest-declared hosts). For the *backend*, agentOS exposes
  no per-release network permission, so a backend's outbound access is whatever the sidecar allows.
  Treat that as unbounded until upstream exposes it; it is the strongest argument for the
  per-tenant sidecar below.
- **`app_data_export`** — exports the App's working store, so app data is retrievable rather than
  trapped. It returns the snapshot; writing it to a storage target is a routine's job, not the
  operation's.
- **Rollback** — `app_release_rollback` redeploys a previous version from its stored source. It
  needs nothing from the app host's own state, which is precisely why source lives in Postgres.
- **Kill switches, in order of blast radius.** `ENGENTY_APPS_ENABLED=false` (deployment-wide: the
  module registers no operations at all, so there is no surface to reach); module licensing
  (per tenant); `app_archive` (per app). The `apps.enabled` feature flag is **not** one of them —
  no module in this repo reads a feature flag in an operation handler and `PluginServerApi` has no
  request-time resolver, so it gates settings visibility only. The plan previously claimed
  otherwise; that was wrong.
- **Capability handles** are minted and revoked per invocation, expire in ≤300s, and the registry
  sweeps expired entries so it cannot grow without bound.

Still open, deliberately:

- **Hostile-tenant isolation.** Many app VMs share one sidecar process. Adequate for the real threat
  model (buggy AI-generated code inside one tenant), not for a tenant actively attacking the host.
  The answer is one sidecar container per tenant — a deployment change rather than a rewrite,
  precisely because agentOS is a library. Do this before onboarding a tenant we do not trust.
- **Multi-replica apps/ai.** Capability handles live in-process; a second replica cannot resolve a
  peer's handle. Fails closed, but it caps apps/ai at one replica while Apps are in use.

---

## 7. Deterministic rules as a pure module

Tenant rules ("€35 domestic, €59 over 8h to countries in list X, unless a meal was provided") are
code, in the app, in one file, exporting a pure function:

```ts
export function validate(report: Report): Violation[]   // no DOM, no fetch, no clock
```

The frontend imports it for live feedback in the pane. The monthly batch imports the *same* module
headlessly. If the rules only ran in the browser, batch runs could not enforce tenant policy without
one, and two divergent implementations would appear — which is the standard way expense systems rot.
The authoring skill states this as a hard rule and the build rejects a `rules` module that imports
DOM or network APIs.

---

## 8. Risks

| Risk | Mitigation |
| --- | --- |
| `agentos-apps` is `0.2.14`, preview, published today; Rivet repositioned this three times in seven months | Apache-2.0 and a library, so no rug-pull — but pin exactly, keep the wrapper in Phase 1 thin, and treat Phase 0 as a real gate |
| rivetkit persistence: filesystem is single-node, Postgres experimental, FoundationDB needs a licence | Postgres is the record; actor state is derived and redeployable. Only app *data* is real state → Phase 7 snapshot duty |
| Same-origin catastrophe if apps are ever served on the platform origin | Structural: no published port, no gateway target, opaque-origin iframe only. A future real-origin ladder needs its own hostname and its own review |
| V8 isolates are the boundary and many VMs share one sidecar process | Adequate for the real threat model (buggy AI-generated code inside one tenant), `createNamespace: true` per app, per-tenant sidecar available for hostile multi-tenancy |
| Actor tokens are full user-equivalent — one careless reuse voids the whole design | Apps never receive any token; handles are opaque, hashed, TTL-bounded, and rejected by `verifyAccessToken` |
| Approval fatigue if every app action prompts | Read ops ride first-run consent; only `requiresApproval` actions gate, with the existing once/task/routine scopes |
| A second control plane to operate on one Coolify VPS | One extra internal service, no port, no DNS, no TLS, scale-to-zero at ~22 MB per app |

## 9. Decisions (answered 2026-07-25)

1. **Licensing** — **PRO-only for now**, free in the long run. `engenty-apps` is absent from the
   `free`/`team` package module lists, like time-tracking.
2. **Who approves a release?** — **a new `apps.approve` capability**, so a department lead can sign
   off on their own app without being a tenant admin.
3. **Egress** — **deny-all**, per-app declared hosts only. Matches the agentOS default.
4. **App data** — **nothing in a Postgres *reporting* schema for now.** App working state lives in
   `module_apps.app_data` (see §5) and is reachable only through the proxy. Doctrine stands: *if it
   must be searched, reported on, or joined with engenty data, it belongs in engenty via the API.*
5. **Open/closed** — **closed for now**; `modules/engenty-apps` joins `CLOSED_PREFIXES` in
   `scripts/publish-open.sh`.

## 9a. Phase 0 result — gate failed, patched, proceeding

See [SPIKE-agentos-apps.md](SPIKE-agentos-apps.md) for the full run. Summary:

- **Self-containment: pass.** `registry.start()` spawns a native Rivet Engine binary
  (`@rivetkit/engine-cli-<platform>`) plus an `agentos-sidecar` binary automatically; no Rivet Cloud,
  no account, no token. State in `~/.rivetkit/var/engine/db`.
- **`deployApp()` is broken on both published versions** (0.2.13, 0.2.14): guest processes cannot
  write through `createHostDirBackend`, so the release `tar` step fails and even the package's own
  README example does not deploy. **Decision: ship a `pnpm patch`** that packs into the guest VFS and
  reads the artifact out with the host-side `AgentOs` API. With it, static and backend apps deploy and
  serve (20–34 s build, 100–200 ms requests, Node v22 in the isolate, web-standard `fetch` handler).
- **Per-app SQLite is not available.** It requires the RivetKit-in-guest path, which took 369 s per
  deploy and then 500s on every request. **Decision: `module_apps.app_data` is the v1 store**, with
  the same app-facing API, so SQLite can replace it later without touching an app.

## 10. Sequencing

Phase 0 gates everything. Then 1 → 2 → 3 is the shortest path to something a user can see: an app
running in the pane, talking to its own storage. Phase 4 must land before any app is allowed to touch
engenty data. Phases 5 and 6 are independent of each other and can run in parallel. Phase 7 before
the flag is enabled for any tenant that is not us.
