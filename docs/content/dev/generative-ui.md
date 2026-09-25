---
title: Generative UI
description: Rich documents in the pane, agent-generated sandboxed widgets, and declarative A2UI surfaces composed from the engenty catalog.
---

# Generative UI

[Objects in chat](./objects) render **records that already exist** as fixed
cards. Generative UI is the next step: the agent shapes the UI itself — a full
document beside the chat, a one-off interactive widget, or a composed surface
built from native components. Three rails, chosen by what the content is:

| Rail | Content | Trust model | Tool |
|---|---|---|---|
| **Document panels** | A module record as a full document | First-party React, no sandbox | `show_objects` with `display: "panel"` / `"expanded"` |
| **Generated widgets** | Arbitrary agent-authored HTML | Sandboxed iframe + CSP | `show_widget` |
| **Declarative surfaces** | Composed lists/facts/actions from **our** components | UI-as-data: only catalog components render | `show_ui` |

The rule of thumb the agent follows: records → `show_objects`; native-looking
composition → `show_ui`; beyond-catalog one-offs (novel charts, mini-apps) →
`show_widget`.

## Rich documents in the pane

"Show me offer X" should put the *full offer document* beside the chat — and
when the user says "raise the daily rate", the document updates in place.

The pieces:

- **`CommercialDocumentView`** (`@engenty/commercial-editor`) is a chrome-less,
  read-only HTML rendering of a commercial document: recipient + meta header,
  number/title, introduction, blocks with line items, totals (via the shared
  `CommercialBlockTotals`), final notes. It is the HTML sibling of the PDF
  template and is width-tolerant, so it works in the narrow side pane.
- The offers and invoices detail pages build on it, and each module registers
  its own page — embedded (`<OfferDetailPage embedded offerId>`) — as the
  object widget's **`panel`**, so the pane shows what the module's route shows
  and a draft is the draft editor there too. The pane wraps a panel in its own
  `PageHeaderProvider`, so an embedded page's breadcrumbs and topbar actions
  do not reach the page it sits beside. Because the page sits on module
  queries, the module's live binding + agent-tool invalidation refresh it
  whenever the agent edits the record — there is no extra wiring.
- The update loop is therefore: agent calls `offers_update` → postgres change /
  tool invalidation → query refetch → document re-renders. Nothing is pushed
  into the panel explicitly.

The panel is read-only by design: the agent does the edits, the document shows
the state.

### Panel → chat: `askAgent`

A record panel can hand the user back to the conversation.
`ObjectDisplayIntent` (the same seam that decides click behavior per surface)
carries an optional **`askAgent(prompt, ref?)`** handler; full-page chat
implements it by prefilling the composer through a host-keyed draft bridge
(`registerCopilotComposerDraftSetter` / `setCopilotComposerDraft`).

Panels render the shared bar:

```tsx
<ObjectPanelAskAgentBar
  contentRef={contentRef}   // watched for text selections to quote
  label={`${offer.offer_number} — ${offer.title}`}
  objectRef={objectRef}
/>
```

"Ask the agent to…" prefills `label (module:entity:id): ` so a follow-up like
"raise the daily rate" resolves against the open document; selecting text in
the panel adds an "Ask about selection" chip that quotes it. On surfaces
without a composer (`askAgent` absent) the bar renders nothing — the same
absent-handler contract as the rest of the intent.

## Generated widgets — `show_widget`

The agent authors a self-contained HTML document; the chat renders it through
the **same sandboxed frame external MCP App widgets use** (`McpAppFrame`):
`srcdoc` iframe, opaque origin (no `allow-same-origin`), injected CSP on a
`default-src 'none'` base. For generated code the sandbox is the safety
boundary — stronger than any payload validation.

What makes it interactive is the **internal MCP Apps origin**. The widget
speaks the standard MCP Apps postMessage bridge, and its `tools/call` goes to
`POST /ai/mcp-apps/call` with the pseudo server id **`engenty:internal`**.
That branch never leaves the process boundary over HTTP: it executes the named
gateway tool through the core gateway **with the viewing user's token** — so a
widget can call `contacts_list` or `offers_update` exactly as far as the user
could, and no further. Module authz is the trust boundary, never server trust,
never a service principal.

Guardrails: 256KB HTML cap (rejected, not truncated), 64KB per bridge call,
no `connect-src` — generated widgets stay offline; the bridge is their only
channel. The HTML persists as the tool output (`_meta.engenty.mcp_app`), so a
replayed transcript re-renders the widget like every other card.

First-party code can use the same rail without shipping JS into the host
bundle: register a template at boot with
`registerInternalMcpAppTemplate({ uri: "ui://offers/quick-edit.html", html })`
(`apps/ai/src/ai/mcp-apps/internal.ts`) and return
`buildInternalMcpAppToolResult({ resourceUri, structuredContent, toolName })`
from a tool's `execute`. Same frame, same bridge, no `resources/read`
round-trip.

## Declarative surfaces — `show_ui` and the A2UI catalog

For UI that should look **native and chrome-less** — composed lists, facts
grids, small action sets — an iframe is the wrong tool: it cannot use our
components, theme, query cache, or router. Here the agent emits **declarative
JSON** ([A2UI](https://a2ui.org), v0.9 wire format): a flat component list plus
a data model, rendered natively from a **client-controlled catalog**. UI-as-
data needs no sandbox, because the agent can only reference approved
components.

The catalog is `engenty:core/v1`, in `packages/a2ui-catalog`:

| Component | Props | Renders |
|---|---|---|
| `List` | `children` | vertical stack |
| `Row` | `title`, `subtitle?`, `meta?`, `badge?`, `objectRef?`, `action?`, `children?` | one list row |
| `DetailGrid` | `rows: [{ label, value }]` | label/value facts |
| `Badge` | `label`, `tone?: default\|success\|warning` | status pill |
| `Actions` | `children` | horizontal button group |
| `Button` | `label`, `action` | pill button |
| `Text` | `text`, `variant?: h3\|h4\|body\|muted` | typography |
| `Grid` | `children`, `columns?: 2\|3\|4` | dashboard tile row |
| `Metric` | `label`, `value`, `caption?`, `tone?`, `sparkline?` | KPI tile |
| `BarChart` / `LineChart` / `AreaChart` | `title?`, `points?` / `series?`, `action?` | cartesian chart |
| `DonutChart` | `title?`, `slices`, `center?`, `action?` | donut |

Two properties do the heavy lifting:

- **`Row.objectRef`** is the bridge to tier-1 object widgets: set it to an
  engenty ref (`offers:offer:<id>`) and the **native record card renders in
  place of the row** — live data, viewer authz, panel affordances. A2UI
  composes *around* native records rather than copying their fields.
- **Bindable props** accept `{"path": "/json/pointer"}` into the surface's
  data model instead of a literal, so a later data patch is a one-line update,
  not a re-render.

Actions land on seams that already exist: `open_object` (context `{ref}`) goes
to `ObjectDisplayIntent.openInPanel`; any other event name is forwarded to the
agent as a user message.

### Emission and validation

`show_ui` takes `{ components, data?, title? }`, validates the component list
**agent-side** against the catalog contract (unknown component, missing
`root`, dangling child ref, duplicate id → the tool returns the issues and the
model retries — nothing broken ever reaches the user), then persists the
ordered v0.9 message list (`createSurface` → `updateComponents` →
`updateDataModel`) under `_meta.engenty.a2ui`. The chat card
(`core.a2ui`) re-feeds those messages through the renderer's
`MessageProcessor` on every mount — replay is the normal path, not a special
case.

### The renderer is encapsulated

`packages/a2ui-catalog` pins the official React renderer (`@a2ui/react` +
`@a2ui/web_core`; the A2UI spec is v1.0-RC and still evolving) and keeps two
hard boundaries:

- **No `@a2ui/*` type escapes the package.** The only rendering entry point is
  `EngentyA2uiSurfaceView({ messages, surfaceId, onAction })` — plain JSON in,
  plain callback out. Spec churn lands as a renderer upgrade inside one
  package, not a rewrite of ai-ui.
- **The package's `zod` is v3** (what the A2UI schemas are built with), while
  the workspace is on zod 4. Do not import workspace zod helpers inside
  `a2ui-catalog`, and do not re-export its schemas.

The server side never touches the renderer: `@engenty/a2ui-catalog/spec` is a
dependency-free subpath (component names, prompt guide, validator, message
builder) that `apps/ai` imports directly.

### Extending the catalog

Adding a component is three edits in `packages/a2ui-catalog`:

1. `src/spec.ts` — add the name to `ENGENTY_A2UI_COMPONENT_NAMES` and a line
   to `ENGENTY_A2UI_PROMPT_GUIDE` (that guide *is* the model's documentation).
2. `src/catalog.tsx` — `createComponentImplementation({ name, schema }, render)`
   with a zod3 schema built from the A2UI primitives (`DynamicStringSchema`
   for bindable strings, `ActionSchema` for actions, `ChildListSchema` for
   children), and add it to `createEngentyA2uiCatalog()`.
3. A `src/spec.test.ts` case if the component has structural rules.

Keep the catalog small and chrome-less — a component earns its place by
covering a composition the existing seven cannot.

## Security posture

| Renderer | Boundary |
|---|---|
| Document panels / A2UI catalog | UI-as-data or first-party React: rendered in-app, viewer-authz'd module queries, no sandbox needed |
| Generated / external HTML | Opaque-origin sandboxed iframe, injected CSP (`default-src 'none'`), size caps |
| Widget `tools/call` (internal) | Core gateway as the **viewing user** — module authz, never a service principal |
| Widget `tools/call` (external) | Proxied + validated against the tenant's registered server list |

## Where things live

| Path | What |
|---|---|
| `packages/commercial-editor/src/commercial-core/components/CommercialDocumentView.tsx` | Shared read-only document rendering |
| `modules/{offers,invoices}/ui/components/copilot/*-document-view.tsx` | Module document panels |
| `packages/ai-ui/src/objects/object-panel-ask-agent-bar.tsx`, `packages/ai-ui/src/copilot/copilot-composer-draft-intent.ts` | Panel→chat affordance |
| `apps/ai/src/ai/mcp-apps/internal.ts` | Internal origin: template registry, gateway `tools/call`, caps |
| `apps/ai/ai/tools/show-widget-tool.ts`, `apps/ai/ai/tools/show-ui-tool.ts` | The two tools |
| `packages/a2ui-catalog/` | Catalog, renderer encapsulation, server-safe `/spec` |
| `packages/ai-core/src/objects/a2ui-render.ts` | `_meta.engenty.a2ui` marker |
| `packages/ai-ui/src/components/copilot/tool-call/a2ui-tool-call-card.tsx` | The `core.a2ui` chat card |
| `docs/wip/generative-ui.md` | The original design (incl. A2UI-vs-OpenUI and MCP-Apps-vs-A2UI adjudication) |
