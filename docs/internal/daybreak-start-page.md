# Daybreak — the start page as briefing (design & plan)

Status: CONCEPT AGREED 2026-07-05. Detailed implementation plan:
`docs/internal/daybreak-implementation-plan.md` — pro feature as
`modules/briefing`, based on the legacy dashboard module +
`packages/dashboard-core`, generative UI on **OpenUI** (Mastra guide:
https://mastra.ai/guides/build-your-ui/openui). This replaces the retired
legacy dashboard (`apps/core` widget-generate endpoint returns 503) and, over
time, the per-module briefing pages as the post-login default route.

Note: the implementation plan supersedes this doc's grounding table where
they differ (json-render catalog → OpenUI library; `modules/briefing` builds
on the migrated legacy dashboard rather than from scratch).

Design artifacts (versioned next to this doc, open in a browser):

- `daybreak/concept.html` — one-page concept: principles, desktop/mobile/voice
  mocks, channel renders, flows, grounding table, phasing.
- `daybreak/guided-click-dummy.html` — interactive prototype of the guided
  walkthrough + live "sheet" view. Serve locally (e.g. the `daybreak-mock`
  entry pattern in `.claude/launch.json`) or open via file://.

## What it is

The start page stops being a dashboard you read and becomes a briefing that
was **composed for you before you arrived** — chief-of-staff, not control
panel. Thesis:

> A dashboard shows you the state of the system. A briefing tells you what to
> do about it — and has already done everything that didn't need you.

Two presentation modes over one composed briefing:

1. **Walkthrough (primary).** The assistant walks you through the morning one
   thing at a time — zen layout, heavy whitespace, decisions first. Each step:
   assistant speaks → subject with zoom-in-place detail (never navigate away)
   → verdict (approve / edit / defer) → spoken confirmation → short undo
   window → advance.
2. **The sheet (secondary).** The same briefing laid flat for self-scanning:
   generated widgets — trend charts, aging bars, day timeline, tables — with
   statuses that update live as decisions land in either mode.

Same BriefingSpec renders to: web/mobile (interactive), voice (narrated, same
decision tools), email/WhatsApp (PNG + PDF, reply-to-act), Slack/Teams (action
cards resolving against the same queue).

## Principles

- **Composed, not configured.** No widget arrangement UI. The composer agent
  selects, ranks, sizes and *drops* sections. Quiet day = three lines.
- **Decisions first.** Human judgment is the scarce resource; everything
  needing a verdict is pre-worked (context gathered, draft written) and at the
  top.
- **Work happened overnight.** The briefing is the visible tip of autonomous
  work under standing policy; a "handled without you" ledger makes every
  autonomous act visible and auditable.
- **It's a conversation.** Every widget carries a `sendMessage` entry point;
  drill-in deepens the session, never navigates.
- **One queue, many remotes.** A decision is resolved exactly once,
  idempotently, from any surface.
- **Grounded & fresh.** Composition includes a bounded, cited web-check
  (tenders, counterparty news).

## Decisions (settled)

| Decision | Choice |
|---|---|
| Primary mode | Guided walkthrough; sheet is the secondary "skim" view of the same spec |
| Default route | New `modules/briefing` plugin claims post-login default (`ui.route.module.briefing`) |
| Spec | Persisted **BriefingSpec** (json-render widget tree + narration script + decision refs) on thread `briefing:{tenantId}:{userId}` |
| Composition trigger | Per-user, timezone-aware heartbeat (`hb_briefing_*`) via existing scheduler sync; on-demand recompose is the same flow with a smaller window |
| Section content | Modules feed a **briefing-provider contract** (plugin SDK); the composer owns ranking/dropping. Per-module briefing pages retire once parity is reached |
| Decisions | Durable decision queue; verdicts flow through native approvals (suspend/resume + grant write-back); connections `ask`-policy items surface as decision cards |
| Defer semantics | Defer = one-shot trigger that **re-checks context before resurfacing** (deferred dunning dissolves if payment lands) |
| Interaction contract | act → conversational confirmation → brief undo window → advance (validated in the click dummy) |
| Scope | Briefing is **per user** over tenant data; roles route whose decisions land on whose page |
| Autonomy | Composer runs read-only (`autonomous_mode ≥ read_only`); all writes go through connector actions under allow/ask/deny + approvals — unchanged |

## Architecture

### Composition flow (per morning, per user)

```
hb_briefing_{user} (06:15, tz-aware)
  → briefing agent session on briefing:{tenant}:{user}
      ← module briefing providers (tasks, projects, offers, invoices, …)
      ← module_inbox digest + inbox:{tenant} notifications thread
      ← connections read: Gmail / Calendar / Slack (policy: read=allow)
      ← bounded web check (cited)
  → BriefingSpec (widget tree + narration + decision refs)
  → render targets: web/mobile · voice narration · pdf-service PNG/PDF · Slack cards
```

### Grounding — substrate that already exists

| Concept element | Shipped today | Daybreak adds |
|---|---|---|
| Generated UI | `packages/generative-ui` — json-render v0.19, catalog (Metric, List, Card, Grid, Badge, `sendMessage`), `registry.tsx` | Widgets: DecisionCard, Digest, DayTimeline, AgingBar, TrendMetric, Artifact. Persistable BriefingSpec |
| Scheduling | `apps/ai/src/scheduler/` — `heartbeat-sync.ts`, `system-jobs.ts`, `quiet-hours.ts`, tz-aware crons | Per-user `hb_briefing_*` + evening wrap; recompose tool |
| Section content | `modules/tasks/src/lib/tasks-briefing-service.ts`, `modules/tasks/ui/pages/briefing-page.tsx`, `modules/projects/ui/components/briefing/` (hero, focus, attention, waiting, forgotten) | Briefing-provider contract in `packages/ui-plugin-sdk` / `plugin-sdk`; migrate existing services onto it |
| Overnight awareness | `modules/inbox` store + sync engine; `apps/ai/src/notifications/inbox.ts` (`inbox:{tenantId}`, direct storage records); `useBadgeCount` seam | Per-user digest summarization; "handled without you" ledger |
| External reach | Connections framework — Google/MS/Slack connectors, multi-account, `packages/connections-sdk/src/policy.ts` (allow/ask/deny/defer, autonomous-mode clamps) | Calendar read in composer; `ask` items → decision cards |
| Approvals | Native approvals — tool suspend/resume, grants, `defer` policy (`docs/wip/agent-approvals.md`) | Decision-queue store resolved once across surfaces; defer-as-trigger |
| Voice | `packages/ai-ui` — realtime voice provider, `CopilotVoiceFab`, voice frontend tools | Narration render target; decision tools exposed to voice |
| Channels out | `packages/pdf-service` + `packages/pdf-templates` (offers/invoices flows, browser-verified) | Briefing PDF/PNG template; delivery via Gmail/Slack connector actions; reply-to-act parsing in the inbox pipeline |
| Fresh knowledge | Code-mode sandbox + web tooling in the AI plane | Bounded, cited web-check step |
| Start-page slot | Plugin routes + `packages/app-shell` navigation; legacy dashboard retired | `modules/briefing` plugin as default route |

### New pieces (the actual build surface)

1. **`modules/briefing`** — standard module anatomy (`engenty.plugin.json`,
   root `engenty.plugins` entry, **and the `supabase-sync.mjs` compose step**
   — see `docs` on migrating parked modules; that step is easy to miss).
   Provides walkthrough + sheet routes, composer agent, decision queue ops.
2. **Briefing-provider contract** — plugin SDK addition:
   `provideBriefing(ctx) → { sections: BriefingSection[], decisions:
   DecisionCandidate[] }` with per-section freshness/cost hints so the
   composer can cache and re-use.
3. **BriefingSpec** — Zod schema (reuse patterns from
   `packages/dashboard-core`); persisted message on the briefing thread;
   contains widget tree, narration script, decision refs, source citations.
4. **Decision queue** — module table; each decision references its executing
   tool call; verdicts resolve through native approvals; idempotent across
   surfaces; "defer" materializes a one-shot trigger whose task re-runs the
   decision's context check first.
5. **Catalog extensions** — new components in `packages/generative-ui`
   (DecisionCard, DayTimeline, AgingBar, TrendMetric, Digest, Artifact) —
   server-safe, same `sendMessage` action plumbing.

## Phases (each independently shippable)

### Phase 1 — One page

Composer + heartbeat + BriefingSpec + sheet rendering. Awareness only, no
decision queue yet (existing approvals UX still handles asks).

- briefing-provider contract in plugin SDK; adapt tasks/projects services;
  thin providers for offers/invoices/inbox
- `modules/briefing` plugin; sheet route from BriefingSpec via generative-ui;
  catalog extensions (TrendMetric, Digest, DayTimeline, AgingBar)
- `hb_briefing_*` heartbeats (reuse `heartbeat-sync.ts` patterns; respect
  `quiet-hours.ts`); recompose tool
- default-route wiring in app shell; **regenerate the UI plugin catalog**
  (`pnpm --filter @engenty/ui generate:plugins` — stale-catalog gotcha)

### Phase 2 — Decisions + walkthrough

- decision queue store + module ops; approvals integration
  (suspend/resume, grant write-back); connections `ask` items as cards
- walkthrough route: step engine, zoom-in-place, confirm + undo window,
  auto-advance (interaction contract from the click dummy)
- defer-as-trigger with context re-check; "handled without you" ledger
- live sheet ↔ walkthrough state sync (one queue)

### Phase 3 — Channels

- briefing PDF/PNG template in `packages/pdf-templates`; render via
  `pdf-service`
- delivery through Gmail/Slack connector actions under write policies
- reply-to-act: parse structured replies (`APPROVE 2041`) + free text in the
  inbox sync pipeline → resolve queue decisions
- Slack/Teams action cards → same queue endpoints

### Phase 4 — Voice & rhythm

- narration script as BriefingSpec render target; decision tools registered
  for realtime voice
- evening-wrap heartbeat (same composer, inverted frame: closed / slipped /
  tomorrow prep)
- on-demand micro-briefings ("brief me on X before the 10:00") — scoped
  compose, pinnable card

## Open questions (decide before Phase 2)

1. **Trust ramp.** Default autonomy per tenant (read-only vs draft-everything)
   should be an explicit onboarding choice, not buried in connections
   settings. The ledger is the trust instrument.
2. **Tenant vs user.** `inbox:{tenantId}` is tenant-scoped; the briefing is
   personal. Where does decision routing live — roles, module config, or
   composer policy? Two-person shop wants overlap; ten-person wants routing.
3. **Composition cost.** Full compose touches every provider, three
   connectors, and the web — per user, per morning, in the tenant's AI-plane
   sandbox (see tenancy plane split). Needs: incremental since-last-brief
   windows, provider freshness hints/caching, a cheap quiet-day early exit,
   and a per-tenant budget.
4. **Misranking escape hatch.** Every dropped/demoted item must be reachable
   via an "everything else" overflow, and "why did you rank this here?" must
   always be answerable (keep ranking rationale in the spec).

## Related docs

- `docs/wip/inbox-module.md` — inbox store/sync the digest builds on
- `docs/wip/connections-framework.md`, `docs/wip/connections-multi-account-groundwork.md`
- `docs/wip/agent-approvals.md` — native approvals substrate
- Tenancy plane split (authoritative on `spike/tenant-box`) — where the
  composer runs
