---
title: "Daybreak implementation plan — modules/briefing on OpenUI"
---

# Daybreak implementation plan — `modules/briefing` on OpenUI

Status: PLANNED 2026-07-05. Not started. Concept + UX contract:
`docs/internal/daybreak-start-page.md` (mocks in `docs/internal/daybreak/`).

Framing decisions from Matthias (2026-07-05):

- **Pro feature → a module.** Ships as `modules/briefing` in engenty-pro,
  NOT synced to the public upstream (same posture as the pro-only pieces of
  the commercial-modules split).
- **Based on the legacy dashboard.** `legacy/modules/dashboard` +
  `packages/dashboard-core` are the base — migrated, not rewritten. The
  retired core endpoints literally say *"Dashboard widget AI generation was
  retired from apps/core (2026-05-21). Rebuild on apps/ai."* — this is that
  rebuild.
- **Generative UI = OpenUI** (https://mastra.ai/guides/build-your-ui/openui)
  — the Thesys open standard (MIT): OpenUI Lang (compact streaming DSL,
  ~53–67% fewer tokens than JSON) + React runtime + library-driven prompt
  generation.

## 0. Why OpenUI fits (verified 2026-07-05)

Facts from the OpenUI docs/repo (github.com/thesysdev/openui,
openui.com/docs/openui-lang/*), verified against our tree:

| Property | Detail | Why it matters here |
|---|---|---|
| Persistence | A complete OpenUI Lang string re-renders deterministically: `<Renderer response={str} isStreaming={false} initialState={…}>` | Compose at 06:30, store the string, render at 07:15. BriefingSpec = lang text + metadata |
| Custom libraries | `defineComponent({name, description, props: zodSchema, component})` + `createLibrary()`; **system prompt is generated from the library** | One source of truth: our briefing components define both the renderer AND the composer's vocabulary |
| Headless | `@openuidev/react-lang` `Renderer` with our components — `react-ui`'s prebuilt look not required | engenty design tokens, not Thesys chrome |
| Actions | `onAction(event)` → `continue_conversation` with `humanFriendlyMessage` + `formState`; `onStateUpdate` for field changes | Verdict buttons + drill-ins route to the decision queue / copilot |
| Runtime data | `toolProvider` (function map or MCP client) backs `Query()`/`Mutation()` nodes; `queryLoader` for pending UI | Fresh numbers at *render* time — the modern replacement for dashboard-core's retired `queries`/`refreshPolicy` runtime |
| Transport | Reference integration streams over **AG-UI** (`@ag-ui/mastra`) | We already emit/parse AG-UI SSE: `packages/ag-ui-bridge` + `packages/ai-ui/src/ag-ui/apps-ai/apps-ai-transport.ts`. No new transport needed; we do NOT need `@ag-ui/mastra` |
| Email | `@openuidev/react-email` — React Email components for model-generated emails | Phase-4 channel renders |
| Versioning | Lang is versioned (v0.1 → v0.5); evolution guide exists | Persist `langVersion` + `libraryVersion` on every spec; see risks |
| License | MIT, monorepo incl. framework-agnostic `lang-core` parser | Forkable if the vendor drifts; fine for a pro module |

Installed Mastra (`@mastra/core@1.48.0`) has **no** OpenUI exports — OpenUI is
a separate dependency set (`@openuidev/react-lang`, `@openuidev/lang-core`,
optionally `@openuidev/react-email`, `@openuidev/cli` as devDep).

## 1. What we take from the legacy dashboard

Base: `legacy/modules/dashboard` (UI-only plugin) + pro
`packages/dashboard-core` (already imported by `apps/core` route validation
and `packages/generative-ui/…/template.ts`).

| Legacy piece | Verdict | Note |
|---|---|---|
| `packages/dashboard-core/src/schema.ts` — `DashboardDocument`/sections/`dashboardWidgetInstanceSchema` (kinds `registered` \| `json_ui`), layout (12-col x/y/w/h) | **KEEP + EXTEND** | Add widget kind `openui` (lang string + langVersion + libraryVersion + initialState). The document model becomes the **pinned layer** (see §2) |
| `dashboardJsonUiConfigSchema.agentic` (agentId, instructions, inputContextKeys, outputSchema, cachePolicy) + `cache` | **KEEP as design lineage** | Its shape (agent + instructions + cache + runtimeContext) is exactly the composer contract, rebuilt on apps/ai |
| `dashboard-registry.ts` widget type registration/resolution | **KEEP pattern** | Becomes the OpenUI library + `registered` widgets coexisting |
| Widget CRUD dialogs, `useWidgetRuntimeQuery`, `dashboard-api.ts` user-settings endpoints | **ADAPT** | Runtime query hook is superseded by OpenUI `toolProvider`; settings endpoints port to module ops |
| GridStack grid (`dashboard-grid.tsx`) | **DEFER, don't port in v1** | The daily sheet is composed (layout is an output). Grid returns only for the pinned board (Phase 3b); decide then between GridStack and a React-native grid |
| `core-widgets.tsx` hardcoded starter templates | **DROP** | Composition replaces starter templates |
| `POST /api/dashboard/widgets/generate` / `runtime` (503) | **DELETE after Phase 2** | Superseded by apps/ai composer + toolProvider |
| `packages/generative-ui` (json-render catalog/registry) | **FREEZE for existing consumers** | Briefing standardizes on OpenUI Lang. The catalog/registry *split* (server-safe defs vs React binding) is the pattern we mirror. Port Metric/List/Card semantics into the OpenUI library; convergence decision after Phase 2 |

## 2. Target architecture

```
                       ┌──────────────────────────── apps/ai ────────────────────────────┐
compose sweep job ──► briefing composer agent (system prompt GENERATED from the library) │
 (cron, tz+quiet-      ← briefing providers (tasks, projects, offers, invoices, …)       │
  hours aware)         ← module_inbox digest · connections read (gmail/cal/slack)        │
                       ← bounded web check (cited)                                       │
                       → BriefingSpec: sections[{lang, narration, rank, sources}]        │
                         + decision candidates → decision queue                          │
                       persisted: module_briefing.specs + thread briefing:{t}:{u}        │
                       └──────────────────────────────────────────────────────────────────┘
        ┌───────────────────────────┬───────────────────────────────┬────────────────────┐
   Sheet (web/mobile)          Walkthrough                     Channels (Ph.4)       Voice (Ph.4)
   <Renderer response=lang     step engine over sections +     react-email/PDF       narration script
    isStreaming={false}        decisions; same Renderer         + Slack cards         + decision tools
    toolProvider=module ops    per step (zoom-in-place)         reply-to-act
    onAction → queue/copilot>  onAction → queue
        └───────────── one decision queue — resolved once, idempotent, any surface ─────────────┘
```

**Two layers on one substrate** (this is where "based on the legacy
dashboard" pays off):

1. **Composed layer (daily)** — BriefingSpec sections, ephemeral, ranked and
   dropped by the composer. The morning sheet + walkthrough.
2. **Pinned layer (persistent)** — the user says "pin this" on any composed
   widget → it becomes a `DashboardWidgetInstance` (kind `openui`) in their
   `DashboardDocument`; re-hydrated with fresh data via `toolProvider` on
   every view. The legacy dashboard lives on as the pinned board under the
   daily briefing.

**Live streaming path** (drill-ins, on-demand micro-briefs): the same lang
streams as ordinary AG-UI `TEXT_MESSAGE_CONTENT` over the existing SSE seam
(`apps-ai-transport.ts` → `copilot-adapter.ts`); a message part tagged
`openui-lang` renders through the same `Renderer` with `isStreaming={true}`.
No new event types.

### Action security model (non-negotiable)

`onAction` events are **client claims, not verdicts**. Every verdict routes
to a module op (`briefing_decision_resolve`) that: checks the decision is
`pending`, checks the actor may resolve it (role routing), then drives the
**native approvals** resume path for the underlying tool call. The connector
write policy (allow/ask/deny) is enforced server-side exactly as today —
OpenUI changes presentation, not authorization. `formState` (edited drafts,
tone toggles) is passed as resume payload, size-capped and schema-validated.

## 3. New surface

### 3.1 `packages/briefing-lang` (new, pro)

Mirrors the generative-ui split:

- `src/catalog.ts` — server-safe `defineComponent` prop schemas (zod) + LLM
  descriptions. No React.
- `src/registry.tsx` — React bindings per component (engenty ui-core +
  design-tokens; lucide icons).
- `src/library.ts` — `createLibrary(...)`; exported for the Renderer AND for
  prompt generation.
- `src/prompt.ts` + build step — generate the composer system-prompt fragment
  from the library (via `lang-core` prompt generation / `@openuidev/cli`);
  emitted artifact checked in as `src/generated/system-prompt.txt` with a CI
  check that it's fresh (same posture as the UI plugin catalog).

Initial component set (from the validated mocks):

| Component | Props sketch | Used by |
|---|---|---|
| `DecisionCard` | title, context, amount?, sourceChips[], severity, verdicts[{id,label,kind:primary\|secondary\|quiet}], decisionId | walkthrough + sheet + Slack mapping |
| `Digest` | items[{time, title, detail, threadRef?}] | "while you were out" |
| `DayTimeline` | rangeHours, events[{start,dur,label,lane,flag?}] | sheet "today" |
| `TrendMetric` | label, value, delta?, series[], unit | pipeline / KPIs |
| `AgingBar` | buckets[{label,value}], rows[{label,value,status}] | receivables |
| `ScheduleList` | events[…, conflictWith?] | walkthrough today step |
| `ArtifactChip` | kind(pdf\|doc\|table), title, subtitle, ref | "prepared for you" |
| `LedgerList` | items[{time,text}] | handled-without-you |
| + ports of `Metric`, `List`, `Card`, `Stack`, `Badge` semantics from generative-ui | | generic fallback |

### 3.2 `modules/briefing` (new module, migrated base)

Migration per the parked-modules recipe: rsync relevant legacy dashboard UI →
`modules/briefing/ui/legacy-base/`, root `engenty.plugins` entry, **the
easy-to-miss `supabase-sync.mjs` compose step**, `engenty.plugin.json`
(provides `module.briefing`, `module.briefing.read/.write`,
`ui.route.module.briefing`, `ui.icon.briefing`; capabilities operations+ai+ui),
then `pnpm --filter @engenty/ui generate:plugins`.

DB (`module_briefing` schema):

```sql
specs (
  id uuid pk, tenant_id, user_id, kind text            -- morning|evening|ondemand
, briefing_date date, status text                      -- composing|ready|superseded
, lang_version text, library_version text
, sections jsonb    -- [{id, title, rank, lang, narration, sources[], decisionIds[]}]
, ledger jsonb      -- handled-without-you items
, composed_at timestamptz, window_from timestamptz
, thread_id text    -- briefing:{tenant}:{user} message ref
)
decisions (
  id uuid pk, tenant_id, user_id                       -- routed owner
, spec_id uuid null, source jsonb                      -- {module|connector, ref}
, title text, context jsonb, draft_ref jsonb
, execution jsonb                                      -- suspended tool-call ref for approvals resume
, status text      -- pending|approved|deferred|dismissed|executed|dissolved|failed
, verdict jsonb, defer_until timestamptz, trigger_id text
, resolved_at timestamptz, resolved_via text           -- web|walkthrough|voice|slack|email
)
prefs ( tenant_id, user_id, morning_time, evening_time, timezone, channels jsonb, autonomy jsonb )
pinned ( tenant_id, user_id, document jsonb )          -- DashboardDocument, kind=openui widgets
```

Module ops (agent + UI surface): `briefing_get_current`, `briefing_compose`
(recompose window param), `briefing_decision_list`,
`briefing_decision_resolve`, `briefing_pin_widget`, `briefing_prefs_*`,
`briefing_widget_query` (the `toolProvider` backend — dispatches to declared
read ops of other modules; read-only, allowlisted).

### 3.3 `apps/ai` — composer + scheduling

- **Composer agent** (`briefing-composer`): system prompt = role + ranking
  rules + generated library prompt + narration contract. Output contract:
  per-section OpenUI Lang + one-line narration + rank + sources; decision
  candidates as structured tool calls (`briefing_propose_decision`), NOT
  prose. Runs under tenant sandbox, `autonomous_mode ≥ read_only`.
- **Provider contract** (plugin SDK): `provideBriefing(ctx: {tenantId,
  userId, since}) → {sections: SectionInput[], decisions:
  DecisionCandidate[], freshness}`. Adapt
  `modules/tasks/src/lib/tasks-briefing-service.ts` and
  `modules/projects/ui/components/briefing/*` data services first.
- **Scheduling**: sweep system job `briefing-compose-sweep` (`*/15 * * * *`)
  in `apps/ai` — finds users due from `prefs` (tz-aware, respects
  `scheduler/quiet-hours.ts`), spawns compose runs. Sweep-job over per-user
  heartbeats because triggers materialize agent Tasks and per-user heartbeat
  fan-out churns the heartbeat sync (same reasoning as `inbox-sync`).
  Evening wrap = same sweep, `kind=evening`.
- **Defer-as-trigger**: `briefing_decision_resolve(defer)` writes
  `defer_until` + creates a one-shot trigger whose task re-runs the
  decision's context check first (payment landed → status `dissolved`).

### 3.4 UI routes

- `/mdl/briefing` — **walkthrough** (default start route post-login): step
  engine over `spec.sections` + pending decisions; interaction contract from
  the click dummy (act → confirmation → undo window → auto-advance);
  zoom-in-place = nested lang nodes revealed, not navigation.
- `/mdl/briefing/sheet` — composed sections rendered top-to-bottom, one
  `Renderer` per section, `toolProvider` live queries, statuses from the
  decision queue (Supabase realtime on `module_briefing.decisions` — mind the
  realtime schema-version gotcha).
- `/mdl/briefing/board` — pinned layer (Phase 3b).
- Copilot contribution: starter prompts ("brief me on…", "recompose"),
  `useBadgeCount` = pending decisions.

## 4. Phases

### Phase 0 — OpenUI spike (~2 days, exit-gated)

1. Add `@openuidev/react-lang` + `@openuidev/lang-core` (pin exact; record
   lang version). Watch the jiti-singleton pattern if anything registers
   globals.
2. Define 2 components (`TrendMetric`, `DecisionCard`) via `defineComponent`;
   `createLibrary`; generate prompt.
3. apps/ai scratch agent emits lang for a canned brief → persist string →
   re-render `isStreaming={false}` → assert deterministic + `initialState`
   rehydration.
4. Stream the same lang through the existing AG-UI SSE seam into a dev route
   with `isStreaming={true}`.
5. `onAction` round-trip into a stub op; `toolProvider` `Query()` against a
   module op.
6. Measure: tokens per section vs JSON equivalent, bundle delta, render perf.

**Exit criteria:** persisted re-render is deterministic; actions carry
formState reliably; streaming works over our SSE; bundle acceptable. If any
fail → fallback path is the frozen json-render catalog (concept unchanged,
substrate swapped) — decide before Phase 1.

### Phase 1 — Module + library substrate (foundation, no composer yet)

- `packages/briefing-lang` with the full initial component set; prompt
  generation build step + freshness CI check.
- `modules/briefing` scaffold via parked-module recipe; `module_briefing`
  schema + ops (specs/prefs CRUD only); plugin catalog regen.
- Sheet route rendering a **hand-authored** BriefingSpec fixture (design QA
  against the mocks in `docs/internal/daybreak/`).
- dashboard-core: add `openui` widget kind (+ schemaVersion bump).

### Phase 2 — Composer + real sheet (awareness, read-only)

- Provider contract in plugin SDK; providers: tasks, projects, offers,
  invoices, inbox digest, calendar read.
- Composer agent + compose sweep + recompose op; spec persistence on thread +
  table; window (`since`) logic incl. vacation catch-up compose.
- Sheet live: `toolProvider` queries, realtime statuses; default start route;
  "everything else" overflow section (misranking escape hatch).
- Delete retired `apps/core` dashboard generate/runtime routes.
- **Milestone: the morning sheet is real.** No decision queue yet — asks
  still flow through existing approvals UX.

### Phase 3 — Decisions + walkthrough (the product moment)

- `decisions` table + ops; approvals resume integration; connections `ask`
  surfacing as DecisionCards; server-side verdict validation (§2 security);
  defer-as-trigger + dissolution; ledger.
- Walkthrough route with the validated interaction contract; voice-FAB
  wiring for "read it to me" text narration (full voice is Phase 4).
- 3b: pinned board — pin action on composed widgets, `DashboardDocument`
  persistence, board route (grid decision: GridStack port vs React grid).

### Phase 4 — Channels + voice + rhythm

- `@openuidev/react-email` render target + PDF via `pdf-service` (headless
  render of the sheet route or SSR of registry components) → delivery through
  Gmail/Slack connector actions under write policies.
- Reply-to-act parsing in the inbox sync pipeline → `briefing_decision_resolve`.
- Slack/Teams action cards → same op (signed callback ids).
- Realtime voice: narration script from spec, decision tools registered for
  voice; evening wrap enabled; on-demand micro-briefs ("brief me on X")
  streamed live.

## 5. Risks & mitigations

| Risk | Mitigation |
|---|---|
| OpenUI is young (lang v0.x, vendor thesysdev) | Pin exact versions; record `langVersion`+`libraryVersion` per spec; MIT → vendor/fork `lang-core` parser is the escape hatch; Phase-0 gate with json-render fallback |
| Old persisted specs vs lang evolution | Specs are daily-ephemeral (supersede next morning); pinned widgets re-compose on library bumps; archived briefings keep narration text as the durable record |
| Client-forged actions | §2 model: verdicts are server-validated ops through native approvals; client events are claims only |
| Composer cost (every provider + 3 connectors + web, per user/morning, in tenant sandbox) | `since`-window incremental compose; provider freshness hints + cache; quiet-day early exit (skip web check if nothing moved); per-tenant budget in prefs |
| Prompt drift between library and composer | Generated prompt artifact + CI freshness check (plugin-catalog pattern) |
| Realtime status sync | Known realtime schema-version gotcha — verify `postgres_changes` on `module_briefing` early in Phase 2 |

## 6. Open questions (decide before the phase that needs them)

1. **Naming/ids** (Phase 1): module id `briefing` proposed; legacy `dashboard`
   id retires. Route `/mdl/briefing`. OK?
2. **Decision routing** (Phase 3): whose decisions land on whose briefing —
   role-based default + per-module override?
3. **Trust ramp** (Phase 3): tenant onboarding choice for autonomy level
   (read-only vs draft-everything), surfaced as prefs, not buried in
   connections.
4. **Grid tech for the pinned board** (Phase 3b): port GridStack or adopt a
   React-native grid.
5. **generative-ui convergence** (post-Phase 2): port remaining json-render
   consumers to OpenUI or keep both indefinitely.

## 7. Related

- `docs/internal/daybreak-start-page.md` — concept, UX contract, mocks
- `docs/wip/inbox-module.md`, `docs/wip/connections-framework.md`,
  `docs/wip/agent-approvals.md`
- Mastra OpenUI guide: https://mastra.ai/guides/build-your-ui/openui
- OpenUI: https://github.com/thesysdev/openui ·
  https://www.openui.com/docs/openui-lang/overview (Renderer, evolution guide)
