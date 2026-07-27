# PLAN: First-class service identity (decouple headless AI runs from Supabase sessions)

Status: **CP1–CP4 implemented** · CP5–CP6 blocked on production · Prerequisite:
v0.1.80 (self-renewing service credential,
`apps/ai/src/ai/service-credential.ts`) is shipped.

| CP | State |
|---|---|
| CP1 Inventory | ✅ [docs/wip/service-identity-inventory.md](docs/wip/service-identity-inventory.md) — **bucket B is empty** |
| CP2 `core.service_credential` + `POST /api/auth/service-token` | ✅ 16 tests; migration applied locally |
| CP3 Workspace context for service principals | ✅ 4 tests |
| CP4 `AiScopeCredential` + `ENGENTY_AI_SERVICE_SECRET` | ✅ 690 apps/ai tests green |
| CP5 Prod cutover + one-week soak | ⛔ needs prod credential + Coolify + elapsed time |
| CP6 Remove the Supabase service user | ⛔ gated on CP5 — doing it now deletes production's only working path |

**Operator documentation:** [docs/content/dev/service-identity.md](docs/content/dev/service-identity.md).

## Deviations from the plan as written

Recorded here so the next reader is not surprised by the code:

1. **Bucket B turned out to be empty.** The plan assumed a population of direct
   PostgREST-with-user-JWT calls that would break under an engenty token.
   `apps/ai` builds exactly one Supabase client and it uses the service-role
   key. This removed most of CP4's expected risk — see the inventory for the
   evidence, including why `ENGENTY_WORKSPACE_FS_PROVIDER=supabase` is not a
   counter-example.
2. **`capabilities` is `jsonb`, not `text[]`.** Matches `core.api_tokens`, so
   both tables share one row-mapper shape.
3. **Credential management got its own routes.** The plan named only the
   exchange endpoint; creating and revoking need an authenticated,
   capability-clamped path, so `POST/GET/DELETE /api/auth/service-credentials`
   exist alongside it. The CLI drives those.
4. **`credential` is optional, and `userAccessToken` is a shim function, not a
   getter.** Roughly half the consumers treat a missing credential as "degrade
   this feature", not "fail". Making it required would convert a set of soft
   feature-gates into hard failures — a much larger behavioral change than CP4
   intends. Reads go through `scopeAccessToken()` / `resolveScopeCredential()`.
5. **CP4 did not rename the downstream option-bag property**
   (`EngentyCoreClientOptions.userAccessToken` and friends). That is a
   mechanical CP6 rename; see the inventory's closing section for why it was
   scoped out.
6. **One extra fix, from CP1's findings:** app-capability handle TTL is now
   clamped to the captured token's remaining life. A 15-minute service token
   makes it possible for a 5-minute handle to outlive its own credential and
   fail silently at the App backend; 1-hour Supabase sessions hid this.

## Why this plan exists

Headless work in apps/ai — the trigger scheduler, the task-job substrate,
remote channels — acts as "the AI service principal". Today that principal is
a **Supabase user** (`service@engenty.local`): its access token is both the
identity toward core *and* the RLS credential for data access, because
`AiSessionScope.userAccessToken` flows into every module operation and tool
call. v0.1.80 made the token self-renewing (password grant + cache), which
fixed the operational failure (tokens froze in an env var and expired), but
the architecture is still wrong:

1. **The service is a fake human.** It lives in `auth.users`, joins a tenant
   like an employee, and its capabilities are whatever a tenant member gets.
   There is no way to scope it down (it doesn't need `module.*` write access
   to everything) or up (cross-tenant, if multi-tenant scheduling ever lands).
2. **Revocation is coarse.** Disable the Supabase user — nothing finer.
   No jti, no audit trail of which token did what.
3. **Supabase is a hard dependency of identity.** Every headless run does a
   password grant against Supabase auth before it can do anything. An auth
   outage stops scheduled triggers even when core + DB are fine.
4. **The platform already has the right primitive and doesn't use it.**
   `POST /api/auth/api-tokens` (apps/core/src/api/routes/auth/auth-routes.ts)
   signs HS256 principal tokens with `ENGENTY_SECURITY_JWT_SECRET`:
   `principalType: "service"`, capability-clamped to the creator, `jti` stored
   in `stores.apiTokens` and revocable, audit-logged. Nothing consumes it.

**Target state:** the AI service principal is an engenty-core `api_token`
(principal type `service`). Supabase sessions are for humans only. The
`service@engenty.local` Supabase user is deleted.

## Existing proof that this works end-to-end

Do not treat "an engenty token can drive module operations" as a risk — it is
already shipped:

- **Remote channels** mint per-user *actor tokens* via
  `POST /api/auth/actor-token` (apps/core/src/api/routes/auth/actor-token-routes.ts)
  and run entire agent turns on them. Actor tokens are engenty principal
  tokens (`signPrincipalToken`), not Supabase tokens. Whole tool-catalog turns
  execute with them today.
- **Core's auth chain** (apps/core/src/security/auth-provider.ts) verifies
  engenty tokens first (`verifyToken` → `verifyAccessToken` in
  apps/core/src/security/auth.ts) and only falls back to Supabase session
  resolution (`resolveAdminFallback`). Any core route behind the provider
  accepts an engenty token already.
- The actor-token route explicitly accepts **both** an engenty principal token
  and the Supabase-minted service JWT as the caller — the dual-stack period
  this plan needs is already the route's design.

The genuinely open work is therefore narrow: (a) issue a durable service
credential that mints short-lived engenty tokens, (b) make workspace-context
resolution answer for a service principal, (c) audit the places in apps/ai
that hand `userAccessToken` **directly to Supabase** (PostgREST/storage)
rather than to core, and give them a non-user path.

## Naming (use these exactly)

| Thing | Name |
|---|---|
| New core route: exchange a service *refresh secret* for a short-lived access token | `POST /api/auth/service-token` |
| DB table for durable service credentials | `core.service_credential` |
| Env var: the durable secret apps/ai holds | `ENGENTY_AI_SERVICE_SECRET` (replaces `ENGENTY_AI_SERVICE_EMAIL/PASSWORD`) |
| apps/ai token vendor (extend, don't replace) | `apps/ai/src/ai/service-credential.ts` |
| Scope credential union | `AiScopeCredential` in `apps/ai/src/ai/sessions/types.ts` |
| CLI | `engenty service-token create\|list\|revoke` (apps/core/src/cli) |
| Principal | `principalType: "service"`, `sub` = credential id, `auth_method: "service_credential"` |

## Checkpoints

Ship each checkpoint separately; every one leaves `main` releasable. The
dual-stack (Supabase service JWT still accepted everywhere) holds until CP6.

---

### CP1 — Inventory: where does `userAccessToken` actually go?

No behavior change. Produce `docs/wip/service-identity-inventory.md` listing
every consumer of `AiSessionScope.userAccessToken` under `apps/ai/src`
(~30 files; top offenders: `api/app-proxy-routes.ts`, `api/http.ts`,
`api/agent-session-runs-routes.ts`, `api/skills-routes.ts`,
`ai/sessions/*`), classified into exactly three buckets:

- **A: Bearer toward core** (`EngentyCoreClient`, module operations, tool
  catalog). Works with engenty tokens today — no code change needed, only
  verification.
- **B: Direct Supabase calls** (PostgREST with the user JWT for RLS, storage,
  `ENGENTY_WORKSPACE_FS_PROVIDER=supabase` paths). These BREAK with an
  engenty token and each needs a decision: route through core, or use the
  service-role client + explicit tenant filter.
- **C: Pass-through to third parties** (should be none; if found, flag as a
  security finding regardless of this plan).

Acceptance: the doc exists, every file is bucketed, each B-entry names its
replacement strategy. This doc is the contract for CP4's scope.

### CP2 — Core: durable service credentials + `POST /api/auth/service-token`

The api-tokens route mints long-lived bearer tokens — good, but a 90-day
bearer in an env var is what we're escaping. Instead: a **durable secret that
can only be exchanged for short-lived tokens**.

Migration `core.service_credential`:

```sql
CREATE TABLE core.service_credential (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL,
  name         text NOT NULL,                  -- "ai-service" for this plan
  secret_hash  text NOT NULL,                  -- sha256 of the raw secret
  capabilities text[] NOT NULL,
  disabled_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);
```

Route (register in `registerAuthRoutes`, apps/core/src/api/routes/auth/auth-routes.ts;
follow the existing rate-limit + audit patterns in that file):

```ts
// POST /api/auth/service-token  { credentialId, secret }
// → { token, expiresAt }   (access token, TTL 15 min)
params.app.post("/api/auth/service-token", async (c) => {
  // 1. rate-limit per credentialId+ip (checkRateLimit)
  // 2. load core.service_credential; reject disabled/unknown; compare
  //    sha256(secret) constant-time (timingSafeEqual)
  // 3. signPrincipalToken({
  //      principal: {
  //        principalId: credential.id,
  //        principalType: "service",
  //        tenantId: credential.tenant_id,
  //        authMethod: "service_credential",
  //        tokenType: "access",
  //        capabilities: credential.capabilities,
  //        ...
  //      },
  //      tokenType: "access",
  //      expiresInSeconds: 900,
  //    })
  // 4. touch last_used_at; recordCoreAuditEvent("auth.service_token_minted")
});
```

CLI `engenty service-token create --tenant <id> --name ai-service
[--capability <cap>...]` prints the raw secret exactly once (store the hash).
`list` / `revoke` (revoke = set `disabled_at`; the 15-min access TTL is the
revocation lag, same tradeoff the api-token store makes via jti).

Default capability set for the AI service (start narrow; CP1's bucket A tells
you what it actually calls): `module.*` invoke, `workspace.read`,
actor-token minting (whatever capability `actor-token-routes.ts` checks —
read it, it names the exact string).

Tests: exchange happy path, wrong secret, disabled credential, rate limit,
capability clamp, token verifies through `verifyAccessToken`.

### CP3 — Core: workspace-context answers for service principals

`createCoreAiScopeResolver` (apps/ai/src/api/http.ts) resolves scope by
calling core's workspace-context endpoint
(apps/core/src/api/routes/user-management/setup-routes.ts). Today that path
assumes a Supabase user (memberships, onboarding, `currentTenant`). Teach it
service principals:

```ts
// setup-routes.ts, before the Supabase-user path:
const principal = await authProvider.verifyToken(authHeader);
if (principal?.principalType === "service") {
  return c.json({
    userId: principal.principalId,        // credential id — stable, auditable
    onboarded: true,
    isSuperAdmin: false,
    isTenantAdmin: false,
    tenantRole: "service",
    currentTenant: { id: principal.tenantId /* + name lookup */ },
  });
}
```

Note `workspaceContextScopeSchema` in apps/ai/src/api/http.ts must accept
`tenantRole: "service"` — extend the zod enum there in the same change.

Acceptance: `resolveSchedulerServiceScope()` succeeds when
`ENGENTY_AI_SERVICE_JWT` holds a CP2-minted engenty token (this is a valid
intermediate test — the static-JWT override in service-credential.ts takes
any bearer).

### CP4 — apps/ai: split identity from data-access credential

The type change that makes bucket B impossible to miss:

```ts
// apps/ai/src/ai/sessions/types.ts
export type AiScopeCredential =
  | { kind: "user"; token: string }      // Supabase session — humans
  | { kind: "service"; token: string };  // engenty service token

export interface AiSessionScope {
  // ...
  credential: AiScopeCredential;
  /** @deprecated shim — remove at CP6. Returns credential.token. */
  userAccessToken: string;
}
```

Mechanics: add `credential`, keep `userAccessToken` as a getter-style shim so
the tree compiles, then migrate consumers per CP1's buckets:

- **Bucket A** files: switch to `scope.credential.token` mechanically — the
  bearer works for both kinds.
- **Bucket B** files: branch on `credential.kind`. For `service`, use the
  service-role Supabase client with an explicit `tenant_id` filter (the
  pattern `actor-token-routes.ts` and the DALs already use) or route the call
  through a core module operation. **Never** send an engenty token to
  PostgREST — it will 401 (or worse, be treated as anon).
- Where a headless run acts *for a user* (remote channels already, task runs
  eventually), mint an **actor token** — that is the existing, correct answer
  for "service needs user-context access", do not invent another.

Extend `service-credential.ts` (keep its name, cache, in-flight dedup,
120s margin — all of it):

```ts
// resolution order in getServiceAccessToken():
// 1. ENGENTY_AI_SERVICE_JWT           → static override (unchanged)
// 2. ENGENTY_AI_SERVICE_SECRET        → POST /api/auth/service-token   (new)
// 3. ENGENTY_AI_SERVICE_EMAIL/PASSWORD→ Supabase password grant (until CP6)
```

`ENGENTY_AI_SERVICE_SECRET` format: `<credentialId>.<rawSecret>` so one env
var carries both exchange inputs. Add it to the env manifest
(apps/core/src/cli/env-setup/env-manifest.ts + NON_CONFIGURABLE_ENV_KEYS in
env-manifest-types.ts) and both compose files
(deploy/docker-compose.yaml, deploy/docker-compose.prebuilt.yaml — the
engenty-ai service env block).

Acceptance: full apps/ai suite green in BOTH modes — once with the
email/password env (regression) and once with only `ENGENTY_AI_SERVICE_SECRET`
(new path). The second mode is the checkpoint's actual point.

### CP5 — Prove it in production

**Not startable from a dev machine** — it needs a credential minted against the
production tenant, Coolify env access, and a week of elapsed time. Runbook:

1. Authenticate the CLI against production, then mint the credential. Grant
   `core.users.impersonate` only if remote channels are live there:
   ```bash
   pnpm engenty service-token create --name ai-service \
     --api-url https://engenty.engrd.xyz \
     --capability module.read,module.write,module.execute \
     --capability core.users.impersonate
   ```
   The secret prints once. Note the migration must be applied first — it ships
   with the release, via the `engenty-migrate` one-shot.
2. In Coolify set `ENGENTY_AI_SERVICE_SECRET=<credentialId>.<rawSecret>` on
   `engenty-ai`. Leave `ENGENTY_AI_SERVICE_EMAIL/PASSWORD` in place for this
   step — the secret takes precedence, so they are a rollback, not a conflict.
   Confirm `ENGENTY_AI_SERVICE_JWT` is **unset**: it overrides everything.
3. Redeploy. Verify, in order:
   - `service access token minted` in the `engenty-ai` logs;
   - no `scheduler disabled — no service credential configured`;
   - `pnpm engenty service-token list` shows a non-null `lastUsedAt`;
   - a real scheduled trigger fires; a task-job dispatch completes;
   - if remote channels are live, one inbound message still round-trips
     (that exercises actor-token minting, i.e. the capability grant).
4. Once green, **remove** `ENGENTY_AI_SERVICE_EMAIL/PASSWORD` from Coolify and
   redeploy. This is the step that proves the Supabase user is unused.
5. Soak at least a week — one full cycle of every schedule — before CP6.

Rollback at any point: clear `ENGENTY_AI_SERVICE_SECRET`, restore
`ENGENTY_AI_SERVICE_EMAIL/PASSWORD`, redeploy. The password grant is still in
the binary until CP6.

### CP6 — Remove the Supabase service user

**Do not start before CP5 step 4 has soaked.** Every item below deletes a path
production currently depends on; as of today production has no service
credential configured at all, so shipping CP6 now would leave the scheduler
with nothing to authenticate as.

- Delete the password-grant branch from `service-credential.ts`; drop
  `ENGENTY_AI_SERVICE_EMAIL/PASSWORD` from manifest + compose + `.env.example`.
- Delete the `userAccessToken` shim; `credential` is the only field. (The
  compiler finds any straggler — including the ~22 test files that build scope
  literals, and the downstream option bags CP4 left named `userAccessToken`:
  `EngentyCoreClientOptions`, `AppCapabilityGrant`, `ExternalChannelDispatchScope`,
  `EngentyToolsRunContext`. Rename those to `accessToken` in the same pass;
  that is what makes the grep in "Definition of done" pass.)
- Gut `scripts/mint-service-jwt.mjs` down to its one remaining job (the
  `--vault` pg_cron secret) or delete it; update `pnpm service:jwt` docs.
- Remove the Supabase-JWT fallback the actor-token route documents for the
  service caller (keep the general admin fallback for humans).
- Delete `service@engenty.local` from prod + dev Supabase.
- Update docs/content/dev/remote-channels.md and
  docs/content/setup/platform-settings.md.

---

## Risks / decisions an implementer must not make silently

- **Capability string for actor-token minting**: it is
  `core.users.impersonate` (`ACTOR_TOKEN_CAPABILITY` in
  `actor-token-routes.ts`). Covered by `*`, **not** by `module.*`. Grant it
  only when remote channels are actually in use.
- ~~**`tenantRole: "service"`** will hit every place that switches on tenant
  role~~ — audited at CP3. All 41 sites either set the role (Supabase-user
  paths, unaffected) or test `=== "admin"` / `=== "member"` with a
  least-privilege fall-through (`resolve-grants.ts`, `user-capabilities.ts`,
  the apps/ai admin gates). A service principal is therefore denied, never
  escalated. Three local `tenantRole?: "admin" | "member" | null` declarations
  in apps/ai were widened so the tree compiles.
- **Multi-tenant scheduling** (one scheduler serving N tenants) becomes
  *possible* with per-tenant credentials but is explicitly out of scope —
  the scheduler's single-tenant assertion in
  apps/ai/src/ai/jobs/task-job-scope.ts stays.
- **Do not** extend token TTL as a workaround for anything found in bucket B.
  15 minutes is the design; the vendor's cache makes it cheap.

## Definition of done

Production runs scheduled triggers, task jobs, and remote channels with zero
rows in `auth.users` belonging to the platform itself; every service action in
the audit log carries `principalType: "service"` with a `jti`; revoking the
credential stops the service within one token TTL; and
`grep -rn "userAccessToken" apps/ai/src` returns nothing.
