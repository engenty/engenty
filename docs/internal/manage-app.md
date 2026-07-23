# Manage App — Implementation Spec

Status: **detailed spec, ready to implement (Phase 1)** · 2026-07-13 · Branch: `spike/tenant-box` · Worktree: `engenty-pro-tenant-box`
Implements §3 of `tenancy-spec.md`. Phase 1 is specified to work-package depth; Phases 2–3 are
design-level and get their own spec before implementation.
Functional reference (read-only, for parity checks): `/Users/m/code/engenty/legacy/apps/manage`.

---

## 0. Ground rules for the implementer

1. **Work only in this worktree** (`engenty-pro-tenant-box`), never in `engenty-framework`.
2. **Rewrite, don't copy.** The legacy app is a feature checklist and locale-string source.
   Code patterns come from pro's `apps/ui` and the reference files in §2.
3. **Every contract in §3 is verified against the code on this branch.** If reality disagrees
   with this doc, reality wins — note the discrepancy in the PR description.
4. Work package order is WP0 → WP8. Each WP ends green: `pnpm vitest run <its test files>`
   passes, `pnpm --filter @engenty/manage lint` (once WP0 exists) passes. Commit per WP.
5. **Never run destructive commands** (DB resets, `supabase stop`, data deletes) without asking.
6. Tests follow §5 (outcome-focused, capped). Do not add tests beyond the listed budget.
7. i18n: every user-visible string goes through `useTranslation("common")` with EN + DE
   entries. Seed translations by copying matching keys from
   `/Users/m/code/engenty/legacy/apps/manage/src/locales/{en,de}/common.json`, pruned to
   what Phase 1 actually renders.

## 1. Decisions already made (do not relitigate)

- Manage is a **separate Vite SPA** at `apps/manage`, PRO-only, superadmin-only, served
  behind the gateway at `/manage`. It is NOT module-extensible (static routes, static sidebar).
- Backend is **`apps/core`'s existing superadmin/plugin/feature-flag routes**, extended in
  place. No new service, no new `manage-routes.ts` in Phase 1.
- `core.tenants` gains `tier` (`platform|satellite`) and `status`
  (`active|suspended|provisioning|archived`). `tenant_connection_mode` stays for one release
  (backfilled, then dropped later).
- No tenant/user hard-delete. Tenants get status actions; users keep legacy behavior (no delete).
- Out of scope for Phase 1 (backlog): AI-usage tab, automation-rules tab, queues, logs,
  audit viewer, env viewer, test-data, AI pricing, banking setup, xyflow dependency graph,
  domains, provisioning, packages, billing.

## 2. Pattern reference map (open these before writing code)

| Concern | Copy the pattern from |
|---|---|
| SPA bootstrap (providers, i18n init) | `apps/ui/src/main.tsx` |
| Auth gating + AppLayout wiring | `apps/ui/src/App.tsx` (lines 118–262 gating cascade, 321–382 AppLayout) — manage needs a much smaller version: NO copilot, NO plugin contributions, NO live bindings |
| Unauthenticated routes (login/dev-login/callback) | `apps/ui/src/routes/UnauthenticatedRoutes.tsx` |
| Vite config (aliases, proxy, ports) | `apps/ui/vite.config.ts` — prune per WP0 |
| Tailwind entry CSS | `apps/ui/src/index.css` — prune per WP0 |
| API request wrapper | `apps/ui/src/lib/api/client.ts` lines 1–33 (`request<T>` over `requestApiJson`) |
| Page chrome (breadcrumbs/topbar) | `apps/ui/src/pages/SearchIndexSettingsPage.tsx` (`usePageConfig` — works under `AppLayout`; the provider is `PageHeaderProvider` inside `packages/app-shell/src/components/app-layout/index.tsx`) |
| Feature-flags admin UI | `apps/ui/src/pages/FeatureFlagsPage.tsx` |
| Plugin enable/disable UI | `apps/ui/src/pages/TenantPluginsPage.tsx` |
| List page ergonomics (table/cards, columns) | `packages/ui-core/src/components/admin/list/` + `use-list-display-state` (see `useListDisplayState` usages in `apps/ui`) |
| Route-test conventions | `apps/core/src/api/superadmin-routes.test.ts` (OpenAPIHono + `registerXxxRoutes` + jose-signed JWT, secret `"test-secret"`) |
| Component-test conventions | `packages/ui-core/src/components/ui/list-toolbar.test.tsx` (`/** @vitest-environment happy-dom */` + @testing-library/react) |
| Sidebar/nav types | `packages/app-shell/src/types/shell.ts` (`NavigationSection`, `ShellSidebarConfig`) |
| AppLayout props | `packages/app-shell/src/components/app-layout/types.ts` (`AppLayoutProps`) |
| Legacy screens for parity | `/Users/m/code/engenty/legacy/apps/manage/src/pages/*` |

## 3. Verified backend contracts

**Envelope.** Success responses are `{ data: <payload> }` (`jsonApiSuccess`); errors are
`{ error: { code, message, ... } }`. **`requestApiJson` from `@engenty/api-client` unwraps
`data` automatically** — client functions return the payload directly. Never unwrap twice.

**Auth.** All endpoints below take `Authorization: Bearer <supabase session token>` (or a
capability JWT). Superadmin routes 401 without a token, 403 without superadmin
(`requireSuperAdmin` in `apps/core/src/api/routes/authz.ts`).

**Who am I / gate**: `GET /api/users/setup/context` → `WorkspaceContextResponse`
(`isSuperAdmin`, `userId`, `currentUser`, `tenants`, `currentTenant`, …). Type in
`apps/ui/src/lib/api/client.ts` (~line 427) — copy it.

**Tenants** (`apps/core/src/api/routes/superadmin-routes.ts`, DTO `CoreTenant` in
`apps/core/src/dal/superadmin.ts`):

| Endpoint | Body | Returns |
|---|---|---|
| `GET /api/superadmin/tenants` | — | `CoreTenant[]` |
| `GET /api/superadmin/tenants/:id` | — | `CoreTenant` (404 if missing) |
| `POST /api/superadmin/tenants` | `{slug, name, tenant_connection_mode?}` (+ `tier?` after WP2) | `CoreTenant` |
| `PATCH /api/superadmin/tenants/:id` | any of `{slug, name, tenant_connection_mode}` (+ `tier?` after WP2) | `CoreTenant` |
| `POST /api/superadmin/tenants/:id/status` | `{status}` — **new in WP2** | `CoreTenant` |
| `POST /api/superadmin/tenants/:id/switch` | — | `{tenantId}` |

**Users**:

| Endpoint | Body | Returns |
|---|---|---|
| `GET /api/superadmin/users` | — (`?tenantId=` → members of that tenant) | `SuperadminUser[]` / `TenantMember[]` |
| `GET /api/superadmin/users/:id` | — | `{user, tenant_memberships, identities}` |
| `POST /api/superadmin/users` | `{email!, tenant_id!, password?, display_name?, role?, is_super_admin?}` | `SuperadminUser` |
| `PATCH /api/superadmin/users/:id` | any of the above | `SuperadminUser` |
| `POST /api/superadmin/users/:id/password` | `{newPassword!}` | `{updated: true}` |
| `POST /api/superadmin/tenants/:id/users` | `{userId!, role?}` | `{assigned: true}` |
| `PATCH /api/superadmin/tenants/:id/users/:userId` | `{role!}` | `{updated: true}` |
| `DELETE /api/superadmin/tenants/:id/users/:userId` | — | `{removed: true}` |

**Modules/plugins** (`apps/core/src/api/routes/plugins/plugin-admin-routes.ts`):

| Endpoint | Body | Notes |
|---|---|---|
| `GET /api/plugins` | — (`?tenantId=` adds per-tenant effective state) | list with `enabled`, `loaded`, `mandatory`, `tenantOverride`, `effectiveState` |
| `GET /api/plugins/:id` | — | detail: manifest, routes/services/operations, dependencies, diagnostics |
| `POST /api/plugins/:id/activate` | `{tenant_id?}` — with `tenant_id` sets the tenant override; without, global | 409 `plugin.tenant_activation.blocked` with `details.blockedReasons` when blocked |
| `POST /api/plugins/:id/deactivate` | `{tenant_id?}` | mandatory plugins can't be disabled |

Global enable/disable requires an API restart to take effect — surface the same notice the
legacy app showed.

**Feature flags** (`apps/core/src/api/routes/feature-flags-routes.ts`):

- `GET /api/feature-flags/manage?tenantId=<id|omit>` →
  `{definitions, global, tenant, resolved, tenantId}` — `definitions` are plugin-declared
  (`key, labelKey, descriptionKey, namespace, pluginId, default`); `global` are rows with
  `tenant_id null`; `tenant` the per-tenant rows; `resolved` the effective map.
- `PUT /api/feature-flags/manage` body
  `{updates: [{key, tenant_id: string|null, enabled: boolean}]}` → `{saved: true}`.
  `tenant_id: null` writes the global default; a string writes a tenant override.

**Gateway (already wired — do not build, just verify):**
`apps/core/src/api/dev-gateway.ts` proxies `/manage` → `http://127.0.0.1:5174`
(override `ENGENTY_DEV_GATEWAY_MANAGE_URL`; also maps `manage.engenty.localhost`).
`apps/core/src/api/prod-gateway.ts` serves a static build from `ENGENTY_GATEWAY_MANAGE_ROOT`
(default `/app/manage`) behind `ENGENTY_GATEWAY_MANAGE_ENABLED`. Deploy artifacts pin the
flag false; `scripts/publish-open.sh` already excludes `apps/manage`. **The proxy does NOT
strip the `/manage` prefix** — the app must be built and served with base `/manage/`.

---

## 4. Phase 1 work packages

### WP0 — Scaffold `apps/manage`

**Goal:** empty shell app boots on port 5174, reachable at `http://127.0.0.1:8787/manage/`
through the dev gateway, showing a login page.

1. `apps/ports.config.mjs`: add `manage: fromEnv("ENGENTY_MANAGE_PORT", 5174)` to `ports`.
2. `portless.json`: add
   `"apps/manage": { "name": "manage.engenty", "script": "dev:app", "appPort": 5174 }`
   (mirror the docs entry).
3. Root `package.json` `dev` script: append `--filter=./apps/manage`.
4. `apps/manage/package.json` — name `@engenty/manage`, private, `"type": "module"`.
   Scripts: `dev`/`dev:app` = `vite --host`, `dev:portless` = `pnpm run dev:app`,
   `build` = `vite build`, `lint` = `biome check .`, `test` = `vitest run`.
   Dependencies (all `workspace:*` unless noted): `@engenty/app-shell`, `@engenty/auth-ui`,
   `@engenty/ui-core`, `@engenty/ui-icons`, `@engenty/ui-plugin-sdk`, `@engenty/api-client`,
   `@engenty/api-contracts`, `@engenty/query-client`, `@engenty/i18n`,
   `@engenty/environment`, `@engenty/design-tokens`, plus `react`, `react-dom`,
   `react-router-dom` (^7), `nuqs`, `next-themes`, `sonner`, `lucide-react`, `clsx`,
   `tailwind-merge`, `tailwindcss`, `@tailwindcss/vite`, `tailwindcss-animate`.
   DevDeps: `@vitejs/plugin-react`, `vite`, `vitest`, `happy-dom`,
   `@testing-library/react`, `@testing-library/user-event`, `typescript`.
   Match versions to `apps/ui/package.json` — do not invent versions.
5. `apps/manage/vite.config.ts` — start from `apps/ui/vite.config.ts` and prune:
   - `base: "/manage/"`, `server.port: ports.manage`, keep `envDir: repoRoot`,
     `envPrefix: ["VITE_", "ENV"]`, keep `resolve.dedupe`.
   - **Delete** the module/plugin discovery machinery (`discoverWorkspaceUiAliases`,
     `discoverBareUiIndexAliases`, provider roots) — manage has no plugins.
   - Keep only the dev source aliases for packages manage consumes (for HMR):
     `@engenty/app-shell` (+ `/navigation`), `@engenty/auth-ui` (+ `/plugin` if the
     UnauthenticatedRoutes copy needs it), `@engenty/ui-icons`, `@engenty/i18n/ui`,
     `@engenty/api-client`, `@engenty/environment`, the two `@engenty/ui-core` regex
     entries, and `"@": src`. Add the `@engenty/telemetry` → stub alias only if the build
     complains (then copy `apps/ui/src/telemetry-stub.ts`).
   - Proxy: `/api` and `/gateway` → `http://127.0.0.1:${ports.core}` (drop `/ai`, `/docs`,
     `/_next`, `/__nextjs`).
6. `apps/manage/index.html` — copy from `apps/ui/index.html`, retitle "engenty manage".
7. `apps/manage/src/index.css` — copy `apps/ui/src/index.css` and **delete** these imports:
   `@xyflow/react`, `commercial-editor` CSS, `./plugins/generated-tailwind-sources.css`,
   the `streamdown` `@source`, `engenty-print.css`. **Keep** the design-tokens imports and
   `@source "../../../packages";` (without it, Tailwind won't emit classes used inside
   app-shell/ui-core source). Change `@source "../../../modules";` → delete (no modules).
8. `apps/manage/src/main.tsx` — copy `apps/ui/src/main.tsx` verbatim, with:
   `storageKey="engenty-manage-theme"`, own `./locales/{en,de}/common.json`, and
   `<BrowserRouter basename="/manage">`. Copy `apps/ui/src/components/theme-provider.tsx`.
9. `apps/manage/tsconfig.json` — copy from `apps/ui`, adjust paths.
10. Minimal `src/App.tsx` for this WP: `useCoreAuthSession()`; unauthenticated → an
    `UnauthenticatedRoutes` component copied/pruned from
    `apps/ui/src/routes/UnauthenticatedRoutes.tsx` (login, dev-login, callback,
    service-unavailable only); authenticated → `<div>manage</div>` placeholder.

**Acceptance:** `pnpm dev` starts manage without breaking core/ui/ai/docs; both
`http://127.0.0.1:5174/manage/` and `http://127.0.0.1:8787/manage/` render the login page;
dev-login works (dev creds come from root `.env.local`); `pnpm --filter @engenty/manage build` succeeds.
**Tests:** none (verified by WP8 smoke).

### WP1 — Shell, gate, navigation

**Goal:** authenticated superadmin sees the manage shell (sidebar: Tenants, Users, Modules,
Feature Flags); a non-superadmin sees an access-denied card and nothing else.

1. `src/lib/api/http.ts`: copy the `request<T>` wrapper (reference §2). `config.apiBaseUrl`
   may be `""` — paths are relative, the Vite proxy / gateway handles routing.
2. `src/lib/api/workspace.ts`: `getWorkspaceContext()` (copy `WorkspaceContextResponse` type).
3. `src/lib/queries/workspace.ts`: `workspaceContextQuery = queryOptions({ queryKey:
   ["manage","workspace-context"], queryFn: ... })` (import from `@engenty/query-client`).
4. `src/App.tsx` gating cascade, in order (mirror `apps/ui/src/App.tsx` but minimal):
   auth loading → spinner; auth error → error card; unauthenticated →
   `UnauthenticatedRoutes`; workspace query loading → spinner; workspace error → error card;
   **`!workspaceContext.isSuperAdmin` → full-page "Super admin required" card (no sidebar,
   no routes)**; else the shell.
5. Shell: `<AppLayout sections={SECTIONS} shell={SHELL} fetchResolvedFeatureFlags={async () => ({})}
   defaultTopbarTitle={t("navigation.tenants")}>` — `appMenuActions`,
   `secondaryNavPersistence`, `currentUserId`, `shellUiHost` all omitted (optional).
   `SHELL`: `appTitle: "engenty manage"`, `appSubtitle: t("sidebar.subtitle")` ("Meta admin"),
   `searchPlaceholder`, `userMenu: (compact) => <SidebarUserMenu …>` — write a minimal
   user menu (display name + sign-out via `getSupabaseAuthClient().auth.signOut()`);
   **no `tenantSwitcher`**.
6. `SECTIONS: NavigationSection[]` — one "Manage" section, items (lucide icons):
   Tenants→`/tenants`, Users→`/users`, Modules→`/modules`, Feature Flags→`/feature-flags`.
7. `src/routes.tsx`: static `<Routes>` — `/` redirects to `/tenants`; stub elements for each
   page; `*` → simple not-found.
8. `sonner` `<Toaster position="bottom-right" richColors />` at the shell root; all
   mutations in later WPs surface errors via `toast.error(message)` — no silent failures.

**Tests (1 file, `src/App.test.tsx`, happy-dom):**
- mock `src/lib/api/workspace.ts` with `vi.mock`; render `App` inside MemoryRouter +
  QueryClientProvider; assert: `isSuperAdmin: false` → access-denied text visible, no
  "Tenants" nav; `isSuperAdmin: true` → sidebar items Tenants/Users/Modules/Feature Flags
  visible. (Mock `useCoreAuthSession` to authenticated.)

### WP2 — Core: tenant registry columns + status endpoint

**Goal:** `core.tenants` carries `tier` + `status`; API accepts `tier` on create/patch and
exposes a status transition endpoint; DAL is injectable for tests.

1. New migration `apps/core/supabase/migrations/20260714000000_core_tenant_registry.sql`
   (timestamp must sort after the newest existing migration — check `ls` first):

```sql
alter table core.tenants
  add column if not exists tier text not null default 'platform',
  add column if not exists status text not null default 'active';

alter table core.tenants
  add constraint tenants_tier_check
    check (tier in ('platform', 'satellite')),
  add constraint tenants_status_check
    check (status in ('active', 'suspended', 'provisioning', 'archived'));

update core.tenants
  set tier = 'satellite'
  where tenant_connection_mode = 'dedicated_instance';

comment on column core.tenants.tier is
  'Tenancy tier per docs/internal/tenancy-spec.md; supersedes tenant_connection_mode (kept one release for rollback).';
```

2. `apps/core/src/dal/superadmin.ts`:
   - `CoreTenant` += `tier: "platform" | "satellite"; status: "active" | "suspended" | "provisioning" | "archived";`
   - `createTenant` input += optional `tier`; `updateTenant` input += optional `tier`;
     add `updateTenantStatus(tenantId, status): Promise<CoreTenant>`.
   - Check the supabase `.select(...)`/`.insert(...)` column lists in the implementation and
     include the new columns wherever columns are explicit.
3. `apps/core/src/api/routes/superadmin-routes.ts`:
   - `registerSuperadminRoutes` params += `createDal?: typeof createSuperadminDal`;
     `const getDal = () => (params.createDal ?? createSuperadminDal)(params.config);`
     (`server.ts` call site unchanged.)
   - POST/PATCH tenant bodies accept `tier`; validate against
     `["platform","satellite"]`, 400 on anything else.
   - New route:

```ts
const TENANT_STATUSES = ["active", "suspended", "provisioning", "archived"] as const;

params.app.post("/api/superadmin/tenants/:id/status", async (c) => {
  const authResult = await requireSuperAdmin(c, params.config);
  if ("error" in authResult) {
    return authResult.error;
  }
  const body = (await c.req.json().catch(() => ({}))) as { status?: string };
  if (!TENANT_STATUSES.includes(body.status as (typeof TENANT_STATUSES)[number])) {
    return jsonApiError(c, 400, {
      message: `status must be one of: ${TENANT_STATUSES.join(", ")}`,
    });
  }
  const tenant = await getDal().updateTenantStatus(
    c.req.param("id"),
    body.status as (typeof TENANT_STATUSES)[number]
  );
  return jsonApiSuccess(c, tenant);
});
```

   No transition matrix in Phase 1 — any status→status is allowed (provisioning is set by
   the Phase-2 provisioner but writable here for repair).
4. Same injectability for feature flags: `registerFeatureFlagsRoutes` params +=
   `createDal?: typeof createFeatureFlagsDal` (default unchanged).
5. Apply the migration to the shared dev DB with the repo's normal migrate flow
   (`pnpm db:migrate` — ask before anything destructive; remember the
   consolidated-baseline drift-repair gotcha if "column already exists" appears after merges).

**Tests (extend `apps/core/src/api/superadmin-routes.test.ts` — 2 additions; and
`apps/core/src/api/feature-flags-routes.test.ts` — 1 addition):**
- Build a `fakeSuperadminDal(): SuperadminDal` backed by in-memory Maps (implement only
  what the flows touch; throw "not implemented" elsewhere). Sign the JWT with capability
  `["core.superadmin"]` using the existing `signToken` helper.
- **Tenant registry lifecycle (one test):** POST create `{slug:"acme", name:"Acme"}` → 200,
  body defaults `tier:"platform"`, `status:"active"` → PATCH `{tier:"satellite"}` → POST
  `.../status {status:"suspended"}` → GET list shows one tenant with
  `tier:"satellite"`, `status:"suspended"`. POST `.../status {status:"nope"}` → 400.
  This is an outcome test of the whole route+DAL contract — do NOT also test each handler.
- **Membership flow (one test):** create user via fake DAL seed → POST assign to tenant →
  GET `/api/superadmin/users?tenantId=` includes them with `tenant_role` → PATCH role →
  DELETE → list excludes them.
- **Flags manage round-trip (one test, fake flags DAL + fake registry
  `{featureFlags:[{key:"x.y", pluginId:"x", default:false, ...}]}`):**
  PUT `{updates:[{key:"x.y", tenant_id:"t1", enabled:true}]}` → GET
  `/api/feature-flags/manage?tenantId=t1` shows it in `tenant` and `resolved["x.y"]===true`
  while `global` stays empty.

### WP3 — Manage data layer

**Goal:** typed domain clients + query modules; no god-file.

Files under `apps/manage/src/lib/`:

- `api/http.ts` (from WP1), `api/workspace.ts` (from WP1)
- `api/tenants.ts` — `listTenants`, `getTenant`, `createTenant`, `updateTenant`,
  `setTenantStatus`, `switchToTenant`, `listTenantMembers` (GET users?tenantId),
  `assignMember`, `updateMemberRole`, `removeMember`. Types: `ManageTenant` (=
  `CoreTenant` incl. `tier`/`status`), `TenantMember`.
- `api/users.ts` — `listUsers`, `getUser` (returns `{user, tenant_memberships, identities}`),
  `createUser`, `updateUser`, `setUserPassword`.
- `api/plugins.ts` — `listPlugins(tenantId?)`, `getPlugin(id)`,
  `setPluginEnabled(id, enabled, tenantId?)` → POSTs activate/deactivate with
  `{tenant_id}` when given. Copy the response types from what the endpoints actually return
  (check `plugin-admin-routes.ts`), not from the legacy client.
- `api/feature-flags.ts` — `getManageFlags(tenantId?)`, `saveFlagUpdates(updates)`.
- `queries/<domain>.ts` — `queryOptions` factories; key convention:
  `["manage","tenants"]`, `["manage","tenants", id]`, `["manage","tenants", id, "members"]`,
  `["manage","users"]`, `["manage","plugins", tenantId ?? "global"]`,
  `["manage","flags", tenantId ?? "global"]`. Mutations invalidate the narrowest prefix
  that covers the change (e.g. member changes invalidate `["manage","tenants", id]` AND
  `["manage","users"]`).

**Tests:** none (exercised through WP4–WP7 page tests and WP2 route tests — the layer is
declarative plumbing).

### WP4 — Tenants (list · detail · create · edit · status)

Parity reference: legacy `TenantsListPage/TenantDetailPage/TenantEditPage`.

1. `/tenants` — list: `useListDisplayState` table/cards toggle, search (client-side over
   slug+name), sort by name/created, columns: name, slug, tier badge, status badge,
   created. Row click → detail. Header action: "New tenant" dialog (slug + name; slug
   auto-suggested from name, lowercased/kebab).
2. `/tenants/:id` — header: name, slug, tier + status badges, actions: **Edit**,
   **Switch to tenant** (calls `switchToTenant`, then `toast.success` + link hint to open
   `/` in the tenant app — do not silently no-op like legacy), **status menu**
   (Suspend/Reactivate/Archive with a confirm `AlertDialog` each; wording states the effect).
   Tabs (`?tab=`, default `members`): **Members**, **Modules**, **Feature flags**.
   - Members tab: table (name, email, tenant role, superadmin badge), add-member dialog
     (user select from `listUsers`, role select), role change inline, remove w/ confirm.
   - Modules tab: reuse the WP6 per-tenant toggle component scoped to this tenant.
   - Feature-flags tab: reuse the WP7 flag editor scoped to this tenant (shows
     global default vs tenant override vs resolved).
3. `/tenants/:id/edit` — form: name, slug, tier select. Save → PATCH → invalidate → back
   to detail.
4. Page chrome via `usePageConfig` (breadcrumbs `Tenants / <name>`, header actions).

**Tests (2 files, happy-dom, mock `lib/api/tenants.ts` etc. via `vi.mock`):**
- `TenantsListPage.test.tsx`: renders rows from mocked data (assert name/slug/status badge
  text); create dialog → submit "Acme" → `createTenant` called with
  `{slug:"acme", name:"Acme"}`.
- `TenantDetailPage.test.tsx`: status action Suspend → confirm → `setTenantStatus(id,
  "suspended")` called; member remove → confirm → `removeMember` called. (One file, both
  outcomes; don't test every tab render.)

### WP5 — Users (list · detail · edit · password)

Parity reference: legacy `UsersListPage/UserDetailPage/UserEditPage`.

1. `/users` — list: display name, email, superadmin badge, primary tenant, created; search;
   "New user" dialog (email, display name, initial tenant select, role, optional password,
   superadmin toggle).
2. `/users/:id` — profile card (display name, email, created/updated), auth identities
   badges (email/google from `identities`), memberships table (tenant, role, change role,
   remove; add-membership dialog). Superadmin toggle with confirm dialog.
3. `/users/:id/edit` — display name, email; **password section**: set-manually input +
   "generate" button (16-char random from `crypto.getRandomValues`, shown once with copy
   button), calls `setUserPassword`.
4. Do NOT render the HR columns (`employee_number`, department, …) — out of manage's scope.

**Tests (1 file):** `UserDetailPage.test.tsx` — password set → `setUserPassword(id, pw)`
called and success toast rendered; membership role change → `updateMemberRole` called with
`{tenantId, role}`.

### WP6 — Modules

Parity reference: legacy `PluginsPage/PluginsDetailPage`; pro's `TenantPluginsPage.tsx`
shows the toggle + `effectiveState` handling.

1. `/modules` — list of the plugin registry: name, id, version, enabled/loaded/mandatory
   badges, diagnostics count; filter by text and by enabled state. Global toggle per row
   (mandatory ⇒ disabled control): calls `setPluginEnabled(id, enabled)`; on success show
   the persistent **"restart required"** banner (sticky until reload — state in the page).
2. `/modules/:id` — detail: package name, version, manifest path, source, dependencies
   (with link to each), contributed routes/gateway methods/services/operation counts,
   diagnostics list, load error. Activate/deactivate action.
3. Per-tenant control lives in the tenant detail Modules tab (WP4): fetch
   `listPlugins(tenantId)`, render global state + override switch + effective state; on 409
   `plugin.tenant_activation.blocked` render `details.blockedReasons` in the error toast.
4. Extract the effective-state helper as a pure function
   `resolveEffectiveEnabled({globalEnabled, tenantOverride}): boolean` in
   `src/lib/plugins-state.ts` — single source for badges in both surfaces.

**Tests (1 file):** `modules.test.tsx` — pure helper truth table (override wins, else
global) in the same file as one component outcome: toggling a tenant override calls
`setPluginEnabled(id, enabled, tenantId)` and a blocked (mocked 409) response surfaces
`blockedReasons` text.

### WP7 — Feature flags

Parity reference: legacy feature-flags screens; pro `FeatureFlagsPage.tsx`.

1. `/feature-flags` — global view: definitions grouped by `pluginId` (namespace headers),
   each row: label (via i18n `labelKey`, fallback key), description, plugin default badge,
   global override switch (tri-state display: "default (on/off)" vs explicit override).
   Tenant selector (dropdown of tenants) switches the page to per-tenant mode showing
   default / global / tenant override / **resolved** per flag.
2. Saving: batch changed toggles into one `PUT {updates}` on a debounced "Save" button
   (legacy did per-toggle PUTs; batch is fewer round-trips and one invalidation).
3. The tenant detail Feature-flags tab (WP4) reuses the same editor component fixed to that
   tenant.

**Tests (1 file):** `FeatureFlagsEditor.test.tsx` — with mocked manage data (one definition,
no overrides): toggling at tenant scope stages `{key, tenant_id: "<id>", enabled}` and Save
calls `saveFlagUpdates` with exactly the staged updates; resolved badge text flips after
(mocked) refetch. Assert the payload shape — that's the contract that matters.

### WP8 — Polish + verification pass

1. i18n sweep: no hardcoded strings; DE file complete (copy/adapt from legacy DE).
2. Empty/loading/error states on all four list pages via one shared `PageState` component.
3. Run the full check battery: `pnpm --filter @engenty/manage lint`,
   `pnpm vitest run apps/manage apps/core/src/api/superadmin-routes.test.ts
   apps/core/src/api/feature-flags-routes.test.ts`, `pnpm --filter @engenty/manage build`.
4. Manual smoke through the dev gateway (record results in the PR):
   - login as superadmin at `/manage/` → shell renders
   - create tenant → suspend it → reactivate → edit tier
   - create user with generated password → add to the new tenant → change role → remove
   - toggle a non-mandatory module globally (banner appears) and per-tenant (effective
     state updates under tenant → Modules; open installs still use `/setup/plugins`)
   - With `VITE_MANAGE_APP_ENABLED=true` (PRO UI build), tenant-app `/setup/plugins`
     (and legacy `/admin/plugins`) must hand off to `/manage/modules`
   - set a tenant flag override → verify `/settings/features` in the tenant app resolves it
   - login as a non-superadmin → access-denied card, API calls return 403
5. Update `docs/internal/tenancy-spec.md` §6: mark "Manage app v0" as in progress/done.

## 5. Test plan — philosophy and budget

**Test outcomes, not functions.** A good test here answers "does the feature work end to
end at its seam" — HTTP request → response for core, user interaction → API payload for UI.
Rules:

1. **Budget: the ~7 test files/additions named in WP1–WP7, plus the 3 core route tests in
   WP2. Hard cap ~12 files touched.** If you feel the urge to add more, improve an existing
   outcome test instead.
2. Core tests hit the route surface (`app.request(...)`) with a fake DAL — never unit-test
   DAL methods, validators, or helpers that the route tests already traverse.
3. UI tests render a page with mocked API modules and assert *what the user sees* and
   *what request the interaction produces*. No snapshot tests, no "renders without
   crashing", no tests of query-key factories, i18n keys, or styling.
4. Assert loosely where the contract is loose: check the fields that matter
   (`tier`, `status`, payload shapes), not whole-object deep equality with timestamps.
5. A flaky or timing-dependent test is worse than no test — use `findBy*` queries, no
   `setTimeout`.

## 6. Definition of done (Phase 1) — LANDED 2026-07-13

- [x] All WP acceptance criteria met; WP8 smoke recorded (below).
- [x] Manage suite green (`pnpm --filter @engenty/manage test` → 6 files / 12 tests),
      core route tests green (`superadmin-routes` + `feature-flags-routes` → 14 tests),
      typecheck + biome lint + `vite build` all green.
- [x] No change to the public/framework mirror surface (`apps/manage` still in
      `CLOSED_PREFIXES`; `scripts/publish-open.sh` untouched).
- [x] Deploy posture unchanged: `/manage` still 404s in prod (flag stays false);
      `deploy/DEPLOY.md` documents the PRO enable steps.
- [x] Discrepancies found during implementation recorded in §6.1.

### 6.1 Contract discrepancies / deviations found while implementing

1. **`usePageConfig` needs `PageHeaderProvider`, which is NOT exported from
   `@engenty/ui-plugin-sdk`.** The real `AppLayout` mounts it; standalone page tests can't.
   Resolution: page tests globally `vi.mock` `usePageConfig` to a no-op (in
   `apps/manage/vitest.setup.ts`). `PageShell` is otherwise unchanged.
2. **`@/` alias + happy-dom aren't in the root vitest config.** `apps/manage` has its own
   `vitest.config.ts` (aliases `@` → `src`; api-client/environment → source) and is
   **excluded from the root vitest** `include`. Run manage tests via
   `pnpm --filter @engenty/manage test`; core tests run under the root config as before.
3. **Workspace packages must be built (`dist/`) before manage tests/build resolve
   `@engenty/*`.** Vite import-analysis resolves specifiers even for `vi.mock`-ed modules,
   so a one-time `pnpm turbo run build --filter=./packages/*` is a prerequisite (same as
   the normal predev step).
4. **Migration could not be applied via `pnpm db:migrate`** on the shared dev DB — this
   older `spike/tenant-box` branch is behind the migrations the shared DB already has
   (the known drift gotcha). The additive, idempotent DDL from
   `20260714000000_core_tenant_registry.sql` was applied directly via `psql` (no
   migration-history changes, safe on the shared DB); the migration file replays cleanly on
   a fresh DB. Do NOT run `supabase migration repair` here — it would disrupt the other
   worktree on the shared DB.
5. **Scope trims vs. the WP text:** tenants/users lists use a searchable table (no
   table/cards toggle — cosmetic, dropped to reduce Radix-in-happy-dom risk); the xyflow
   module dependency graph is omitted (per plan non-goals). User HR columns intentionally
   not surfaced.
6. **Bundle size:** `vite build` warns the main chunk is ~1.3 MB (grpc/opentelemetry pulled
   transitively, as in `apps/ui`). Functional, not an error. Follow-up: add the
   `@engenty/telemetry` → stub alias (as `apps/ui` does) and/or code-split if it matters.

### 6.2 WP8 live smoke (recorded 2026-07-13)

- Manage dev server boots on 5174; `GET /manage/` returns 200 with `<title>engenty
  manage</title>` both directly and through the core gateway (`http://127.0.0.1:8787/manage/`).
- API proxy verified: `GET /api/superadmin/tenants` through the manage Vite proxy returns
  **401** (reaches core auth), not 404.
- DB verified: `core.tenants` now has `tier` + `status`, existing rows backfilled to
  `platform` / `active`.
- Auth-gated UI flows (superadmin gate, tenant/user/module/flag CRUD payloads) are covered
  by the happy-dom component tests rather than a browser login (the session's preview tools
  were bound to another running dev server; a manual browser pass is still worthwhile before
  enabling in prod).

---

## 7. Phase 2 — Satellites + commercial packages (design level; write its own spec first)

### 7.1 Satellite management (own supabase per tenant)

Research verdict (2026-07-13): Supabase **Platform Kit** and the **Management API** are
hosted-platform-only — the Management API does not exist for self-hosted stacks; self-hosted
Studio is single-project and not embeddable. Supabase UI Library blocks themselves are
shadcn-registry, vendored, Apache-2.0, Vite-compatible.

**Decision: thin per-satellite admin facade in core, shaped Management-API-compatible.**
Each self-hosted stack exposes the seams Studio itself uses — postgres-meta (tables/roles/
SQL), GoTrue admin (users), Storage API, logs container. The facade translates
Management-API-style paths to those per-instance services, using credentials from the
satellite registry. Payoff: vendored Platform Kit components can run against either
`api.supabase.com` or our facade (its two Next.js proxy routes get ported into core routes
with our authz).

Sequencing: satellite registry table (endpoints, credential refs, pinned versions, health)
+ health checks + deep-links to each satellite's own Studio → facade (SQL/users/storage
first; logs last) → embedded Platform Kit panels. Provisioning/lifecycle (image build with
extra modules, compose stack, domains/TLS, upgrades) reuses the proven ghcr/Coolify deploy
per `tenancy-spec.md` §3; SupaPanel/Supascale are references only.

### 7.2 Commercial packages

**Authored as code, assigned via UI.** Catalog in a pro-only `packages/entitlements`
package, zod-validated, synced into DB at boot (same pattern as model pricing, with
restore-defaults). Shape (v1):

```jsonc
{
  "id": "team",                       // stable id, referenced by tenants
  "version": 3,                      // bump on any change; sync upserts
  "label": "Team",
  "modules": ["contacts", "projects", "knowledge-base"],  // allow-list; absent = blocked
  "featureFlags": { "kb.ai-triage": true },
  "aiUsagePolicy": {                 // exact shape of the existing AiUsagePolicy
    "period_mode": "calendar", "period_unit": "month",
    "included_cost_micros": 20000000,
    "hard_limit_cost_micros": 40000000,
    "enforcement_mode": "enforce"
  },
  "appLimits": { "maxUsers": 25 }    // v1: maxUsers only; extend when an enforcement point exists
}
```

DB: `core.packages` (synced catalog) + `core.tenants.package_id` +
`core.tenant_entitlement_overrides` (sparse per-tenant deltas, same triad as feature
flags). A resolver in core composes package → overrides → resolved entitlements and feeds
**existing enforcement points**: module allow-list → plugin effective-state blocked
reasons; flags → flag resolution; AI limits → the existing usage-policy engine (replacing
its free-text `tier`); `maxUsers` → check in user-create paths, with
`observe | enforce` mode like the AI policy. Manage UI: read-only catalog page, package
picker on tenant, override editor, resolved view. No authoring UI in v1.

## 8. Phase 3 — Billing (sketch)

Metering feeds per tenant (AI usage exists; add box-seconds, seats, storage) → monthly
rollups → invoice line items; price/overage rules live on the package definition; Stripe
or invoice-only decided then. Manage surfaces: tenant billing tab, revenue overview,
dunning → `tenants.status = suspended`. Costs stay `_micros`.

## 9. Open questions

1. Drop `tenant_connection_mode` in the release after Phase 1 ships (backfill landed in WP2)?
2. When to port the ops-tool backlog (§1) — bundled sweep or on demand?
3. AI-usage tab: confirm `/ai/v1/usage/admin/*` endpoints survived the Mastra 1.48
   migration before porting.
4. Phase 2: satellite credential storage — encrypted in core vs secrets backend.
5. Phase 2: which `appLimits` beyond `maxUsers` get real enforcement points.
