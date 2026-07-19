# Generative UI — rich widgets in chat, rich documents in the pane

Status: IMPLEMENTED (v1) — 2026-07-18, branch `feat/generative-ui`. G1
(CommercialDocumentView panels + askAgent seam), G2 (internal MCP Apps:
`engenty:internal` proxy branch, template registry, `show_widget`), and G3
(A2UI `engenty:core/v1` catalog via `@a2ui/react`, `show_ui`,
`packages/a2ui-catalog`) all landed and were browser-verified. Design below
kept as reference; deferred items: first-party template examples, A2UI
incremental surface updates over the live stream, Q1–Q3/Q5 open questions.

Originally: DESIGN — 2026-07-17. Follows the chat-object-rendering phase
(shipped v0.1.27). Owner: Matthias.

**Surfaced during live verification (2026-07-19) — NOT a generative-UI defect,
tracked separately in the run/resume machinery.** While exercising the tools
in the copilot, a `409 agent_threads.resumeInProgress` wedged the thread. Two
facets the fix must cover, noted here so they aren't lost:

1. **Read-only turns trigger it too.** The 409 hit a turn that only ran
   `show_objects` (no writes, no approval) — so the resume race is broader than
   "parallel create + per-tool approval"; the fix can't assume it only affects
   write/approval legs.
2. **The error banner is sticky.** It stays pinned above a turn that actually
   succeeded (the object list rendered fine below it) and has no dismiss
   control. Make the banner dismissable and auto-clear on the next successful
   turn, so a transient 409 doesn't leave a permanent red bar.

**Q6 DECIDED (2026-07-17, Matthias): A2UI for the first implementation.**
OpenUI stays evaluated-not-chosen (§5); revisit only if the spike-level pains
listed there show up in practice. Worked examples: §5b.

## 0. Problem

The object widgets that shipped in v0.1.27 are deliberately restricted: fixed
React card shapes per module, a shared row chrome, a thin `panel`. That was the
right first step — but it caps the idea. What we actually want:

1. **Rich, interactive widgets in chat** — not just fixed cards. Composed
   lists, forms, small tools; in the limit, UI the agent *generates* for the
   task at hand.
2. **Rich documents in the pane** — "show me offer X" should put the *full
   offer document* beside the chat, and when I tell the agent "raise the daily
   rate", the document updates in place.
3. **Minimal chrome.** Unlike the app UI, these surfaces don't need topbars,
   menus, or buttons-for-everything — the agent does the work; the UI shows
   state and takes the occasional direct manipulation.

## 1. The landscape (checked 2026-07-17)

Three rails exist for agent-driven UI, and they are converging:

| Rail | What it is | Trust model | State |
|---|---|---|---|
| **Native widgets** (ours, tier 1) | Pre-built React per module | Trusted code in-bundle | Shipped v0.1.27 |
| **MCP Apps** (`io.modelcontextprotocol/ui`) | Server ships HTML via `ui://` resources, host renders in sandboxed iframe | Untrusted → sandbox + CSP + proxied tool calls | First official MCP extension; our host shipped v0.1.27 (external servers only). Spec: `text/html;profile=mcp-app` with explicit room for more content types |
| **A2UI** (Google, Apache-2.0) | Agent emits **declarative JSON** — flat component list + data model + events — rendered natively from a **client-controlled catalog** | UI-as-data, not code: no sandbox needed, agents can only reference approved components | v0.9.1 stable, v1.0 RC. **React is an officially maintained renderer, stable since v0.8** (`@a2ui/react` + `@a2ui/web_core`); also Lit, Angular, Flutter, plus `@copilotkit/a2ui-renderer` |
| **OpenUI** (Thesys, MIT) | The **model itself emits "OpenUI Lang"** — a compact streaming DSL (~67% fewer tokens than JSON) — inline in its response; client parses + renders progressively from a Zod-schema component catalog (`defineComponent`/`createLibrary`) | Same UI-as-data model: only catalog components render; interactions (`onAction` + `formState`, `continue_conversation`) become the next user message | Launched 2026-03; 7k★/526 forks in ~4 months, 1M+ downloads; React/Vue/Svelte/RN/email bindings + headless chat state; LangChain official integration. **Single-vendor** (Thesys, $4M seed, C1 platform) with a commercial cloud |

Two convergence facts shape the design:

1. **A2UI rides existing transports, ours included.** A2UI payloads are
   sanctioned over both **MCP Apps** (alternative content type on the same
   `ui://` + `_meta` pattern) and **AG-UI** (payloads stream over the
   bidirectional runtime connection — CopilotKit is a launch partner of the
   A2UI release). Our copilot chat *is* AG-UI (`packages/ag-ui-bridge`), so
   the internal agent can emit A2UI over the stream we already run; the MCP
   route stays for external servers.
2. **React is an officially maintained renderer** (stable since v0.8, per
   a2ui.org/reference/renderers): `@a2ui/react` + `@a2ui/web_core` expose a
   `MessageProcessor`, an `<A2UISurface>` component and a `useA2UI()` hook;
   CopilotKit's `@copilotkit/a2ui-renderer` is the AG-UI-integrated
   alternative. We consume a renderer and own only the catalog.

So we do not have to choose between MCP Apps and A2UI; the transports we
already run carry both, and the choice is per-widget:

- **HTML in sandbox** when the widget is arbitrary/custom (external servers,
  agent-generated one-offs).
- **A2UI against our catalog** when the widget should look native and compose
  from our primitives (lists, detail views, forms).

## 2. Target architecture

One transport, three renderers, chosen by content type:

```
tool output _meta ──┬─ engenty.object_render ──→ native widget registry   (shipped)
                    ├─ engenty.mcp_app (html) ──→ McpAppFrame sandbox      (shipped, external-only)
                    └─ engenty.mcp_app (a2ui) ──→ A2UI renderer + catalog  (new)
pane tab ───────────┬─ artifact type ──────────→ registerArtifactRenderer (shipped)
                    └─ object ref ─────────────→ widget.panel             (shipped, thin today)
```

Everything below is about filling in the two "new/thin" cells.

## 3. Phase G1 — Rich record panels + the update loop (no new protocol)

Deliver the headline use case first, because it needs *no* new protocol:
**full offer preview in the pane, updating as the agent edits.**

What exists (verified):

- The pane already renders `widget.panel` for an object tab
  (`ObjectPaneBody`); offers registers a thin `OfferObjectPanel`.
- **The update loop already works.** `modules/offers/ui/offers-live-binding.ts`
  subscribes `module_offers.offers` + `offer_blocks` postgres changes and
  invalidates `offerKeys.all`; agent tool resolution invalidates immediately
  via `agentToolIds`. Any panel built on `useOfferDetailQuery` refreshes when
  the agent calls `offers_update` / `offers_replace_blocks` /
  `offers_update_blocks`. Nothing to wire.
- The gap is the **document view itself**: today the only real "offer document"
  is the server-rendered PDF blob (`downloadOfferPdf` → `PdfPreviewSheet`);
  the detail page is route-bound (`useParams` + `usePageConfig` chrome) and
  renders status cards, not a document.

Work:

1. **`OfferDocumentView({ offerId })`** — a standalone, chrome-less HTML
   rendering of the offer: header fields, introduction, blocks/line items via
   `@engenty/commercial-editor` `calculateTotals`, totals, terms. Extracted so
   the draft editor, the detail page, and the pane can all use it (it is the
   HTML sibling of the PDF template). Register it as the offers `panel`.
2. Same for invoices (the modules mirror each other).
3. **Panel→chat affordance**: a slim action bar on the panel ("Ask the agent
   to…" / selection → quote into composer). Seam: extend `ObjectDisplayIntent`
   with `askAgent?(prompt, ref)` that the full-page chat wires to the composer.
4. Display-hint polish: `display: "expanded"` for "work on offer X" (the
   full-screen scenario) — mechanism shipped, needs exercise + agent guidance.

Effort: mostly module UI work; zero new infrastructure. This alone delivers
"I want the full preview of an offer in the panel and the chat updates it".

## 4. Phase G2 — Internal MCP Apps: sandboxed HTML widgets, including generated ones

The MCP Apps host (frame, CSP injection, postMessage bridge, template cache,
tools/call proxy) is transport-agnostic. Verified: the **only** thing binding
it to external servers is the proxy's allowlist —
`/ai/mcp-apps/call` 403s unless `server_url` is in the tenant's registered
server list. The frame itself renders any `{ html, csp, toolInput, toolResult }`.

Work:

1. **Internal widget origin.** Add an internal branch to the proxy: a
   designated pseudo-server id (e.g. `engenty:internal`) whose `tools/call`
   does not go out over HTTP but through the **core gateway with the viewing
   user's token** (the same `invokeTool` path `show_objects` snapshots use).
   Authz is then module authz, not server trust — an internal widget can call
   `offers_update` exactly as far as the user could.
2. **First-party `ui://` templates.** Let modules ship widget templates
   (registered like tool-call UIs) rendered through `McpAppFrame` — rich,
   self-contained HTML widgets without touching the React bundle.
3. **Generated widgets.** A `show_widget { html, data?, title? }` agent tool
   that renders agent-authored HTML through the same sandbox. This is
   generative UI *now*: the sandbox + CSP is the safety boundary, the internal
   tools/call branch (capped + user-authz'd) is the interactivity channel.
   Guardrails: size cap, no external `connect-src` unless declared, and the
   widget is persisted as the tool output so replay works like every other
   card.

Effort: small server change (proxy branch), one new tool, registration plumbing.
Big unlock: both first-party rich widgets and agent-generated ones.

## 5. Phase G3 — declarative composition against an engenty catalog (A2UI vs OpenUI)

For UI that should look **native and chrome-less** — dynamically composed
lists, detail layouts, small forms — HTML-in-iframe is the wrong tool: it
can't use our components, theme, or router. A2UI is exactly this shape:
the agent streams a flat component list + data model; the client renders from
a catalog **we** control.

Work:

1. **Catalog.** Map a small set of chrome-less primitives onto ui-core /
   ai-ui: `List`, `Row` (our `ObjectListRow`), `DetailGrid`, `Badge`, `Stat`,
   `Form`+fields, `Table`, `Actions`, `ObjectRef` (renders a native object
   chip/card — bridging A2UI composition with tier-1 widgets).
2. **Renderer.** Consume a shipped React renderer — evaluate `@a2ui/react` +
   `@a2ui/web_core` (official, `MessageProcessor` / `<A2UISurface>` /
   `useA2UI()`; working reference: `samples/client/react/shell` in the A2UI
   repo) vs `@copilotkit/a2ui-renderer` (built for the AG-UI carriage we
   already use, custom-catalog API) — and register our catalog with it. We
   own the catalog, not the interpreter; hand-rolling is now only the
   fallback if neither theming story fits ui-core. (Also on the radar:
   Vercel's `json-render`, a community React take using Zod-schema catalogs.)
3. **Transport.** Two carriages, one renderer:
   - **Internal agent → AG-UI**: A2UI payloads stream over the existing
     copilot AG-UI connection (the sanctioned CopilotKit pattern) — no MCP
     round-trip for our own agent, and incremental updates ride the stream we
     already have.
   - **External MCP servers → A2UI-over-MCP**: same `ui://` + `_meta`
     plumbing as G2, content type distinguishing a2ui vs html.
4. **Agent surface.** Either a `show_ui` tool taking an A2UI payload, or —
   more robust for weak models — module-declared A2UI *templates* the agent
   fills with data.

Risk: spec is v1.0-RC and "still evolving" — pin the renderer package and keep
the catalog ours, so spec churn lands as a renderer upgrade, not a rewrite.

### G3 format choice: A2UI vs OpenUI

OpenUI (Thesys, MIT, launched 2026-03) attacks the same problem from the
opposite end. Where A2UI is a **wire protocol between agent code and client**,
OpenUI puts the format **in the model's own token stream**: components are
defined with Zod schemas + React renderers (`defineComponent`/`createLibrary`),
a system prompt is generated from the catalog, and the model answers in
"OpenUI Lang" — a line-oriented DSL claiming ~67% fewer tokens than JSON,
parsed and rendered progressively as it streams. Interactions close the loop
natively: `Renderer onAction` receives `{ humanFriendlyMessage, formState }`,
and `continue_conversation` actions re-enter as the next user message — the
same shape as our §6 contract.

Why it fits us well:
- **No new transport at all**: OpenUI Lang rides inside the assistant message
  over our existing AG-UI stream; the client parses it out of text parts
  (headless adapters exist for exactly this). Even less plumbing than
  A2UI-over-AG-UI.
- **Zod-schema catalogs** match how this whole repo already defines contracts.
- Token efficiency compounds — composed UIs per message, every message.
- The "model composes freely from my catalog" behavior is *the* product ask
  ("dynamically compose those lists").

Why to hesitate:
- **Single-vendor governance** (Thesys; commercial cloud upsell) vs A2UI's
  Google-led multi-vendor standards track.
- **No interop story**: external MCP servers will speak MCP Apps/A2UI, never
  OpenUI Lang — so OpenUI can only ever be our *internal* composition rail.
- Model-emits-DSL means malformed output degrades UI (their docs have a
  troubleshooting page for a reason); A2UI's agent-side emission can validate
  before send.
- Raw DSL must never flash in the transcript — needs part-level handling.

**Decision (Q6, 2026-07-17): A2UI.** One format for both rails beats a
better-fitting-but-vendor-locked internal rail: standards trajectory, external
MCP-server interop, agent-side validation before send, and official React
renderer. OpenUI's real advantages (token efficiency, in-stream composition)
are recoverable later without architectural change — the catalog is ours
either way, and a second emitter behind the same catalog is an optimization,
not a redesign.

### Challenged (2026-07-17): why not MCP Apps as the primary format?

Adjudicated per use case rather than in the abstract — the answer is a
**division of labor**, not a winner:

| Use case | Format | Why |
|---|---|---|
| Composed lists/forms/details from **our** elements, objects by reference | **A2UI** | Precisely put: an iframe can run *copies* of our React components (bundled into the template), never the app's own instances — nothing is **shared**, everything is duplicated or proxied. Costs, per widget: second React instance + build pipeline; second data plane (no session in an opaque origin → all reads/writes round-trip the bridge + `/ai/mcp-apps/call`; no shared query cache; live updates only via host re-push); theme-token injection with re-push on change; popovers/focus/router/panel seams stop at the frame border; and the sandbox protects nothing, since first-party code is already trusted. Native A2UI rendering gets cache, realtime, theme, router and `objectRef` bridging for free |
| External-server widgets | **MCP Apps** | Shipped since v0.1.27; first official MCP extension; what third parties will actually ship. A2UI-over-MCP adoption externally is still speculative |
| Arbitrary / generated one-off widgets | **MCP Apps** | Beyond-catalog expressiveness (novel charts, mini-apps); for *generated* code the sandbox is a stronger guarantee than payload validation |

MCP Apps' genuine advantages — near-zero marginal cost (host is live), full
fidelity, hard isolation — dominate exactly where content is foreign,
generated, or **deliberately unshared**. That last one is the honest scope of
"internal MCP Apps" (G2): widgets that must not bloat the host bundle,
agent-generated widgets (untrusted by definition), and — longer game —
*distribution*: third-party modules adding chat widgets without shipping JS
into the host bundle. For first-party widgets that want the app's runtime,
the iframe is a platform tax with no offsetting protection. Both formats
stay; A2UI leads the internal investment.

**Known hedge:** if catalog + renderer integration proves heavy, internal
MCP Apps widgets (G2) are the cheap fallback that still ships — at the cost
of precisely the native look and object bridging that motivated the ask.

## 5b. A2UI in practice — worked examples (v0.9 wire format)

All examples use the engenty catalog (Q4 starter set) identified as
`https://engenty.dev/a2ui/catalogs/core/v1/catalog.json` — shorthand
`engenty:core/v1` below. Formats verified against a2ui.org (v0.9.1 current).

### Example 1 — "Show me my Vienna contacts" as a composed list

The agent opens a surface and streams a flat component list. Children
reference siblings **by id** — no nesting, which is what makes incremental
generation and patching cheap:

```jsonc
{ "version": "v0.9",
  "createSurface": {
    "surfaceId": "contacts-vienna",
    "catalogId": "engenty:core/v1",
    "sendDataModel": true } }

{ "version": "v0.9",
  "updateComponents": {
    "surfaceId": "contacts-vienna",
    "components": [
      { "id": "root",    "component": "List",
        "children": ["hdr", "row-anna", "row-felix", "more"] },
      { "id": "hdr",     "component": "Text",
        "text": "Contacts in Vienna", "variant": "h3" },

      { "id": "row-anna", "component": "Row",
        "title":    { "path": "/contacts/0/name" },
        "subtitle": { "path": "/contacts/0/email" },
        "children": ["badge-anna"],
        "objectRef": "contacts:contact:5c241491-…",
        "action": { "event": { "name": "open_object",
          "context": { "ref": "contacts:contact:5c241491-…" } } } },
      { "id": "badge-anna", "component": "Badge", "label": "client" },

      { "id": "row-felix", "component": "Row",
        "title":    { "path": "/contacts/1/name" },
        "subtitle": { "path": "/contacts/1/email" },
        "objectRef": "contacts:contact:1f0b27a6-…" },

      { "id": "more", "component": "Actions", "children": ["btn-all"] },
      { "id": "btn-all", "component": "Button", "label": "Show all 17",
        "action": { "event": { "name": "show_all_contacts" } } } ] }

{ "version": "v0.9",
  "updateDataModel": {
    "surfaceId": "contacts-vienna",
    "path": "/contacts",
    "value": [
      { "name": "Anna Bauer",    "email": "anna.bauer@example.at" },
      { "name": "Felix Steiner", "email": "f.steiner@example.at" } ] } }
```

Two engenty-specific things to notice: `Row.objectRef` is our **bridge
property** — the catalog implementation renders it through the tier-1 object
machinery (live data, viewer authz, panel/menu affordances), so A2UI composes
*around* native records rather than copying their fields. And properties bind
to the data model with JSON-Pointer `{"path": …}`, so a later mutation is a
one-line patch, not a re-render.

### Example 2 — the agent edits, the surface updates

User: *"mark Anna as a partner too"*. The agent calls the gateway op, then
patches only the data model / the one component:

```jsonc
{ "version": "v0.9",
  "updateDataModel": {
    "surfaceId": "contacts-vienna",
    "path": "/contacts/0/roles",
    "value": ["client", "partner"] } }
```

No surface teardown, no flicker — this is the declarative sibling of the G1
live-cache loop.

### Example 3 — user interaction round-trip

The user clicks Anna's row. The renderer resolves the declared `context`
against the data model and emits (per `client_to_server.json`):

```jsonc
{ "version": "v0.9",
  "action": {
    "name": "open_object",
    "surfaceId": "contacts-vienna",
    "sourceComponentId": "row-anna",
    "timestamp": "2026-07-17T14:30:00Z",
    "context": { "ref": "contacts:contact:5c241491-…" } } }
```

Host handling is a small switch, and it lands on seams that already exist:

| Action name | Handler |
|---|---|
| `open_object` | `ObjectDisplayIntent.openInPanel(ref)` — the shipped seam |
| `show_all_contacts`, anything else | forward to the agent over the AG-UI stream as an action message; agent responds with new A2UI messages or prose |

### Example 4 — the engenty catalog (JSON Schema sketch + client wiring)

The catalog is a JSON Schema the agent is prompted with, and the client
registers implementations for. Q4 starter set:

```jsonc
// engenty:core/v1 — components (sketch)
{ "components": {
    "List":       { "properties": { "children": { "type": "array" } } },
    "Row":        { "properties": {
        "title":    { "$ref": "#/$defs/bindableString" },
        "subtitle": { "$ref": "#/$defs/bindableString" },
        "objectRef":{ "type": "string",
                      "description": "engenty ref module:entity:id — renders the native record row" },
        "action":   { "$ref": "#/$defs/action" } } },
    "DetailGrid": { "properties": { "rows": { "type": "array",
        "items": { "properties": { "label": {}, "value": {} } } } } },
    "Badge":      { "properties": { "label": { "type": "string" },
        "tone": { "enum": ["default", "success", "warning"] } } },
    "Actions":    { "properties": { "children": { "type": "array" } } },
    "Button":     { "properties": { "label": {}, "action": {} } },
    "Text":       { "properties": { "text": {}, "variant": {} } } } }
```

Client side (`@a2ui/react` + `@a2ui/web_core`), in ai-ui:

```tsx
const processor = new MessageProcessor({
  catalogs: { "engenty:core/v1": engentyCoreCatalog }, // maps names → ui-core/ai-ui components
});
// AG-UI stream → processor: a2ui parts are fed in as they arrive
<A2UISurface processor={processor} surfaceId={surfaceId} onAction={handleAction} />
```

The client announces `supportedCatalogIds: ["engenty:core/v1"]` so the agent
only composes from what this build renders — an unknown component id is a
validation error agent-side, *before* anything reaches the user.

### Carriage in our stack

A2UI messages ride the existing AG-UI stream as a dedicated part type
(mirroring how tool parts flow today): agent emits them (via a `show_ui`
tool or module template fill — §5.4), the transcript renders an
`A2UISurface` card where the part sits, and replay re-feeds persisted
messages through the processor — same replay story as every other card.
External MCP servers deliver the same payloads via `ui://` + `_meta`
(A2UI-over-MCP), hitting the same renderer.

## 6. Interaction contract (chat ⇄ widget ⇄ record)

- **Agent → record**: gateway operations (`offers_update`, …) as today.
- **Record → panel/widget**: live-cache realtime + agent-tool invalidation
  (exists; G2/G3 widgets get updates pushed over the bridge on invalidation —
  re-push `toolResult`/data model instead of re-rendering the frame).
- **Widget → agent**: `askAgent` seam (G1), proxied tools/call (G2), A2UI
  events (G3). All three end as either a gateway op or a composer message —
  no fourth path.
- **User in chat about the open panel**: include the active pane object ref
  in the run context so "raise the rate" resolves against the open offer
  (open question below).

## 7. Security posture

| Renderer | Boundary |
|---|---|
| Native / A2UI catalog | UI-as-data: agent can only reference approved components; rendered in-app, no sandbox needed |
| HTML (external or generated) | Opaque-origin sandboxed iframe, injected CSP (`default-src 'none'`), tool calls proxied + user-authz'd, size caps |

Internal tools/call **must** run as the viewing user through the core gateway —
never a service principal. Generated HTML must never get `allow-same-origin`.

## 8. Sequencing

| Phase | Value | Depends on |
|---|---|---|
| G1 rich panels + loop | Offer/invoice document in pane, agent-edit loop, panel→chat | nothing new |
| G2 internal MCP Apps | First-party + generated sandboxed widgets | proxy branch |
| G3 A2UI catalog | Native declarative composition, chrome-less lists/forms | catalog + shipped renderer; AG-UI carriage (exists); G2 only for external-server A2UI |

G1 ships standalone. G2 and G3 are now **independent** — G3's internal
carriage is the existing AG-UI stream, so it no longer waits on the G2 proxy
branch (only external-server A2UI does). Order G2 vs G3 by product pull:
G2 buys arbitrary/generated widgets fastest; G3 buys native composed UI.

## 9. Open questions

1. **Q1 — Editing in the panel?** Is the G1 offer document view read-only
   (agent does all edits via chat) or direct-manipulation (inline field
   edits)? Read-only first matches "the agent works on the objects".
2. **Q2 — Generated-widget persistence.** `show_widget` HTML persists in the
   tool output (replayable, but transcripts grow) vs. stored as an artifact
   (`type: "widget"`) and referenced. Leaning artifact-backed above a size
   threshold.
3. **Q3 — Pane context in runs.** Should the active pane object ref always be
   injected into the agent's run context, or only on explicit mention?
4. **Q4 — A2UI catalog scope.** Start with how many components? (Proposal:
   List/Row/DetailGrid/Badge/Actions — the 5 that cover "compose lists".)
5. **Q5 — ext-apps pin.** The MCP core 2026-07-28 release is imminent; pin
   `@modelcontextprotocol/ext-apps` and swap the hand-rolled frame internals
   before or after G2? (Leaning: after — G2 doesn't change the frame contract.)
6. **Q6 — G3 format: A2UI or OpenUI?** **DECIDED 2026-07-17: A2UI** (§5
   decision note; worked examples §5b). OpenUI revisitable later as an
   alternative emitter behind the same catalog.

## 10. References

- MCP Apps extension (first official MCP extension, `text/html;profile=mcp-app`,
  future content types): modelcontextprotocol.io/extensions/apps
- A2UI (Google, v0.9.1/v1.0-RC): github.com/google/A2UI, a2ui.org.
  Renderers reference (React official, stable since v0.8):
  a2ui.org/reference/renderers; React setup (`@a2ui/react` +
  `@a2ui/web_core`, `<A2UISurface>`): a2ui.org/guides/client-setup#react;
  wire format (§5b examples): a2ui.org/reference/messages,
  a2ui.org/concepts/actions, a2ui.org/guides/defining-your-own-catalog;
  CopilotKit alternative: docs.copilotkit.ai/generative-ui/a2ui
- "A2UI + MCP Apps: combining declarative and custom agentic UIs" —
  developers.googleblog.com/a2ui-and-mcp-apps
- A2UI over AG-UI (transport we already run): copilotkit.ai/ag-ui-and-a2ui,
  a2ui.org/guides/a2ui-with-any-agent-framework
- OpenUI (Thesys, MIT, 2026-03): openui.com, github.com/thesysdev/openui;
  packages `@openuidev/lang-core` / `react-lang` / `react-headless`;
  `defineComponent` + `onAction`/`continue_conversation` loop:
  openui.com/docs/openui-lang/defining-components, …/renderer
- Internal: `docs/content/dev/objects.md` (shipped architecture),
  `docs/wip/chat-object-rendering.md` (previous phase design)
