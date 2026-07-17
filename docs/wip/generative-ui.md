# Generative UI — rich widgets in chat, rich documents in the pane

Status: DESIGN — 2026-07-17. Follows the chat-object-rendering phase (shipped
v0.1.27). Owner: Matthias.

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

## 5. Phase G3 — A2UI: declarative composition against an engenty catalog

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

## 10. References

- MCP Apps extension (first official MCP extension, `text/html;profile=mcp-app`,
  future content types): modelcontextprotocol.io/extensions/apps
- A2UI (Google, v0.9.1/v1.0-RC): github.com/google/A2UI, a2ui.org.
  Renderers reference (React official, stable since v0.8):
  a2ui.org/reference/renderers; React setup (`@a2ui/react` +
  `@a2ui/web_core`, `<A2UISurface>`): a2ui.org/guides/client-setup#react;
  CopilotKit alternative: docs.copilotkit.ai/generative-ui/a2ui
- "A2UI + MCP Apps: combining declarative and custom agentic UIs" —
  developers.googleblog.com/a2ui-and-mcp-apps
- A2UI over AG-UI (transport we already run): copilotkit.ai/ag-ui-and-a2ui,
  a2ui.org/guides/a2ui-with-any-agent-framework
- Internal: `docs/content/dev/objects.md` (shipped architecture),
  `docs/wip/chat-object-rendering.md` (previous phase design)
