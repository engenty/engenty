# PLAN — Act-first security fixes (agentic infra audit)

**Status:** ready to pick up · **Owner:** unassigned · **Created:** 2026-08-03
**Source:** agentic-infrastructure audit 2026-08-03 (artifact `3bec3085-f016-4f92-96a5-f4b44feccb24`), the four **Critical** findings plus the one enabling fix that let the worst of them hide.
**Branch guidance:** these are small, high-urgency diffs. Do them **directly on `main`** unless a co-worker is live in this shared checkout (see Ground rules). Ship as a normal patch release when green.

> Scope discipline: this plan fixes exploitable / fail-open security holes only. It deliberately does **not** take on the broader consolidation (approval-store unification, run-ledger merge, sandbox decision) — those are separate plans. Do not scope-creep. Where a proper fix needs a product decision (AUTH-03 / WS3), stop and get it rather than guessing.

---

## Ground rules for the agent picking this up

1. **This is `engenty-pro`, the live checkout, possibly shared with a human session.**
   - **Never** `git stash`, `git add -A`, or `git checkout -- .` — a co-worker's in-flight files live here. Stage only the exact files you changed, by path.
   - Before starting, run `git status`. The working tree at plan time already had uncommitted changes to `apps/core/src/security/policy.ts` + `policy.test.ts` (the WS3 widening) and an untracked migration `apps/core/supabase/migrations/20260803090000_ai_thread_service_created.sql`. **Do not blindly commit these** — WS3 is a decision gate.
   - If a human is actively editing, do fixes in a detached temp worktree and land via `git push . HEAD:main` — see the `release` skill.
2. **Verify each fix twice:** reproduce the hole (or its type error / failing assertion) *before*, and confirm it's closed *after*. Add a regression test for every item.
3. **Gate:** `pnpm build && pnpm typecheck && pnpm check && pnpm test` must pass before release. WS5 (typecheck-to-zero) is what makes `pnpm typecheck` meaningful for `apps/core` — do it first or in lockstep.
4. **Release:** patch bump only (`RELEASE_BUMP=patch`), via the `release` skill. Never hand-edit `CHANGELOG.md` / `changelog.json` / version / tags.
5. **Order:** WS1 → WS2 → WS4 are independent one-file fixes, do them in parallel. WS3 needs a decision first. WS5 is the enabler — start it immediately since WS1's verification leans on it.

---

## WS1 — `capabilityCovers` called with a string → member→admin escalation  🟥 CRITICAL (AUTH-01)

**The bug.** `apps/core/src/api/routes/auth/actor-token-routes.ts:95-97`:

```ts
const allowed = caller.capabilities.some((held) =>
  capabilityCovers(held, ACTOR_TOKEN_CAPABILITY)   // `held` is a string
);
```

`capabilityCovers(granted: string[], required: string)` (`packages/plugin-sdk/src/capability-match.ts:9`) does `granted.includes("*")`. Called on a **string**, `.includes("*")` is a JS substring test. `ACTOR_TOKEN_CAPABILITY = "core.users.impersonate"` (`actor-token-routes.ts:37`). Any single held capability that contains the character `*` passes — and `tenant.member` holds `"module.*"` (`apps/core/src/security/role-profiles.ts:35`).

**Exploit chain.** Logged-in member → `caller.capabilities` includes `"module.*"` → `POST /api/auth/actor-token { user_id: <tenant admin>, tenant_id: <own tenant> }` → passes the guard → returns a token carrying the **target admin's** resolved grants (`resolveGrants` at `:125-128`, keyed off `tenantRoleForUser` which returns `admin`). The route already blocks cross-tenant (`:113-118`) but not intra-tenant privilege climb. There is **no rate limit** on this route (unlike `/service-token` at `:394`).

**The fix.** Pass the whole array once:

```ts
const allowed = capabilityCovers(caller.capabilities, ACTOR_TOKEN_CAPABILITY);
if (!allowed) {
  return c.json({ error: "Forbidden" }, 403);
}
```

This is exactly how `policy.ts:27` and every other correct site calls it. After the fix, `module.*` no longer covers `core.users.impersonate` (different first segment; `capability-match.ts:20-21` checks `core.*`, which members don't hold) — so only holders of `core.*` / `core.users.impersonate` / `*` / `core.superadmin` can mint actor tokens, which is the intent.

**Guard the type from regressing.** The reason this shipped: `capabilityCovers(held, …)` with `held: string` is a `TS2345` error that `apps/core`'s ~50 ignored typecheck errors buried. WS5 closes that gap globally; this WS just fixes the call.

**Also add** (defense in depth, same file): a rate limit on `/api/auth/actor-token` mirroring `/service-token`'s `checkRateLimit` (`auth-routes.ts:394`), keyed by `caller.principalId` + source IP. Minting an impersonation token is at least as sensitive as exchanging a service secret.

**Test.** `apps/core/src/api/routes/auth/actor-token-routes.test.ts` (create if absent):
- a caller with `capabilities: ["module.*", "tenant-settings.read"]` gets **403** requesting an actor token for another user — this fails today, passes after.
- a caller with `["core.users.impersonate"]` (or `["core.*"]`, `["*"]`) gets **200**.
- unit-assert directly: `capabilityCovers(["module.*"], "core.users.impersonate") === false` and `capabilityCovers("module.*", "core.users.impersonate")` is a compile error (leave a `// @ts-expect-error` regression guard so re-introducing the scalar form fails typecheck).

**Verify.** `pnpm --filter @engenty/core test`; then `pnpm --filter @engenty/core typecheck` shows the `actor-token-routes.ts` TS2345 gone.

**Risk / rollback.** Very low — narrows authorization. Only risk is a legitimate integration that was (accidentally) relying on the hole; there should be none since the correct capability (`core.users.impersonate`) is what the route was always meant to require. Single-file revert if needed.

---

## WS2 — mint routes launder short-lived tokens into durable ones  🟥 CRITICAL (AUTH-02)

**The bug.** Two routes require only *a valid token* and clamp capabilities to the caller — but escalate **lifetime** dramatically:
- `POST /api/auth/service-credentials` (`auth-routes.ts:478-521`) → a **never-expiring** service credential (the `<id>.<secret>` env-var format).
- `POST /api/auth/api-tokens` (`auth-routes.ts:569-…`) → a **30–90 day** bearer.

The only checks are `requireAuth` + `clampCapabilities(requested, principal.capabilities)` (`user-capabilities.ts:50`). So a holder of a **900-second** service token (`SERVICE_TOKEN_TTL_SECONDS`, `auth-routes.ts:447`) can mint a durable credential with identical power — the exact thing service identity exists to escape (the route's own comment at `:376-380` says "a 15-minute access token, not a 30-day bearer"). Chained with WS1: member → `*` actor token → durable `*` credential.

**The fix.** Gate both mint routes on an explicit capability, not mere authentication. Add a required capability and check it before minting:

```ts
// after requireAuth, before minting:
if (!capabilityCovers(principal.capabilities, "core.credentials.manage")) {
  return c.json({ error: "Forbidden" }, 403);
}
```

- Introduce capability `core.credentials.manage` (name it consistently with existing `core.*` capabilities — grep `role-profiles.ts` for the naming pattern). Grant it to **tenant admins** (add to the `tenant.admin` profile) and superadmins; **do not** add it to `tenant.member`, and **do not** grant it to the default agent/service bundles.
- Apply the identical guard to **both** `/service-credentials` and `/api-tokens`.
- Additionally, **forbid principals whose own token is short-lived / already-derived from minting a longer-lived one.** Simplest correct rule: reject when `principal.authMethod === "service_credential"` or `principal.tokenType === "api_token"` (a derived credential cannot beget another). Human/admin sessions (`authMethod` user/oauth) with the new capability are the only legitimate minters. Return 403 with a clear reason.

**Test.** In an auth-routes test:
- a service-token principal (`authMethod: "service_credential"`) → **403** on both routes.
- a `tenant.member` user → **403** (lacks `core.credentials.manage`).
- a `tenant.admin` user → **200**, and the returned credential's capabilities are still clamped to the admin's set.
- capability presence: assert `tenant.admin` profile includes `core.credentials.manage` and `tenant.member` does not.

**Verify.** `pnpm --filter @engenty/core test`. Manually: mint a service token, then attempt `/service-credentials` with it → 403.

**Risk / rollback.** Medium-blast if a real deployment currently mints credentials using a non-admin or a derived token. Check callers first: `grep -rn "/api/auth/service-credentials\|/api/auth/api-tokens" apps modules scripts deploy docs`. The CLI path (`engenty service-token create`) mints via the store directly, not this HTTP route, so it is unaffected — confirm. If a legitimate automation mints tokens, give it the new capability explicitly rather than reopening the route.

---

## WS3 — do not commit the `policy.ts` approval-gate widening as-is  🟥 CRITICAL (AUTH-03) · **DECISION GATE**

**The situation.** The working tree has an **uncommitted** change to `apps/core/src/security/policy.ts` (+ `policy.test.ts`) that exempts *agents riding the service token* from the blanket approval escalation. Current code (`policy.ts:95-104`):

```ts
const isPlatformServiceLane =
  auth.principalType === "service" &&
  auth.authMethod === "service_credential";
if (
  auth.principalType !== "user" &&
  !isPlatformServiceLane &&
  (input.requiresApproval || input.riskLevel === "high" || input.riskLevel === "critical")
) {
  return { action: "require_approval", reason: "operation requires human approval" };
}
```

The exemption's justifying comment (`policy.ts:79-94`) points at "the agent escalation profile policy above" as the replacement gate. **That policy is registered only when `isAgentEscalationEnabled`** (`apps/core/src/api/server.ts:53-58, 255`) — i.e. `config.agentEscalationEnabled === true` or `ENGENTY_AGENT_ESCALATION === "true"`. That env var appears in **no** env manifest (`apps/core/src/cli/env-setup/env-manifest.ts`) and **no** compose file (`deploy/docker-compose*.yaml`). So in every real deployment the replacement gate is inert, and this change removes the *only* active gate on high-risk / approval-required headless agent ops — leaving only the AI-side pre-gate (advisory, in-process) and the connections/secrets module policies.

**Why it was written.** It works around a real deadlock: chat/task approvals are stored in three unsynced places, so an approved task re-dispatches, presents its grant to the AI pre-gate, passes, then hits *this* branch and 202s again — approve → re-run → 202, forever. (Full analysis: audit §5.3.) The widening makes the loop terminate by removing the gate.

**This is a product/security decision — get it from Matthias / the board before committing.** Present these options:

- **Option A (recommended interim): keep the gate, ship the flag on.** Revert the working-tree widening (`git restore --source=HEAD --staged --worktree apps/core/src/security/policy.ts apps/core/src/security/policy.test.ts` — *only* these two paths), and instead **enable `ENGENTY_AGENT_ESCALATION` in the deployments** by adding it to `env-manifest.ts` (default `"true"`) and to `deploy/docker-compose.yaml` + `docker-compose.prebuilt.yaml`. Then verify the escalation profile policy actually resolves headless agent runs correctly (grants ∪ goal grants; escalate on the gap). This keeps a real gate active. The deadlock is then addressed properly by the *approval-store unification* (separate consolidation plan), not by removing enforcement.
- **Option B: commit the widening, but only together with the flag on.** If the board accepts that service-lane agents are governed solely by the escalation policy + pre-gate, then commit the widening **and** ship `ENGENTY_AGENT_ESCALATION=true` in the same release, so the "replacement gate" the comment relies on actually exists at runtime. Committing the widening *without* the flag is the one outcome to avoid.
- **Option C (do not pick without explicit sign-off): commit the widening, leave the flag off.** Documented here only so it is a conscious rejected choice, not an accident. This is the current uncommitted state and it fails open.

**Whichever branch:** update the load-bearing comment in `apps/ai/ai/tools/engenty-tools/lib/tool-approval.ts:8-10`, which states core's rule as "an agent principal requires approval when `requiresApproval || riskLevel ∈ {high, critical}`" — that is false under the widening and must match whatever ships.

**Test.** `policy.test.ts` must encode the chosen contract explicitly, with a comment naming the decision:
- service-credential principal, no agent id, high-risk op → assert the decided action.
- service-credential principal **with** agent id, high-risk op → assert the decided action (this is the case the widening changes).
- with `ENGENTY_AGENT_ESCALATION` on, confirm the escalation profile policy fires and resolves grant-covered ops to `allow`, gap ops to `require_approval`.

**Verify.** With a dev stack: run a headless task whose specialist calls a high-risk op **without** a grant → must **not** silently execute; it must pause into the durable task-approval flow (blocked + inbox `tool_approval`). This is the behavioral acceptance test for the whole item.

**Risk.** This is the highest-judgment item. The failure mode of getting it wrong is silent: high-risk agent actions execute unapproved with no error. Do not rush it; if the decision isn't available, leave the working tree as-is (uncommitted) and ship WS1/WS2/WS4 without touching policy.ts.

---

## WS4 — App-originated connector writes execute with no approval  🟥 CRITICAL (CON-01)

**The bug.** Chain:
1. `modules/connections/src/policy.ts:96-101` — for a **user** principal with an `ask` outcome, the connections profile policy returns `null` ("the AI pre-gate owns the approval UX").
2. `apps/core/src/security/policy.ts:98-104` — the blanket escalation only fires for `principalType !== "user"`.
3. `packages/connections-sdk/src/execute.ts:95-96` — on `ask` with a live (user) principal, execution **proceeds**.
4. Apps always call core with the **viewing user's** token: `app-proxy-routes.ts:528-552` mints a capability handle from `caller.userAccessToken` and invokes `app_call` / `app_call_privileged`; the direct `engenty_call` path (`:506`) uses `client.invokeTool` on the user token too.

So an App that declares e.g. `gmail_send_message` (a `write`-group connector action) runs it as a **user** principal, hits case (1) → (3), and **sends mail with no approval** — while `modules/engenty-apps/ai/skills/engenty-bridge/SKILL.md` promises the app-coder a `pending_approval` result, and `app-proxy-routes.ts:629-655` maps a 202 this path never produces. In chat the AI pre-gate covers the gap; **outside chat (Apps, and any direct HTTP invoke) it is uncovered and fails open.** This is PLAN-apps-connections-gap Phase 4 item 2, still unverified.

**The fix — two layers, do both.**

**Layer 1 (immediate, closes the hole): make the App transport an autonomous context for connector policy.** The connections policy keys "who owns the approval UX" off `principalType !== "user"`. An App call is *not* an interactive chat turn even though it rides a user token — there is no chat pre-gate behind it. Make that explicit:
- The App proxy already knows it's an App call. Propagate an **app-origin marker** on the invoke so downstream policy can treat it as non-interactive. Preferred: set a header (e.g. `x-engenty-call-origin: app`) in `app-proxy-routes.ts` on the `invokeTool` calls (both the `engenty_call` direct path at `:506` and the `app_call`/`app_call_privileged` path at `:540`), plumb it into `PrincipalContext`/`PolicyInput` as a `transport`/origin field, and in `modules/connections/src/policy.ts:96-101` treat `origin === "app"` the same as `isAutonomous` — i.e. `ask` → record durable approval request + `require_approval` (202), never the permissive `null`.
- Confirm the 202 → `pending_approval` mapping (`app-proxy-routes.ts:629-655`) now actually triggers, so the app-coder contract becomes true instead of aspirational.
- **Interim hard stop if plumbing an origin field is too large for this security sweep:** in the App proxy, before invoking, reject `ask`/`write`/`destructive`-group connector operations outright (map to a clear `apps.connectorWriteRequiresApproval` error) rather than letting them through. Fail closed now, do the clean origin-aware approval in a fast follow. A blocked write is a bug report; an unapproved sent email is an incident.

**Layer 2 (follow-up, tighten authority — may be split to a fast-follow):** every non-read connector action currently maps to the single capability `module.connections.write` (`packages/connections-sdk/src/runtime.ts:113-115`), so one write grant spans Gmail-send + Slack-post + OneDrive-upload (CON-02). Not required to close CON-01, but note it in the release notes and file the follow-up: per-connector write capabilities (`module.connections.write.<connector>`).

**Test.**
- `modules/connections` policy test: an `ask`-outcome `write` action with `origin: "app"` (or the autonomous flag the fix uses) → `require_approval` + a recorded approval request; with `origin: chat`/interactive user → still `null` (unchanged chat behavior).
- App-proxy integration test: an App invoking a `write`-group connector op returns `{ status: "pending_approval" }` (or the interim hard-stop error), **not** a success with the action performed. Assert the connector handler was **not** called.

**Verify.** With a dev stack + a connected Gmail: build a tiny App declaring `gmail_send_message`, invoke it, confirm no mail is sent and an approval is surfaced.

**Risk.** Medium — changes App behavior for connector writes (they now pause instead of firing). That is the intended, safe change; call it out in release notes. Reads (`read` group) are unaffected.

---

## WS5 — get `apps/core` typecheck to zero and CI-enforce it  🟧 HIGH (SYS-01) · **enabler**

**Why it's in this plan.** WS1 shipped because `tsc` flagged the exact line (`TS2345`) and nobody saw it — `apps/core` carries ~50 pre-existing type errors, so its typecheck output is noise. Until `pnpm --filter @engenty/core typecheck` is clean and CI fails on regressions, the next AUTH-01-shaped bug will hide the same way. This is the highest-leverage single quality fix touching all of the above.

**The work.**
1. `pnpm --filter @engenty/core typecheck 2>&1 | tee /tmp/core-tsc.txt` — triage the ~50 errors. Most are likely genuine-but-latent; fix them properly (no `// @ts-ignore` blanket suppressions, no `any` widening to silence — that reintroduces the class of bug we're fixing). Where a fix is genuinely out of scope for a security sweep, use a **narrow, commented `@ts-expect-error` with a linked follow-up**, not a broad suppression — and count them (aim for zero).
2. Confirm CI runs `typecheck` for `apps/core` and **fails** on non-zero. Check the CI workflow + `turbo.json` `typecheck` task. If core was excluded or soft-failing, re-include it.
3. Re-run after WS1–WS4 to confirm those changes are themselves clean.

**Verify.** `pnpm --filter @engenty/core typecheck` exits 0; a deliberately-introduced type error fails CI (revert after checking).

**Risk.** Low but time-variable — could uncover a real latent bug worth its own fix. Timebox; if an error reveals a separate defect, file it and `@ts-expect-error` with the ticket rather than expanding this plan.

---

## Companion one-liners (cheap, same theme — include if time allows, don't block the release on them)

- **AUTH-04 (HIGH): unknown `role` claim defaults to `service`.** `apps/core/src/security/auth.ts:66-75` (`parsePrincipalType` returns `"service"` for anything unrecognized) + `defaultCapabilities` (`:54-64`) hands a role-less token `module.read/write/execute`. Change the default to the least-privileged principal (or reject the token). Add a test: a token with no `role` claim is not a capable service principal.
- **Delete dead `packages/test-kit`** (no `package.json`, only a stale `node_modules` — nothing resolves it).
- **Move on-disk credentials out of the `legacy` symlink target** (`legacy` → `../cursor/engenty` contains `.env.local`, `enablebanking.key/.crt` one hop from this tree). Not a code change — flag to Matthias.

---

## Definition of done

- [x] WS1 fixed + test proving member→admin mint now 403; actor-token route rate-limited; `TS2345` gone.
- [x] WS2 both mint routes capability-gated + derived-token minting blocked + tests.
- [x] WS3 **decision recorded** (Option A) and working tree brought into line with it; `tool-approval.ts` comment matches. Unit contract encoded in `policy.test.ts`; **dev-stack behavioral test still owed** (see Not done).
- [x] WS4 App connector writes fail closed (durable approval + 202), handler-not-called test passes, `pending_approval` contract now real.
- [x] WS4 **Layer 2 / CON-02 also done** (was scoped as a fast-follow) — per-connector write capabilities. See the CON-02 section below.
- [x] WS5 `apps/core` typecheck at zero (189 → 0) and CI-enforced.
- [x] `pnpm build && pnpm typecheck && pnpm test` green; `pnpm check` clean on every touched file.
- [ ] Patch release cut via the `release` skill; release notes call out the App-connector-write behavior change and the actor-token authorization tightening.
- [ ] Re-verify AUTH-01 & AUTH-02 exploit chains are closed on a running dev stack (not just unit tests) — the audit flagged these as verified by tsc + call-site enumeration but **not** reproduced at runtime.

### Companions
- [x] AUTH-04: `parsePrincipalType` unknown/absent `role` now falls back to `user`, not `service`; `auth.test.ts` asserts a role-less token gets `["module.read"]` and never `module.write`/`module.execute`.
- [ ] Delete dead `packages/test-kit` — confirmed dead (no `package.json`, no reference anywhere in the repo, only a stale `node_modules`). **Not deleted: awaiting explicit go-ahead**, per the standing "never run a data-deleting command without asking" rule.
- [ ] Move on-disk credentials out of the `legacy` symlink target — not a code change, still owed to Matthias.

## Landed

**Committed as `e557f3ac4`** on `main`, local only — **not pushed, no release cut**
(deliberate: the App-connector-write behaviour change and the mint/actor-token tightening
should get a look before they reach deployments).

The shared checkout also held a co-worker's in-flight `principalType` plumbing, so the two
overlapping files were staged **hunk by hunk**: `packages/plugin-sdk/src/index.ts` (their
`PluginAuthContext`/`actorUserIdFromAuth` at @212 left unstaged; my `PluginCallOrigin` at
@402/@421 committed) and `apps/core/src/api/routes/plugins/module-operation-routes.ts`
(their `principalType: auth.principalType` at @715/@1225 left unstaged; my seven hunks
committed). Their WIP is untouched and still in the working tree. `packages/test-kit`
deleted with explicit go-ahead. Note a co-worker landed `13099173b` on top afterwards; it
touches none of this.

**Verified in isolation.** A detached worktree at `e557f3ac4` alone — without the
co-worker's uncommitted work — builds (82/82), typechecks (88/88), and passes apps/core
(695), connections + app-proxy + plugin-sdk (182). Two test tasks fail there only because
a fresh worktree lacks the generated root `supabase/migrations` and derives the Supabase
container name from the directory name; both pass in the real checkout, where the full
`pnpm test` is 138/138.

## Not done / still owed

1. **Push + release.** `e557f3ac4` is local. Cut the patch release via the `release` skill
   when you are happy with it.
2. **Dev-stack behavioral verification.** Three items are unit-verified but not reproduced against a running stack: the AUTH-01 and AUTH-02 chains, and WS3's "headless task calling a high-risk op without a grant must pause into the durable task-approval flow". WS4's Gmail end-to-end (build a tiny App declaring `gmail_send_message`, confirm no mail is sent) is likewise owed.
3. **`pnpm check` repo-wide** still fails on the pre-existing lint debt CI deliberately does not gate on. My files are clean.

---

## Execution log (2026-08-03)

**WS1 — DONE.** `apps/core/src/api/routes/auth/actor-token-routes.ts` now passes the whole
held set to `capabilityCovers` once, plus a `checkRateLimit` on the route keyed by
`caller.principalId` + `x-forwarded-for`, and an `auth.actor_token_denied` audit event.
New `actor-token-routes.test.ts` (9 tests). **Verified twice:** with the scalar call
restored, exactly the member→admin test fails (403 expected, 200 received); with the fix,
all 9 pass. The `@ts-expect-error` guard against the scalar form is in the test.

**WS2 — DONE.** New capability `core.credentials.manage`, added to the `tenant.admin`
profile only. `denyCredentialMint()` in `auth-routes.ts` gates BOTH
`/api/auth/service-credentials` and `/api/auth/api-tokens` on that capability *and*
rejects derived minters (`authMethod` `service_credential`/`api_token`, or
`tokenType: "api_token"`). New `credential-mint-gate.test.ts` (13 tests) covering the
member 403, the service-token 403, the api-token 403, the admin 200, the surviving
clamp, and the AUTH-01→AUTH-02 chain. Eight pre-existing auth tests failed on first run
— all of them fixtures minting with non-admin capabilities, i.e. the gate working; their
owner tokens now carry the capability explicitly.

**Caller audit (WS2 blast radius).** The plan assumed the CLI mints via the store
directly; it does not — `engenty service-token create`
(`src/cli/service-credential-commands.ts:61`) and `engenty auth tokens create`
(`src/cli/auth-tokens-commands.ts:51`) both POST to these HTTP routes. They authenticate
with the device-flow session, which is `authMethod: "oauth"` / `principalType: "user"`
(`device-flow-routes.ts:286-299`), so a tenant admin running the CLI is unaffected.
**Behaviour change to call out in release notes:** a CLI invocation authenticated via
`ENGENTY_TOKEN` holding an *API token* now gets 403 — grant that automation a user
session, or an explicit `core.credentials.manage` on a non-derived principal.

**WS3 — decision: Option A** (recorded 2026-08-03, confirmed by Matthias). Revert the
working-tree widening; keep the blanket gate; ship `ENGENTY_AGENT_ESCALATION` on by
default so the escalation profile policy is actually registered. The approve → re-run →
202 deadlock is left to the approval-store unification plan rather than fixed by removing
enforcement.

**WS4 — DONE (Layer 1, the clean origin-aware fix, not the interim hard stop).** The App
proxy now sends `x-engenty-call-origin: app` on both engenty-reaching paths
(`engenty_call` and `app_call`/`app_call_privileged`); core's `requireAuth` reads it into
`PrincipalContext.callOrigin` (only the literal `"app"` is honoured, so a forged header
can never widen anything); `modules/connections/src/policy.ts` now computes
`isAutonomous` as `principalType !== "user" || callOrigin === "app"`. New
`modules/connections/src/policy.test.ts` (6 tests) + 2 app-proxy integration tests.
**Verified twice:** without the policy change, exactly the two app-origin write tests
fail and the chat-behaviour-unchanged test still passes.

Worth calling out in release notes beyond the plan's own note: because App calls are now
autonomous for connector policy, they are also subject to the connection's
`autonomous_mode` clamp — an App write against a connection its owner set to "off" now
**denies** rather than asks. Reads are untouched. Coverage is complete: the app backend's
capability-handle callback re-enters the same `/ai/apps/:appId/call` route, so both
directions are marked.

**CON-02 (WS4 Layer 2) — DONE.** Per-connector capabilities
`module.connections.<read|write>.<connectorId>`, so a role trusted to send mail can no
longer post to your Slack.

The design turns on one finding: a *generic* "a held capability covers its whole sub-tree"
rule — the obvious way to make `module.connections.write` cover
`module.connections.write.gmail` — would have been a **silent privilege escalation**.
`team-chat.member` holds a bare `module.team-chat`
(`modules/team-chat/src/plugin.ts`), so that rule would have handed every member
`module.team-chat.manage`. `module.engenty-remote` is the same shape. So:

- `capabilityCovers` learned **explicit wildcards at every segment boundary** only
  (`module.connections.*`, `module.connections.write.*`, not just `module.*`). Purely
  additive — no `module.<x>.*` grant exists today — and widening still has to be written
  down as a `.*` by a person.
- The per-connector layer is **restrictive, not permissive**, following the pattern
  `moduleIds`/`scopes` already use in `policy.ts` (empty ⇒ unrestricted): naming no
  connector means every connector, so **every existing grant, custom role and long-lived
  API token behaves exactly as before**. Naming one restricts to it. Operation-level
  `requiredCapabilities` is untouched, which is what keeps that back-compat true.
- Enforced in `modules/connections/src/policy.ts` (authoritative, before any connection
  is resolved or approval recorded) and re-checked in `executeConnectorAction` under the
  same defense-in-depth doctrine already documented there.
- Grantable: `registerConnectorModule` now contributes
  `connections.viewer.<id>` / `connections.editor.<id>` role profiles, so an admin
  assigns "Connections editor — Gmail" from the existing roles UI. The authz capability
  catalog also learned to include role-profile capabilities — previously a capability
  that scopes rather than unlocks (this one, and `module.team-chat`) was invisible there
  and `validateCustomRole` would reject it as a typo.

**Verified twice:** with the scope gate disabled, exactly the two "denies a write to a
connector the role does not name" tests fail and every back-compat test still passes.
23 new tests across the matcher, the scope helper, and the policy gate.

**WS5 — DONE, 189 → 0.** Scope correction: `apps/core` had **189** type errors, not ~50 —
and no `typecheck` script at all, so `pnpm typecheck` had never checked it. Added
`"typecheck": "tsc --noEmit"` to `apps/core/package.json`, which puts it in CI's existing
`pnpm typecheck` step immediately (turbo went 87 → 88 tasks). **Gate verified:** a
deliberately introduced `const x: number = "string"` fails the script; reverted.

Zero blanket suppressions and no `any` widening. What the errors turned out to be:

- **Two genuine latent bugs.** `src/dal/core-users/{crud,setup}.ts` imported
  `../../../identity/identity-admin-service.js` — one `../` too many, so
  `IdentityAdminService` silently resolved to nothing. And `pdf-first-page-webp.ts` was
  missing pdfjs 5's required `canvas: null`, which the library docs mandate when
  rendering through `canvasContext`.
- **A misleading non-bug worth killing.** Six call sites passed `principal: auth` into
  `resolvePluginCapability`, which `capability-resolver.ts:409` re-exports from
  `@engenty/plugin-sdk` — whose params type has no such field. The argument was dropped
  on the floor at every site while reading like a principal check. Removed; the
  `principal_forbidden` reason code is now commented as declared-but-never-returned.
- **The bulk: fixture drift.** A dozen test files each carried a private
  `makeEmptyRegistry()`, so every field added to `PluginRegistry` left them all behind.
  Replaced with one shared `src/plugins/test-fixtures.ts` (`makeEmptyRegistry` +
  `makePluginRecord`) so the next added field breaks in one place. Also real drift:
  `CoreUser.is_super_admin` missing from ~13 fixtures, and a `preflight` fixture still
  describing the retired `plannedSteps`/`reloadable`/`status` shape.
- **One cascade.** Six test files imported relative paths without `.js` under
  `nodenext`; fixing that alone resolved 67 downstream implicit-any errors.

## Evidence index (as of `fbce63a13`, working tree may differ)
- AUTH-01: `apps/core/src/api/routes/auth/actor-token-routes.ts:37,95-97,113-118,125-128` · `packages/plugin-sdk/src/capability-match.ts:9-22` · `apps/core/src/security/role-profiles.ts:31-35`
- AUTH-02: `apps/core/src/api/routes/auth/auth-routes.ts:376-380,447,478-521,569-635` · `apps/core/src/security/user-capabilities.ts:50-58`
- AUTH-03: `apps/core/src/security/policy.ts:79-110` · `apps/core/src/api/server.ts:53-58,255` · `apps/ai/ai/tools/engenty-tools/lib/tool-approval.ts:8-10` · (env absence) `apps/core/src/cli/env-setup/env-manifest.ts`, `deploy/docker-compose*.yaml`
- CON-01: `modules/connections/src/policy.ts:96-101` · `apps/core/src/security/policy.ts:98-104` · `packages/connections-sdk/src/execute.ts:95-96` · `apps/ai/src/api/app-proxy-routes.ts:506,528-552,629-655` · `modules/engenty-apps/ai/skills/engenty-bridge/SKILL.md`
- CON-02 (follow-up): `packages/connections-sdk/src/runtime.ts:113-115`
- SYS-01: `apps/core` typecheck output; CI workflow + `turbo.json`
- AUTH-04: `apps/core/src/security/auth.ts:54-75`
