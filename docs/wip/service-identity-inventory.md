# Service-identity inventory — where does `userAccessToken` actually go?

CP1 of [PLAN-service-identity.md](../../PLAN-service-identity.md). No behavior
change; this doc is the contract that scopes CP4.

**Method.** Every non-test occurrence of `userAccessToken` under `apps/ai/src`
(35 files), plus a check of every Supabase client construction in the app.

## Headline finding: bucket B is empty

The plan assumed a population of "direct PostgREST/storage calls with the user
JWT for RLS" that would break under an engenty token. **There are none.**

`apps/ai` constructs exactly one Supabase client, in
[infra/database.ts](../../apps/ai/src/infra/database.ts), and it is built from
`SUPABASE_SERVICE_ROLE_KEY` — never from a caller's token:

```ts
return createClient(url, key, {            // key = SUPABASE_SERVICE_ROLE_KEY
  auth: { autoRefreshToken: false, persistSession: false },
});
```

Everything else that touches storage funnels through that adapter or through
core. In particular the two paths the plan singled out as likely bucket B are
not:

- `ENGENTY_WORKSPACE_FS_PROVIDER=supabase`
  ([workspace-fs-provider.ts](../../apps/ai/src/ai/workspace/workspace-fs-provider.ts))
  builds its files-sdk adapter from `createAiDatabaseAdapter()` — service role,
  with no reference to the scope token at all.
- The remote workspace sync path
  ([workspace-fs-mode.ts](../../apps/ai/src/ai/workspace/workspace-fs-mode.ts),
  [core-file-storage-client.ts](../../apps/ai/src/ai/workspace/core-file-storage-client.ts))
  reads `{ coreBaseUrl, userAccessToken }` and calls **core's** file-storage
  API with it. The name says "supabase provider"; the credential goes to core.

**Consequence for CP4:** the migration is mechanical. No call site needs to
branch on `credential.kind` to pick a different data path, and no call site
needs to be re-routed through a core module operation. The type split is worth
doing anyway — it is what keeps bucket B empty as the tree grows — but it
carries no behavioral risk in the current tree.

## Bucket A — bearer toward core (all 35 files)

Every consumer either (a) constructs `EngentyCoreClient({ coreBaseUrl,
userAccessToken })`, (b) sets an `Authorization: Bearer` header against
`coreBaseUrl`, or (c) just forwards the token deeper into apps/ai without
dereferencing it. All work unchanged with an engenty service token, because
core's auth chain verifies engenty principal tokens *first*
([auth-provider.ts](../../apps/core/src/security/auth-provider.ts)) and only
falls back to Supabase session resolution.

### A1 — Ingress: where a token enters a scope (4)

| File | Role |
|---|---|
| [api/http.ts](../../apps/ai/src/api/http.ts) | `createCoreAiScopeResolver` — parses the bearer, resolves workspace context, builds `AiSessionScope`. The seam CP3 must teach about service principals. |
| [app.ts](../../apps/ai/src/app.ts) | Puts the bearer on `engentyToolsRunAls`; builds a scope for the dispatch route. |
| [scheduler/service-invoker.ts](../../apps/ai/src/scheduler/service-invoker.ts) | Headless ingress — injects the vended service token as the scope credential. |
| [ai/jobs/task-job-scope.ts](../../apps/ai/src/ai/jobs/task-job-scope.ts) | Headless ingress for task jobs; asserts the resolved tenant matches the message's tenant. |

### A2 — The core client itself (2)

[ai/core-http-client.ts](../../apps/ai/src/ai/core-http-client.ts) (the single
`Authorization` header that matters) and
[ai/workspace/core-file-storage-client.ts](../../apps/ai/src/ai/workspace/core-file-storage-client.ts)
(wraps it, plus one raw `fetch` to core for streaming bodies).

### A3 — Scope plumbing: forwards the token, never dereferences it (13)

`ai/sessions/types.ts` (the field itself), `session-service.ts`,
`runtime-context.ts`, `workspace-runtime-spec.ts`, `agent-workspace-hook.ts`,
`task-workspace-hook.ts`, `connection-approval-grants.ts`,
`agent-ui-context-instructions.ts`, `ai/channels.ts`,
`ai/conversation/conversation-run.ts`, `delegate-run.ts`,
`resume-conversation-run.ts`, `ai/sandbox/sandbox-factory.ts`.

### A4 — Core-backed feature calls (12)

`api/skills-routes.ts`, `api/work-files-routes.ts`, `api/mcp-app-routes.ts`,
`api/realtime-tool-routes.ts`, `api/app-proxy-routes.ts`,
`api/agent-session-runs-routes.ts`, `api/attachments/tiered-attachments.ts`,
`api/remote-channels.ts`, `ai/mcp-apps/internal.ts`,
`ai/secrets-goal-grant.ts`, `ai/frontend-tool-gating/filter-agent-ui-for-scope.ts`,
`dal/api-catalog/api-catalog-search-store.ts`.

`ai/workspace/contracts.ts` (zod schema, `userAccessToken: z.string().min(1)`)
and `ai/workspace/workspace-fs-mode.ts` are shape-only and go with this group.

### A5 — Jobs (1)

[ai/jobs/app-build-steps.ts](../../apps/ai/src/ai/jobs/app-build-steps.ts) —
reuses the ALS token only when `als.tenantId === tenantId`, else falls back.
The tenant guard is already correct for a service principal.

## Bucket B — direct Supabase calls with the caller's token

**Empty.** See the headline finding.

## Bucket C — pass-through to third parties

**Empty**, and one near-miss worth recording as *not* a finding:

[ai/conversation/delegate-run.ts:236](../../apps/ai/src/ai/conversation/delegate-run.ts)
puts the scope token into Mastra's `RequestContext` under
`MASTRA_AUTH_TOKEN_KEY`. That key is in-process only — Mastra stores it in a
private registry and its sole special-casing is defensive:
`serializeForSpan()` replaces it with `[REDACTED]` so observability exporters
cannot leak it into spans. It is not forwarded to any third party.

## Findings to carry into CP4 (not blockers)

1. **A stored token can outlive its own validity.**
   [api/app-capabilities.ts](../../apps/ai/src/api/app-capabilities.ts) copies
   the caller's token into an in-process grant with a 5-minute TTL
   (`CAPABILITY_TTL_MS`). With a 15-minute service token, a handle minted from
   a token that is already ~11 minutes old resolves to an expired credential.
   Today's Supabase tokens (1 h) make this invisible; a 15-minute TTL makes the
   window 1-in-3. **CP4 should store the credential's expiry alongside the
   grant and clamp the handle TTL to `min(CAPABILITY_TTL_MS, tokenExpiry - now)`.**
   Note this path is user-driven (App backends), so it is unlikely to see a
   service credential — but the clamp is cheap and the failure is silent.

2. **`userAccessToken` is optional (`userAccessToken?: string`).** Roughly half
   the A3/A4 sites are `if (!token) return null`-shaped: a missing credential
   degrades a feature silently rather than erroring. CP4's `credential` field
   should stay optional for the same reason — making it required would turn a
   set of soft feature-gates into hard failures, which is a much bigger change
   than the plan intends.

3. **Naming.** After CP4 the field is `credential`, and `userAccessToken` is a
   shim. The ~22 test files that build scopes literally
   (`{ ..., userAccessToken: "test-token" }`) keep compiling through the shim;
   they are migrated at CP6 when the compiler forces it.

## What CP4 actually changed (and what it deliberately did not)

CP4 migrated every read of **`AiSessionScope.userAccessToken`** to
`scopeAccessToken(scope)` / `resolveScopeCredential(scope)`.

It did **not** rename the same-named property on the downstream option bags
that carry a bearer onward — `EngentyCoreClientOptions.userAccessToken`,
`AppCapabilityGrant.userAccessToken`, `ExternalChannelDispatchScope`,
`EngentyToolsRunContext`. Those are "the bearer to send", genuinely agnostic to
which kind of credential produced it, and renaming ~40 mechanical sites would
have buried the parts of CP4 that carry actual risk (the exchange path, the
scope-kind derivation, the TTL clamp). They are a CP6 rename, when the shim
goes and the compiler enumerates them — which is also when the plan's
`grep -rn "userAccessToken" apps/ai/src` acceptance check can pass.

## Acceptance

- [x] Every non-test `userAccessToken` consumer under `apps/ai/src` is bucketed.
- [x] Every B-entry names its replacement strategy — vacuous: there are none,
      and the doc shows *why* rather than asserting it.
- [x] C-entries flagged — none; the one candidate is explained and dismissed.
