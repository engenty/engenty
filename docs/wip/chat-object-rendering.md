# Chat Object Rendering — Objects, Artifacts & MCP Apps in Chat

Status: **implemented, phases A–D** (2026-07-16, branch `feat/chat-object-widgets`).
Companion to [artifacts.md](./artifacts.md) /
[artifacts-implementation.md](./artifacts-implementation.md) — artifacts stay as they are;
this spec generalizes the *display* side so chat can render **any engenty object** (contacts,
offers, tasks, receipts, team members, …) and **external MCP App widgets** through the same
surfaces artifacts already use.

## 0. Implementation status & deviations

| Phase | Status | Notes / deviations from the spec below |
|---|---|---|
| A — refs, registry, tool, contacts+offers | ✅ | `ObjectRef` in `packages/ai-core/src/objects/object-ref.ts`; registry + cards in `packages/ai-ui/src/objects/`; `show_objects` in `apps/ai/ai/tools/show-objects-tool.ts` (snapshots via `<module>_get` gateway ops with the user token — G1 authz server-side; no outputSchema so `_meta` survives — G8 confirmed the same way mcp-app relies on it) |
| B — pane, hints, chips | ✅ | Object tabs live in the existing artifact store (`objectTabs` on `ArtifactPaneState`), not a full `PaneEntry` refactor — artifact list sync untouched, guarded against stealing object-tab focus. Display hints execute only when the tool call streamed live (initial-mount state check, G4). Chat surfaces target `ENGENTY_COPILOT_HOST_KEY` directly (same as `show_artifact`) — no host registry needed. Inline card clicks navigate; the pane opens via agent hints (open-in-panel affordance = `onOpenInPanel`, wired but not surfaced as UI yet) |
| C — MCP Apps host | ✅ | Server: template cache + csp/structuredContent passthrough + demo fallback deleted; widget `tools/call` proxied via `POST /ai/mcp-apps/call` validated against the tenant registry. Client: hand-rolled postMessage JSON-RPC host (`mcp-app-frame.tsx`) — initialize handshake, tool-input/result push, size-changed, open-link, display-mode(inline) — with host-injected CSP meta. Deviation: no `@modelcontextprotocol/ext-apps` dependency yet (spec 2026-07-28 churn, G7) and no dedicated sandbox origin (G6) — srcdoc without `allow-same-origin` gives an opaque origin; revisit both once the core spec ships |
| D — breadth | ✅ | tasks/team/invoices widgets (list cards); `entity_refs` backfilled in contacts/inbox/kb retrieval sources using the ref format; copilot AGENTS.md teaches render-don't-prose |

Not built (explicitly): `ui/message` / `ui/update-model-context` bridge methods (respond
method-not-found), per-tool approval routing for widget calls beyond server allowlisting,
mcp-app pane tabs (widgets render inline only).

## 1. Goal & scenarios

The agent decides *what* to show and *where*; the user can always re-place it.

| Scenario | Example | Surface |
|---|---|---|
| Object list inline in chat | "Show me contacts at ACME" → contact list card | inline (tool-call card) |
| Single object inline | "Work on offer 2026-041" → offer card | inline |
| Artifact inline | small generated table/markdown | inline |
| Object/artifact in side panel | user clicks "open" on an inline card; agent opens a doc | end pane (existing artifact pane, generalized) |
| Full screen, chat beside | reviewing/editing an offer or long artifact | pane `expanded` mode (exists) |
| External MCP App widget | third-party server exposes `ui://` widget | inline / pane via MCP Apps host |

**Reference, not copy**: module/core objects are *linked* into chat. Their storage place —
the module's own tables — stays canonical. Chat persists only a typed reference plus a
minimal display snapshot; rendering always resolves live data.

## 2. Core concept: `ObjectRef`

One typed reference format used everywhere (chat display, retrieval `entity_refs`, links):

```
<module>:<entity>:<id>            e.g.  contacts:contact:0198c9a2-…
                                        offers:offer:0198c9a2-…
                                        core:user:0198c9a2-…
artifact:<id>                     artifacts are already first-class, keep their own scheme
```

```ts
// packages/ui-plugin-sdk (types shared with apps/ai via a small contracts package)
interface ObjectRef {
  module: string;        // plugin id ("contacts", "offers", "core")
  entity: string;        // entity type within the module ("contact", "offer", "user")
  id: string;
}
// canonical string form: `${module}:${entity}:${id}` — parse/format helpers exported once
```

Rules:

- **Ids only, no payloads** in the persisted chat message. A small `display` snapshot
  (title, subtitle, status) MAY accompany the ref for skeleton/fallback rendering, but is
  never authoritative.
- The same string format backfills `entity_refs` in `packages/retrieval/src/contracts.ts:62`
  (currently reserved/unused) — one identity scheme for display and context-graph.
- Route mapping is module-owned: the widget registration (§5) carries `getHref(ref)` so
  inline cards can deep-link to `/mdl/<module>/<id>` detail pages.

## 3. Display surfaces — mapping to existing machinery

All three surfaces already exist; none needs to be invented, only generalized.

| Surface | Mechanism today | Change needed |
|---|---|---|
| **Inline** | Tool-call card registry — `registerToolCallUi()` (`packages/ai-ui/src/components/copilot/tool-call/tool-call-ui-registry.ts:31`), rendered by `CopilotMessageContent` for trailing tool parts; proven by approval/sub-agent/mcp-app cards | Register one generic `core.object-render` card that resolves per-type widgets (§5) |
| **Side panel** | Artifact end-pane: `workspace-artifact-pane.tsx` portals into the app-shell end-pane slot (320–880 px, persisted width) with per-host tab strip | Generalize tab model from "artifact ids" to typed pane entries (§6) |
| **Full screen, chat beside** | `paneExpanded` + `setWorkspaceEndPaneExpanded` grows the pane over the main area (`workspace-artifact-pane.tsx:168`) | Nothing structural — inherits from pane generalization |

The agent expresses placement as a **display hint** (`inline | panel | expanded`); the host
may override (e.g. small viewport collapses panel → overlay Sheet, mirroring the
`DocSidebar` responsive pattern in `packages/ui-core/.../doc-sidebar.tsx`).

## 4. Two-tier widget architecture

```
show_objects tool ──► ObjectRef(s) + display hint
                          │
                          ▼
              object-widget registry lookup (module:entity)
                ├── Tier 1: native React widget (first-party modules)
                │     theme-native, TanStack Query + registerLiveBinding realtime,
                │     router deep-links, i18n namespaces
                └── Tier 2: MCP App iframe (AppBridge)
                      external MCP servers' ui:// widgets; also available for
                      internal cases that want hard isolation
```

**Why not MCP Apps for everything?** An iframe per contact card is heavy, visually foreign
(CSS-var bridge only, no design system), loses the shared query cache/realtime, and breaks
router-level deep-linking. First-party objects render as normal React. MCP Apps is the
*boundary* technology: external servers, untrusted HTML, portability.

**Why adopt MCP Apps at all (Tier 2)?** It became the first official MCP extension
(2026-01-26, `io.modelcontextprotocol/ui`, Anthropic + OpenAI co-authored). Adopting it:

- upgrades our demo-stage MCP-app path (`apps/ai/src/ai/mcp-apps/http-client.ts` +
  `mcp-app-tool-call-card.tsx`) to the real spec — external `ui://` widgets render properly;
- `ui/request-display-mode` (`inline | fullscreen | pip`) maps 1:1 onto our three surfaces;
- the official host SDK (`@modelcontextprotocol/ext-apps/app-bridge`) accepts a **null MCP
  client** with manual `oncalltool`/`onreadresource` handlers — i.e. widgets can be backed
  directly by our Mastra tool runtime, no MCP server required, and every widget-initiated
  `tools/call` passes through our host code → straight into the approvals framework;
- our own widgets become portable to Claude/ChatGPT if we ever expose an engenty MCP server.

## 5. Plugin SDK: `registerObjectWidget`

New method on `EngentyUiApi` (`packages/ui-plugin-sdk/src/index.ts:403`), modeled on
`registerDashboardWidget`, backed by `createContributionRegistry`:

```ts
registerObjectWidget: (input: {
  id: string;                          // "offers.offer"
  module: string;                      // "offers"
  entity: string;                      // "offer"
  // inline chat card — REQUIRED. Receives refs (1..n) and renders card or list.
  card: ComponentType<ObjectWidgetCardProps>;
  // side-panel / expanded renderer — optional; falls back to card or an
  // "open in module" affordance when absent.
  panel?: ComponentType<ObjectWidgetPanelProps>;
  // deep-link into the module route for "open full page"
  getHref?: (ref: ObjectRef) => string | null;
  // fetch minimal display fields for N refs (title/subtitle/status) — used by
  // generic fallbacks, link-chip upgrades (§9), and search-result rendering
  useDisplay?: (refs: ObjectRef[]) => ObjectDisplayResult;
  order?: number;
}) => void;

interface ObjectWidgetCardProps {
  refs: ObjectRef[];                   // 1 = single card, n = list rendering
  displayHint: "inline";
  // provenance for the list case ("12 of 84 contacts, query: …")
  provenance?: { total?: number; query?: string };
  onOpenInPanel?: (ref: ObjectRef) => void;
}
```

- Modules register from their existing `plugin.ts` init (same place as `registerTab` /
  `registerRoute`). Data access via the module's own exposed client (`engenty.plugins.get`).
- **Contacts + offers first** (richest demo pair: list, single, and "work on offer" flows),
  then tasks, team members, invoices/receipts.
- Registry lookup key `${module}:${entity}`; unresolved types get a **generic fallback
  card**: title/subtitle from the persisted `display` snapshot + "open in module" link.
  This is the not-installed / not-loaded safety net (§10 G3).

## 6. Pane generalization: artifact pane → workspace object pane

`ArtifactPaneState` (`packages/ai-ui/src/artifacts/artifact-store.ts:15`) holds
`{activeId, paneOpen, paneExpanded}` and the tab list is *derived from the server artifact
list* (`useArtifactListSync`). Objects are not in that list, so the tab model must become
host-local, typed entries:

```ts
type PaneEntry =
  | { kind: "artifact"; artifactId: string }
  | { kind: "object";   ref: ObjectRef }
  | { kind: "mcp-app";  serverId: string; resourceUri: string; toolCallId: string };

interface WorkspacePaneState {
  entries: PaneEntry[];        // ordered tabs, host-keyed like today
  activeKey: string | null;    // stable key per entry
  paneOpen: boolean;
  paneExpanded: boolean;
}
```

- Artifact entries keep today's behavior 1:1 (auto-open on fresh artifact, auto-close when
  the list empties, realtime sync) — `useArtifactListSync` reconciles **only** the
  artifact-kind entries. Object/mcp-app tabs are session-transient (see §10 G4).
- Body resolution branches per kind: `resolveArtifactRenderer` (unchanged) /
  object-widget `panel` / MCP-app iframe host.
- Rename in place (`workspace-artifact-pane.tsx` → `workspace-pane.tsx`) but keep
  `useArtifacts` consumers working — the artifacts API surface stays; the store grows.

## 7. Agent-side: `show_objects` tool + render protocol

New tool in `apps/ai` (sibling of `apps/ai/ai/tools/artifact-tools.ts`):

```ts
show_objects({
  refs: string[];                         // canonical ObjectRef strings
  display?: "inline" | "panel" | "expanded";   // hint, default "inline"
  title?: string;                         // pane tab title when panel/expanded
  provenance?: { total?: number; query?: string };
})
```

Behavior:

1. **Validate + authorize**: parse refs, check the module is installed for the tenant and
   the *requesting user* can read each object (module read authz — same check the module's
   own list endpoints use). Drop (and report) refs that fail — never render unauthorized ids.
2. Fetch a minimal `display` snapshot per ref (server-side, via module data access) so the
   card renders instantly and history replay has a fallback (§10 G2).
3. Return the marker the UI card matches on, mirroring the mcp-app pattern
   (`_meta.engenty.mcp_app` in `apps/ai/src/ai/mcp-apps/http-client.ts:193`):

```jsonc
{
  "ok": true,
  "content": [{ "type": "text", "text": "Rendered 3 contacts inline." }],  // model-facing
  "_meta": { "engenty": { "object_render": {
    "refs": ["contacts:contact:…", "…"],
    "display": "inline",
    "items": [{ "ref": "…", "title": "ACME GmbH", "subtitle": "Vienna", "status": "active" }],
    "provenance": { "total": 84, "query": "contacts at ACME" }
  } } }
}
```

- The `_meta` payload is **display-only** — kept out of the model's context beyond the short
  text summary (same philosophy as MCP Apps' `structuredContent`; important for token cost
  on lists).
- UI side: one `registerToolCallUi({ id: "core.object-render", match: output has
  `_meta.engenty.object_render`, priority ~55 })` card that parses refs, resolves the
  object-widget registry, and dispatches inline vs. "activate pane entry".
- Existing module search/list tools **also** get upgraded: where a tool already returns
  entities (e.g. contact search), the tool can attach the same `_meta` marker so results
  render as cards without a second `show_objects` round-trip. Agent instructions steer:
  *"when the user asks to see objects, prefer rendering over prose tables."*
- `panel` / `expanded` display hints are executed client-side by the card on arrival
  (open pane entry + set expanded), not by server state.

## 8. MCP Apps host — productionizing Tier 2

Current state is demo-grade and must be replaced, not extended:

| Today (`http-client.ts`, `mcp-app-tool-call-card.tsx`) | Target |
|---|---|
| Ad-hoc JSON-RPC POST per call, `mcp-protocol-version: 2025-11-25` | Real MCP client session; adopt spec rev **2026-01-26**, re-check against core spec **2026-07-28** (RC lands ~2 weeks from this draft — freeze `_meta` key names only after it ships) |
| `demoEventsHtml` fallback fabricates a widget (`http-client.ts:137`) | **Delete.** No resource → plain text card |
| HTML inlined into tool result `_meta` and persisted with the message | Fetch `ui://` template at discovery time, cache per server; persist only `resource_uri` (+ hash) — template pre-declaration is a spec security tenet |
| `srcDoc` iframe, `sandbox="allow-forms allow-popups allow-scripts"`, no bridge — widgets are static | `AppBridge` from `@modelcontextprotocol/ext-apps/app-bridge`: postMessage JSON-RPC, `ui/initialize` handshake, `tool-input`/`tool-result` push, `ui/open-link`, `ui/message`, `ui/request-display-mode`, `ui/update-model-context` |
| No CSP handling | Build iframe CSP from the resource's declared `_meta.ui.csp` domains; reject undeclared. Default = fully self-contained |
| Same-origin `srcDoc` | **Double-iframe sandbox origin** (§10 G6) |

Bridge handler policy (host-side `oncalltool`):

- widget-initiated `tools/call` → route to the owning MCP server (external) or Mastra tool
  runtime (internal), **through the approvals framework** — a widget click that mutates data
  is subject to the same allow/ask/deny policies as an agent tool call;
- `ui/open-link` → confirm + open externally (never navigate the host);
- `ui/message` → insert as user-visible chat input (attributed "from widget"), not silently
  as model context;
- `ui/update-model-context` → append to thread context with provenance marker.

## 9. Link-chip upgrades (secondary, cheap win)

`useCitations` (`copilot-message-content.tsx:431`) already upgrades KB links. Generalize:
markdown links matching `/mdl/<module>/<id>` (or explicit `engenty:` refs) in assistant
text get upgraded to entity chips via `useDisplay` from the widget registry. Purely
presentational — no agent change needed; works even when the agent just *mentions* an object.

## 10. Known gaps & roadblocks (hit these first)

Ordered by risk of invalidating the design.

**G1 — Object authz in chat context (design-blocking).**
Chat threads can outlive membership/permission changes, and agents may run with different
principals than the viewing user (service principal, `grantForGoal` plans from the authz
phase). Inline cards resolve data **client-side as the viewing user** → RLS/API authz
applies naturally; but the `show_objects` *snapshot* was authorized against the requester at
call time. Decision needed: snapshots carry no sensitive fields beyond title/subtitle
(proposed), and live resolution failing → card degrades to "no access". Must also define
behavior for shared/multi-user threads. **Spike first: render a contact card as a second
user without contact-module access.**

**G2 — Persistence & replay of rendered messages (design-blocking).**
Verify how AG-UI tool parts are persisted and replayed on thread reload (Mastra message
storage). The design assumes tool `output._meta` survives into history — the mcp-app card
already relies on this, but confirm for: (a) reload, (b) thread promoted/moved across
surfaces, (c) very old threads where a module was since uninstalled. If `_meta` is stripped
anywhere in the enrichment pipeline (transcript enrichment from the external-bridge phase
touches message parts), that's the first fix.

**G3 — Module not loaded in the current shell.**
Chat renders in surfaces where a module's UI plugin may not be initialized (manage app,
public surfaces, module disabled per-tenant). Registry miss must degrade to the generic
fallback card (snapshot + href) — never a crash, never an empty hole. Fallback card is
Phase A scope, not polish. (Same class of problem as the manage-app i18n-namespace gap.)

**G4 — Pane tab persistence semantics.**
Artifact tabs are server-derived; object tabs are transient view state. On reload, object
tabs vanish (acceptable, they're one click away in the transcript) — but `activeKey`
reconciliation in `useArtifactListSync` must not fight the new entry kinds. Decide + test
the auto-open precedence: fresh artifact vs. agent `display:"panel"` object in the same turn.

**G5 — Inline list ergonomics.**
Unbounded lists inline in a transcript wreck scroll UX. Hard cap inline rendering (~10
items + "show all → panel"), keep pagination/virtualization panel-only. Also: the
transcript is width-constrained (~prose width); card design must work at ~600 px and at
mobile widths (DocSidebar's 800 px inline threshold is a hint that narrow contexts are real).

**G6 — Sandbox origin for MCP App widgets (infra).**
Spec-correct isolation = double iframe on a **separate origin** (outer sandbox-proxy page +
inner `srcdoc`), so widget code never runs on the app origin. Needs a dedicated
`sandbox.<domain>` (prod: `sandbox.engenty.engrd.xyz` via Coolify/Traefik; dev: a
`*.engenty.localhost` slot — the portless proxy already does multi-domain). `srcDoc`-only
(today's approach) is same-origin-adjacent and not acceptable once widgets get a live
bridge. Infra ticket, do early — it gates Phase C and has deploy-side moving parts.

**G7 — Spec churn window.**
Core MCP 2026-07-28 ships in ~2 weeks; `ext-apps` SDK v1.1.x tracks it and mcp-ui v2 is in
flight. Phase C should start *after* pinning versions against the released spec. Note the
official spec has **no widget-state persistence** and **no elicitation from widgets** —
don't design flows that assume either; `ui/resource-teardown` is the only save-state hook.

**G8 — `structuredContent` vs. model context in our runtime.**
Verify Mastra's tool-result handling doesn't feed the whole result (incl. `_meta`) back
into the model context — otherwise big display payloads burn tokens and G7's philosophy
breaks. If it does, add a result-splitting seam in the tool wrapper (model-facing `content`
vs. UI-facing `_meta`) before shipping list rendering.

**G9 — Editing objects from chat.**
"Work on offer xyz" implies mutation. Out of scope for the widget layer: edits flow through
agent tools (with approvals) or the module's own panel/route UI. The object `panel` renderer
MAY embed the module's existing edit components (offer-edit uses DocSidebar-based pages —
check they mount outside their route context; if route-coupled, panel = read-only + "open
full page" in v1). Explicitly not building a parallel edit stack.

**G10 — Realtime staleness of inline cards.**
Native cards should reuse `registerLiveBinding`/TanStack Query so an offer card updates
when the agent (or anyone) mutates the offer mid-conversation. Cheap for Tier 1; impossible
for snapshots — one more reason snapshots are fallback-only.

## 11. Phasing

| Phase | Deliverable | Proves / de-risks |
|---|---|---|
| **A** | `ObjectRef` + parse/format; `registerObjectWidget` + generic fallback card; `show_objects` tool + `core.object-render` inline card; contacts + offers widgets | G1 (authz spike), G2 (replay), G3 (fallback), G5 (list caps), G8 (context splitting) |
| **B** | Pane generalization (`PaneEntry` kinds, expanded mode for objects); `panel` renderers for contacts/offers; display-hint execution; link-chip upgrades (§9) | G4, G9 (panel embed vs. route coupling) |
| **C** | MCP Apps host: sandbox origin (G6), `AppBridge` integration, CSP builder, `ui://` template caching, approvals routing for widget `tools/call`; delete demo fallback | G6, G7; external-widget story |
| **D** | Remaining module widgets (tasks, team, invoices/receipts); agent-instruction tuning ("render, don't prose"); `entity_refs` backfill in retrieval | breadth |

Phase A alone delivers the three headline use cases ("show me contacts", "which tasks",
"work on offer") inline; B adds the panel/expanded ergonomics; C is the external boundary.

## 12. Open questions

1. **Ref string form**: `module:entity:id` (proposed, matches nothing existing so it's free)
   vs. a URI (`engenty://contacts/contact/<id>`). URI is nicer in markdown links; colon form
   is nicer as a registry key. Could adopt both with one canonicalizer.
2. **Should `show_objects` exist at all**, vs. only enriching existing module tools'
   outputs with the render marker? Both are cheap; the dedicated tool gives the agent an
   explicit "display this" verb and covers refs obtained outside a tool call (user pasted a
   link). Proposed: both, tool first.
3. **Multi-entity widgets** (e.g. an offer card that shows its contact): leave to the
   module's card component — no framework support needed initially.
4. **Do artifacts eventually render via object widgets too** (`artifact:<id>` as just
   another registry entry)? Attractive end-state; not Phase A — artifacts' server-derived
   tab sync is load-bearing (G4).
5. **Internal widgets as MCP Apps for dogfooding portability** — worth one experiment in
   Phase C (e.g. expose the contact card as `ui://` behind an engenty MCP server) but not a
   commitment.
