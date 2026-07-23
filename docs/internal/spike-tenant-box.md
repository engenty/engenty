# Spike: Tenant Box + Open Design headless (phase 0)

Status: **spike — disposable** · Branch: `spike/tenant-box` · Worktree: `engenty-pro-tenant-box` · 2026-07-03

Gates phase 1 of `docs/wip/brand-design-module.md` (branch `feat/brand-design`) and grounds
§8.4 of `docs/wip/single-tenant-installations.md` (branch `docs/single-tenant-installations`).
Deliberately off current `main`, independent of `feat/native-approvals` and `feat/brand-design`.

## Question this spike answers

Can we run **one on-demand sandbox per tenant ("tenant box")** — hosting the Open Design
daemon as an in-box process plus CLI-style runs — on plain Docker on a VPS, driven from
`apps/ai`'s existing `EngentySandboxProvider` machinery, at acceptable density and latency?

## Part A — Open Design headless (no engenty code changes)

1. Run the OD daemon in Docker (`deploy/` in nexu-io/open-design; pin the version, note it).
2. Drive it purely via HTTP (`OD_API_TOKEN`):
   create design system → run `brand-extract` against a real website → `start_run` on
   `email-marketing` and `saas-landing` skills → poll `runs/:id/events` → pull result-package.
3. Record: what worked / broke headlessly (BYOK key config for the spawned agent, anti-bot
   pauses in brand-extract, any desktop-only dead ends).

**Measure:** daemon idle RSS · RSS during a run · cold-start to `/api/health` · disk of
`RUNTIME_DATA_DIR` after one brand + two runs · run wall-clock.

## Part B — Tenant box on the existing sandbox seam

1. Read `apps/ai/src/ai/sandbox/` (provider contract, factory, gondolin-vm-registry,
   teardown) — write up how run-scoped identity/lifetime generalizes to tenant-scoped.
2. Prototype (rough is fine): a `tenant-box` lifetime on the docker provider — identity =
   tenant, persistent volume, idle-stop timer, **network endpoint in the contract** (needed
   for the OD daemon; per-run sandboxes never had ports).
3. Put the Part-A OD daemon *inside* the tenant box as a supervised process; drive one
   generation through it end-to-end from a script (stand-in for the module's ai face).
4. Sketch (paper, not code) how `vercel-sandbox | cloudflare | fly-machines` would implement
   the same contract — wake→syncIn→serve→syncOut→sleep; note where ephemeral hosted
   sandboxes fail the persistent-box requirement.

**Measure:** boxes-per-8GB at idle (extrapolate to 64 GB) · wake latency (stopped → serving)
· concurrent runs inside one box (two workdirs, no cross-talk).

## Exit criteria

- **Go:** end-to-end brand-extract + generation through a tenant-box-hosted daemon, idle box
  ≤ ~400 MB, wake ≤ ~10 s, no headless blockers without workarounds → brand-design phase 1
  proceeds on this runtime; findings folded into both plan docs.
- **No-go / pivot:** blockers documented per item with the cheapest alternative
  (e.g. daemon-outside-box, hosted machine provider, OD version pin change).

## Non-goals

Approval workflow, snapshots/publish pipeline, module skeleton, manage plane, provider
implementations beyond docker, any production hardening. Spike code may be thrown away;
only the findings and the contract sketch must survive (update the two plan docs).

## Notes

- Dev servers in this worktree: watch the per-worktree slot setup (dev:portless vs dev,
  shared supabase) before running apps.
- OD clone from the earlier deep dive (412 MB) may still exist in the session scratchpad;
  re-clone if gone — pin whatever tag/commit you use.
