# PLAN — Apps × Connections gap

Goal: AI-built Apps that use engenty data **and** external connections, end to
end, demoable in one chat session. (The "executor artifacts" story, on our own
rails.)

Architecture is done — this closes the three gaps found in the 2026-08-01
assessment. Gap 1 (artifact published to the sub-agent's child thread) is
already fixed: `7be790c5b` on main, `userFacingThreadId` ALS field, unit-tested,
**not yet live-verified** (that happens in Phase 4).

Standing facts the plan builds on (verified in code, not assumptions):

- Connector actions ARE gateway operations: `connections-sdk`
  `buildActionOperation` registers `<toolPrefix>_<actionId>` (e.g.
  `gmail_messages_list`) as a `PluginServerOperation`, policy-checked inside
  `executeConnectorAction` (packages/connections-sdk/src/runtime.ts).
- The app bridge's `engenty_call` invokes ANY operation id the app manifest
  declares, with the viewing user's token
  (apps/ai/src/api/app-proxy-routes.ts — manifest allow-list ∩ capability
  handle, then `client.invokeTool`).
- `connections_catalog` already returns `operation_id` per action
  (modules/connections/src/api/operations.ts:85) — discovery exists.
- The `/ai/apps/:appId/frontend` proxy returns the FULL manifest to the
  browser; the artifact view currently reads only `egress.connect`
  (packages/ai-ui/src/artifacts/app-artifact-view.tsx).
- There is NO apps catalog UI and NO approval UI. `app_release_approve` /
  `app_release_reject` are gateway ops gated on `apps.approve`
  (modules/engenty-apps/src/api/gateway-methods.ts `approveOp()`), reachable
  today only via chat.

---

## Phase 1 — Teach the app-coder connections (docs only, small)

The capability is latent: nothing tells the agent that connector actions are
declarable operations.

1. `modules/engenty-apps/ai/skills/engenty-bridge/SKILL.md` — new section
   **"External services (connections)"** after "What the allow-list actually
   means":
   - Connector actions are ordinary operations; discover them with
     `connections_catalog` (returns `operation_id`, action group, risk) and
     declare them in `manifest.engenty.operations` like any other id.
   - Read-group actions run under the user's existing grant; write-group
     actions come back as `pending_approval` — reuse the already-documented
     handling pattern verbatim.
   - Multi-account: actions take an optional `account` param; on
     `connection_ambiguous`, call `connections_list_accounts` (declare it too)
     and let the user pick.
   - Missing connection: `engenty_call` fails — render "connect X under
     Settings → Connections" rather than retrying. Requesting a connection is
     a user act, never the App's.
2. `modules/engenty-apps/ai/skills/app-authoring/SKILL.md` — extend the
   manifest example with one connector op so the pattern is copyable.
3. `modules/engenty-apps/ai/agents/engenty.app-coder/AGENTS.md` — one line
   under "You do not invent operation ids": connector operations are found the
   same way (`engenty_tools_search` / `connections_catalog`) and declared the
   same way.

No code. Verify: `pnpm plugins:check` + registrar tests still green.

## Phase 2 — Consent surface: review banner on the app artifact (the real work)

"The manifest is the thing a person reads before saying yes" (engenty-bridge
skill) must become literally true. Minimal honest version — a review banner on
the artifact the user already looks at, NOT a catalog page:

1. **apps/ai proxy additions** (apps/ai/src/api/app-proxy-routes.ts, same
   one-origin/one-auth rationale as `/frontend`):
   - `GET /ai/apps/:appId/review?version=N` → `{ status, manifest_summary:
     { operations, actions:[{id,risk}], storage, egress }, can_approve }`.
     `can_approve` from a capability probe against core (`apps.approve`).
   - `POST /ai/apps/:appId/review` `{ version, decision: "approve"|"reject",
     reason? }` → forwards to `app_release_approve` / `app_release_reject`
     with the caller's token. Core re-checks the capability — the proxy adds
     no authority.
2. **packages/ai-ui/src/artifacts/app-artifact-view.tsx** — when the pinned
   version's status is `proposed`, render a banner above the `BridgedFrame`:
   - App name + version + "asks for:" list of declared operations, connector
     ops and high-risk actions visually marked (they are the outward-reaching
     ones).
   - Holder of `apps.approve`: Approve / Reject buttons → the POST route,
     then invalidate the frontend query so the frame swaps to the active
     version.
   - Non-holder: "waiting for approval" — no buttons.
   - Active version: no banner (today's rendering unchanged).
3. Tests: proxy route tests beside the existing app-proxy tests (allow-list,
   capability probe, decision forwarding); a UI test for banner
   render/approve-click if ai-ui has precedent for the view.

Decision needed (Matthias): is the banner enough for v1, or do you want a
catalog page (list apps, versions, pending proposals) now? Banner is ~a day;
catalog is its own phase and can come later without rework.

## Phase 3 — Land the GitHub connector

`feat/coder` (rebased onto v0.1.86, all suites green) carries it as commit
`f1a6a7a8d` — `modules/connections/providers/github` + connections-sdk
`tokenRequestHeaders`. Two options:

- **A (recommended): cherry-pick `f1a6a7a8d` to main now.** Self-contained
  (connector + sdk + plugin registration), 9 tests, no coder-runtime risk.
  Apps gain `github_repos_list` / `github_pr_get` / `github_pr_create`
  (approval-gated) immediately.
- **B: merge all of feat/coder.** Also lands the repo-coder
  (`engenty.coder`), which is NOT live-verified and blocked on GitHub OAuth
  App creds — it would sit in the agent catalog untested.

Either way the repo-coder's live E2E stays a separate track (needs
`GITHUB_OAUTH_CLIENT_ID/_SECRET` from Matthias).

## Phase 4 — Live E2E + prod

1. **Live E2E (dev), the whole story in one run:** ask copilot to "build an
   app that lists my open tasks and lets me email a summary". Proves, in
   order: delegation → `app_build` → **artifact appears on the USER'S thread**
   (the 7be790c5b fix, live-verified here) → review banner shows
   `tasks_list` + `gmail_send` (or `github_*`) → approve → app runs → write
   op pauses into the durable approval flow.
2. **Verify the `pending_approval` shape** for connector writes through the
   bridge matches what the skill documents (`result?.status ===
   "pending_approval"`) — one integration test at the proxy if it doesn't
   already exist.
3. **Prod PostgREST `module_apps` exposure** — still pending from the merge;
   use the existing prod-PATCH recipe (team-chat memory).

---

Order: 1 → 2 → 3 can run in any order (1 and 3 are independent of 2);
4 last. Phase 2 is the only one with a real design decision in it.
