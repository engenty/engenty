# E2E test plan — engenty Apps

Branch `feat/engenty-apps`. Companion to `PLAN-engenty-apps.md` (what was
built) and `SPIKE-agentos-apps.md` (why the runtime looks like it does).

This plan covers only what unit tests structurally **cannot** reach: the
seven-hop chain from a browser frame to a tenant's isolated VM and back, and
the security boundaries that only mean something when all seven hops are real.

---

## 1. What is already covered, and therefore not repeated here

| Layer | Suite | Covers |
| --- | --- | --- |
| Runtime | `apps/app-host/src/__tests__/{app,runtime}.test.ts` | deploy/request/delete contract, bearer check, build failure shape |
| Module ops | `modules/engenty-apps/src/api/index.test.ts` (47) | exact op list, risk/approval flags, capability requirements, config level semantics |
| Domain | `modules/engenty-apps/src/domain/{call,release}-service.test.ts` | version transitions, build-fix loop, action dispatch |
| Proxy | `apps/ai/src/__tests__/app-proxy-routes.test.ts` | allow-list enforcement, storage flags, capability handle scoping |
| Frame | `packages/ai-ui/src/components/copilot/tool-call/bridged-frame.test.ts`, `artifacts/app-artifact-view.test.ts` | CSP shape, frame keying on release, transport binding |
| AI surface | `modules/engenty-apps/ai/{registrar,consumption}.test.ts` | agent/skill registration, tool exposure |

E2E does **not** re-assert any of the above. If a scenario below fails in a way
a unit test could have caught, the fix is a unit test, not a longer E2E script.

---

## 2. Environment

Portless worktree slot 1 (this worktree):

| Service | Port | Host |
| --- | --- | --- |
| ui | 5183 | `https://apps.engenty.localhost` |
| core | 8797 | |
| ai | 8800 | |
| app-host | 8805 | not published — internal only |

```bash
pnpm dev:portless --domain=apps
```

Preconditions:

- `pnpm engenty db sync && pnpm db:migrate` applied — 6 tables in
  `module_apps`, both partial indexes on `app_config`, RLS on all 6.
  (Never `db:reset`.)
- `module_apps` present in the `authenticator` role's `pgrst.db_schemas`,
  else every DAL read is a PostgREST 406.
- App-host wiring needs **no `.env.local` entry** in dev:
  `scripts/dev-portless-lib.mjs` injects `ENGENTY_APP_HOST_PORT` and
  `ENGENTY_APP_HOST_URL=http://127.0.0.1:<slot appHost>` for the whole task
  graph, and `ENGENTY_APP_HOST_TOKEN` is only mandatory under
  `NODE_ENV=production`. The module gate is fail-open — only a literal
  `ENGENTY_APPS_ENABLED=false` disables it.
  *Pre-flight:* if `app_release_propose` returns "app builds and app calls are
  unavailable", `ENGENTY_APP_HOST_URL` did not reach apps/ai — a launcher
  problem, not an Apps bug. Check before opening a defect.
- Two tenants with two users each — call them `T1/u1`, `T1/u2`, `T2/u3`.
  Section 8 is worthless without them.

Automated specs live in `e2e/smoke/apps.smoke.spec.ts`, following the existing
lane: one worker, `gotoLoggedIn()` per spec, `apiAccessToken()` for direct HTTP
assertions. Run with `ENGENTY_E2E_BASE_URL=https://apps.engenty.localhost pnpm test:smoke`.

---

## 3. The chain under test

```
browser frame (srcdoc, opaque origin)
  → postMessage MCP JSON-RPC
  → BridgedFrame  (ai-ui)
  → POST /ai/apps/:appId/call            (apps/ai proxy — manifest allow-list)
  → gateway op / app-host                (module_apps ops, or the VM)
  → app-host POST /internal/apps/:id/request
  → tenant VM isolate
  → back up the same seven hops
```

Every scenario below names the hop it is really testing.

---

## 4. A — Runtime plumbing

**A1 · app-host answers on loopback and is unreachable from a browser.**
*Verified 2026-07-25 on this slot.*

```bash
curl -s http://127.0.0.1:8805/health                          # {"ok":true,"service":"app-host"}
curl -sk -X POST https://apps.engenty.localhost/internal/apps/x/deploy   # 404
curl -s  -X POST http://127.0.0.1:8805/internal/apps/x/deploy \
  -H 'content-type: application/json' -d '{"files":{}}'       # 422 build_failed
```

*Expect:* health ok on loopback; **404** for `POST` through the proxy host;
the loopback POST reaches the real handler and is rejected on validation
(`agentos_apps_file_count_limit`), proving it is app-host answering and not a
fallback.

**Do not assert on `GET` through the proxy** — the dev SPA fallback returns
`200 text/html` for any unmatched path. That is Vite, not a leak. Only the
`POST` result distinguishes the two, which is why the check is written this
way.

**A1b · The internal bearer is enforced when configured.** The loopback POST
above succeeds **without** a token because dev leaves
`ENGENTY_APP_HOST_TOKEN` unset (`internalToken: null` → check skipped);
production throws at boot if it is missing. Set the token, restart app-host,
repeat the loopback POST with no `authorization` header.
*Expect:* 401. Without this assertion the tokenless dev path looks
indistinguishable from a missing auth check.

**A2 · deploy round-trip on a real VM.** `app_create` → `app_file_write`
(index.html + server.js) → `app_release_propose`.
*Expect:* build succeeds, a version row appears, `deployment` returned.
*Regression value:* this is the hop that the shipped **pnpm patch** to
`@rivet-dev/agentos-apps` fixes — `deployApp` is broken on every published
version. If A2 fails after a dependency bump, check the patch applied.

**A3 · build failure returns a usable log.** Write `index.html` with a
deliberate JS syntax error, propose.
*Expect:* failure carries `build_log` verbatim with file:line; the version
number does **not** advance; a second propose after the fix succeeds.

**A4 · `app_entry_missing`.** Manifest names `main.html`, only `index.html`
written.
*Expect:* `app_entry_missing`, no build attempted.

**A5 · app-host down.** Stop app-host, call `app_call`.
*Expect:* `apps.appUnavailable` 502 surfaced as a readable failure in the
frame — not a hang, not a stack trace. Restart, call again, succeeds without
re-deploy.

---

## 5. B — Authoring, end to end through the agent

**B1 · `engenty.app-coder` authors a working App from one sentence.**
In chat: *"Build me a small equipment-loan tracker."*
*Expect:* the agent finds ops via `engenty_tools_search` (does not guess op
ids), writes index.html/server.js/manifest, proposes, and iterates on any
build failure without being told to. Ends with a draft version pending
approval.
*Manual.* This is a live-model scenario — assert the shape (files written,
propose called, no fabricated op id), not the wording.

**B2 · The manifest is honest.** Inspect what B1 produced.
*Expect:* `storage` declares only stores the code actually calls;
`egress.connect` is empty; any destructive action carries
`requiresApproval: true`. A `finalize`-style action that is not gated is a
**fail** — it is the honesty rule in AGENTS.md, and the one thing a human
reviewer relies on.

**B3 · Approve and open.** `app_release_approve` → `show_artifact`.
*Expect:* the App renders in the artifact pane; the frame is keyed on the
immutable release.

**B4 · Reject and rollback.** Propose v2, reject it; then approve a v2, open
the App, and `app_release_rollback`.
*Expect:* rejected version never becomes active; rollback restores v1 and an
already-open frame is **not** torn down mid-interaction (frame keys on
release; a no-op bump must not destroy in-flight user work).

---

## 6. C — The bridge and its allow-list

**C1 · Declared operation succeeds as the viewing user.** App declares
`inbox_threads_list`; user u1 opens it.
*Expect:* data returned is exactly what u1 would see in the inbox UI.

**C2 · Undeclared operation is refused before engenty is asked.** Hand-craft a
frame message calling `engenty_call` with an op absent from the manifest.
*Expect:* `apps.operationNotDeclared` 403, and **no** corresponding gateway
op recorded server-side. Verify the second half in the ai logs — "refused
after asking" is a different, worse system.

**C3 · The App cannot exceed its user.** u2 lacks the capability the declared
op requires. u2 opens the same active App.
*Expect:* the call fails on u2's own authorization, not on the manifest.
Same App, different ceiling.

**C4 · Unknown bridge tool.** Send `{name: "shell"}`, `{name: "fetch"}`,
`{name: "sql"}`.
*Expect:* `apps.unknownBridgeTool` 400 for each.

**C5 · Frame isolation is real.** From the frame's own console:
`document.cookie`, `localStorage`, `fetch('/api/...')`, `window.parent.document`.
*Expect:* opaque origin — cookies empty, storage throws, cross-origin parent
access throws, and CSP blocks the fetch. Confirm in the console, not by
reading the CSP string (that is the unit test's job).

**C6 · Approval-gated op returns pending, not an error.** App declares an op
that requires approval.
*Expect:* `status: "pending_approval"` reaches the frame; the App renders a
waiting state; an inbox item appears; approving it makes the next call
succeed. No retry storm in the interim.

**C7 · `ui/notifications/message`.** Frame posts text.
*Expect:* appears in the conversation, text-only, capped; markup is not
rendered.

**C8 · `ui/notifications/size-changed` is ignored in the pane.**
*Expect:* pane height unchanged — the host owns it there.

---

## 7. D — The two stores

The axis that `app_data` alone did not have. These are the scenarios the
Postgres-over-SQLite decision was made for.

**D1 · `data_*` is per-instance.** Open the same App twice. Write `draft` in
instance 1.
*Expect:* instance 2 sees nothing at that key. Close instance 1, reopen: the
draft is gone.

**D2 · `config_*` outlives instances.** `config_set('currency','EUR')`, close
every instance, reopen.
*Expect:* `config_get` returns EUR.

**D3 · Config is per-user.** u1 sets `currency=EUR`. u2 opens the same App.
*Expect:* u2 does **not** see EUR. u2 sets `USD`; u1 still sees EUR.

**D4 · Tenant default fallback.** Admin writes a tenant-level default
(`user_id null`) via the op; u2 has no value of their own.
*Expect:* u2's `config_get` returns the default. u2 then sets their own — it
shadows. u2 deletes theirs — the default reappears. This exercises both
partial indexes and is the reason `setConfig` is update-then-insert rather
than an upsert.

**D5 · An App cannot set a tenant default.** From the frame, attempt to write
a default.
*Expect:* impossible — `config_set` from the bridge always injects
`user_id: caller.userId`. There is no argument that reaches the default level.

**D6 · Undeclared storage is refused.** Deploy an App whose manifest omits
`storage.data`, then call `data_set`. Repeat with `storage.config` omitted and
`config_set`.
*Expect:* `apps.storageNotDeclared` 403 with the right `store` in both cases.
Both flags enforced — neither is decorative.

**D7 · Export.** `app_data_export` on an App with data in both stores.
*Expect:* the tenant's data comes out of Postgres. This is the invariant that
per-app SQLite would have broken; if it ever fails, re-read §4b of the spike
before "fixing" it.

---

## 8. E — Tenant isolation (the scenarios that matter most)

**E1 · Cross-tenant app invisibility.** T2/u3 calls `app_list`.
*Expect:* T1's Apps absent. Then `app_get` with T1's app id directly.
*Expect:* 404, not 403 — existence is not disclosed.

**E2 · Cross-tenant store read.** T2/u3 calls the bridge against T1's app id
with a forged/borrowed session id.
*Expect:* refused at the capability handle (`apps.capabilityWrongApp` /
`apps.capabilityInvalid`), before any store touch.

**E3 · Capability handle is not a credential.** Capture
`x-engenty-capability` from a backend invocation. Replay it (a) against a
different app, (b) after its expiry, (c) against a core endpoint directly.
*Expect:* all three refused. The handle narrows the manifest; it never widens
anything and is worthless outside the proxy.

**E4 · RLS backstop.** With a plain `authenticated` JWT for T2/u3, query
`module_apps.apps` and `module_apps.app_config` through PostgREST directly.
*Expect:* zero T1 rows — the wall holds one layer below the proxy too.

**E5 · Egress deny-all.** Deploy an App whose code fetches
`https://example.com` with an empty `egress.connect`.
*Expect:* the request never leaves. Then declare that host, redeploy, and
confirm `connect-src` widened **without** widening `default-src` or
`frame-src`.

---

## 9. F — Headless / batch

**F1 · Same App, no browser.** A routine invokes the App's `finalize` action.
*Expect:* the rules module produces byte-identical output to the interactive
path — one function, so browser and batch cannot disagree.

**F2 · Headless approval pause.** The batch action hits an approval-gated op.
*Expect:* the task goes `blocked`, an inbox `tool_approval` item appears,
approving re-dispatches and the run completes. (Reuses the durable-approvals
machinery shipped in v0.1.66 — this asserts Apps plug into it, nothing more.)

**F3 · Archived App refuses invocation.** `app_archive`, then call.
*Expect:* `apps.appNotActive` 404 on both the interactive and headless paths.

---

## 10. G — Discoverability

**G1 · Copilot finds Apps unaided.** Ask the copilot to use a named existing
App without naming an op.
*Expect:* it reaches `app_list`/`app_call` through `engenty_tools_search`.
*Measurement gate:* if this proves unreliable across ~10 attempts, that is the
evidence for binding `app_list`/`app_call` directly into the copilot — the
change deferred pending exactly this data. Record the hit rate.

**G2 · Coordinator delegation.** Coordinator delegates a job that needs an App.
*Expect:* reaches `engenty.app-coder` for authoring, or `app_call` for use —
and does not attempt to author when a suitable App exists.

---

## 11. Automation split

Playwright (`e2e/smoke/apps.smoke.spec.ts`), deterministic, no live model:
A1 A2 A3 A4 · B3 B4 · C1 C2 C4 C5 C7 C8 · D1 D2 D3 D4 D6 · E1 E2 E5 · F3

Direct HTTP with `apiAccessToken()`, no browser: A5 · C3 · D5 D7 · E3 E4

Manual / live-model, run before merge and after any prompt change:
B1 B2 · C6 · F1 F2 · G1 G2

Fixture strategy: one seeded App deployed once per run (`uniqueName("app-e2e")`)
and reused; only B-series specs author fresh. Teardown archives rather than
deletes — nothing in this lane may issue a destructive DB command.

---

## 12. Exit criteria

1. Every Playwright scenario green twice consecutively on the portless slot.
2. Every §8 isolation scenario green — a single failure there blocks merge
   regardless of the rest.
3. B1/B2 pass with a live model on two unrelated prompts, and the resulting
   manifests are honest without human editing.
4. G1 hit rate recorded (pass or fail — the number is the deliverable).
5. Production `module_apps` PostgREST exposure done before any prod run.

## 13. Explicitly not covered

- Load and concurrency of the VM pool — no capacity target has been set.
- Cold-start latency budgets — measure once real Apps exist.
- App-to-App calls — not a feature.
- Guest→actor access — proven impossible in §4a of the spike; there is
  nothing to test.
