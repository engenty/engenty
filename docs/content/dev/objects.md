---
title: Objects in chat
description: Rendering module records as live cards in chat — object refs, widgets, surfaces, and MCP App widgets.
---

# Objects in chat

When a user asks "show me my contacts" or "which tasks should I work on?", the
answer is a set of **records that already exist** in a module. The agent should
not describe them in prose or paste them into a markdown table — it should
render them, as the cards the module already knows how to draw.

The rule that makes this work: objects are rendered **by reference, never by
copy**. The module's table stays canonical, the widget fetches live data
client-side as the viewing user, and the card can never go stale or leak a
record the viewer is not allowed to see.

Compare with [artifacts](./artifacts): an artifact is content the agent
*authored*, stored in `ai.artifact`. An object is a record the agent *found*.

## Object refs

A record is addressed by a canonical string:

```
<module>:<entity>:<id>
contacts:contact:019f2751-c650-7bcd-bc66-cdda841d7022
```

`ObjectRef` (`packages/ai-core/src/objects/object-ref.ts`) parses and formats
these; `module` and `entity` match `/^[a-z0-9][a-z0-9_-]*$/i` and the id may
itself contain colons. The same format backfills `entity_refs` in the retrieval
contracts, so a search hit and a chat card name a record the same way.

The entity is **not** the module name — `team` holds `member`s. The canonical
set today:

| Ref | Record |
|---|---|
| `contacts:contact:<id>` | Contact (person or organisation) |
| `offers:offer:<id>` | Offer |
| `tasks:task:<id>` | Task |
| `invoices:invoice:<id>` | Invoice |
| `team:member:<id>` | Team member |

## How a card gets into the chat

1. The agent finds ids with a module's list/search tool.
2. It calls **`show_objects`** `{ refs, display?, title?, query?, total? }`.
3. The tool resolves a small display **snapshot** per ref through the core
   gateway *with the requesting user's token* — so a ref the user cannot read is
   dropped server-side and never reaches the transcript.
4. The output carries a marker, `_meta.engenty.object_render`, holding the refs,
   the snapshots, and the display hint.
5. The chat matches that marker (`core.object-render` in the tool-call UI
   registry) and renders the module's widget per ref type.

The snapshots are a **fallback only** — they cover the loading state and the
no-access case. The widget's real data comes from the module's own query.

`display` is `inline` (default), `panel`, or `expanded`. The hint is honored
only for a run that streamed in this page session, and only on a surface that
owns a pane — a replayed transcript never re-opens anything.

> `show_objects` deliberately declares **no `outputSchema`**. Mastra strips
> unknown keys when a schema is present, which would remove `_meta` — the very
> thing the card matches on.

## Providing a widget

A module registers a widget for its ref type. Do this from your UI plugin's
`init`, next to your other registrations:

```tsx
// modules/contacts/ui/register-object-widget.tsx
import { registerObjectWidget } from "@engenty/ai-ui";

registerObjectWidget({
  id: "contacts.contact",
  module: "contacts",
  entity: "contact",
  card: ContactObjectCard,     // required: renders 1 ref or a list
  panel: ContactObjectPanel,   // optional: side-panel view, falls back to card
  getHref: (ref) => `/mdl/contacts/${ref.id}`,
  matchHref: (pathname) => {
    const match = pathname.match(CONTACT_DETAIL_PATTERN);
    return match ? { module: "contacts", entity: "contact", id: match[1] } : null;
  },
});
```

- **`card`** receives `{ refs, items?, provenance?, onOpenInPanel? }`. One ref
  means a single card, several mean a list — the same component handles both.
- **`matchHref`** is the reverse mapping: it lets a plain `/mdl/...` link in the
  agent's prose upgrade into an object chip.
- Registration is reactive. A plugin that registers late re-renders any card
  already on screen, so a fallback upgrades to the real widget.
- An unregistered type is not an error: it renders the generic snapshot card.
  That is the module-not-installed safety net.

### Use the shared row chrome

Do not hand-roll the frame, rows, or the menu — a widget should only say what a
row *contains*:

```tsx
import {
  ObjectCardFrame,
  ObjectListFooter,
  ObjectListRow,
  ObjectRowList,
} from "@engenty/ai-ui";

<ObjectCardFrame>
  <ObjectRowList>
    {shown.map((ref) => (
      <ObjectListRow
        key={ref.id}
        href={`/mdl/contacts/${ref.id}`}
        objectRef={ref}
        onOpenInPanel={onOpenInPanel}
        media={<Avatar … />}
        title={name}
        subtitle={email}
        meta={city}                    // right-aligned secondary fact
        trailing={<Badge>client</Badge>}
        actions={[                     // appended after the built-ins
          { icon: Mail, label: "Copy email", onSelect: copyEmail },
        ]}
      />
    ))}
  </ObjectRowList>
  <ObjectListFooter
    href="/mdl/contacts"
    label="contacts"
    overflow={refs.length - shown.length}
    shown={refs.length}
    total={provenance?.total}
  />
</ObjectCardFrame>
```

The row's 3-dot menu already provides *open in side panel*, *open full page* and
*copy link*; `actions` adds module-specific entries. Keep inline lists to ≤10
rows and let `ObjectListFooter` say "+N more".

## Surfaces decide the behavior

The same card renders in two places, and clicking a record has to mean different
things in each:

| Surface | Primary click | Pane actions |
|---|---|---|
| **Full-page chat** — owns a pane | Opens the record **in the side panel**; the conversation stays put | Shown |
| **Drawer / floating chat** — sits on top of the workspace | **Navigates** to the record, like any link | Hidden |

A card does not ask "am I in the drawer?". The surface declares what it can do,
through `ObjectDisplayIntentProvider`:

```tsx
<ObjectDisplayIntentProvider value={{ openInPanel, applyDisplayHint, navigateFromChat }}>
```

- **Full-page chat** provides all three. `navigateFromChat` docks the chat into
  the drawer (via `openCopilotShell`) *before* navigating, so a link to a module
  route does not throw the conversation away.
- **The drawer provides nothing.** The default `{}` is what makes it correct:
  no `openInPanel` means rows navigate and the pane entries drop out of the
  menu. There is no pane to open into.

If you mount the copilot on a new surface, that is the decision you are making:
provide the intent if you own a pane, omit it if you do not.

## Agent guidance

The copilot's `AGENTS.md` carries the rules that keep this usable:

- Render, don't prose — call `show_objects` instead of describing records.
- **The card is the answer.** Never restate it as a bullet list or a markdown
  table; the fields are already on screen. Add at most a sentence or two the
  cards cannot show: a count, a pattern, a next step.
- References, not copies — refer back to records by ref rather than re-pasting
  their fields.

## MCP Apps — widgets from outside

Native widgets (above) are for first-party modules: real React, full access to
module queries, no sandbox. **MCP Apps** are the second tier, for external and
untrusted servers — an MCP server ships its own UI and we render it sandboxed.

We implement the official `io.modelcontextprotocol/ui` extension (spec revision
2026-01-26).

**Server side** (`apps/ai/src/ai/mcp-apps/http-client.ts`): calling a tool on a
registered MCP server returns a result whose `_meta` names a `ui://` resource.
The host reads that template via `resources/read`, caches it per
`(server, uri)` (5 min TTL, 1MB ceiling — templates are static documents, not
data), and returns the widget payload under `_meta.engenty.mcp_app`.

**Client side** (`McpAppFrame` in ai-ui): the template renders in a `srcdoc`
iframe sandboxed **without** `allow-same-origin`, so it has an opaque origin.
The frame speaks MCP JSON-RPC over `postMessage`:

- `ui/initialize` → host info, theme, locale, display mode
- `ui/notifications/initialized` → the host pushes tool input + result
- `tools/call` → proxied through `POST /ai/mcp-apps/call`, which authenticates
  the viewing user and **validates the target server against the tenant
  registry** (a server that is not registered gets a 403)
- `ui/open-link` → http(s) only
- `size-changed` → clamped to 120–640px

The widget's declared CSP (`_meta.ui.csp`) is injected as a meta tag ahead of
its markup, on a `default-src 'none'` base — undeclared domains stay blocked.

Current limits worth knowing: the host is hand-rolled rather than using
`@modelcontextprotocol/ext-apps` (pinned once the core 2026-07-28 spec ships —
the frame props are already shaped for the swap), MCP App widgets render inline
only, and there is no dedicated sandbox origin yet.

## Where things live

| Path | What |
|---|---|
| `packages/ai-core/src/objects/object-ref.ts` | Ref parse/format, `_meta` marker types |
| `apps/ai/ai/tools/show-objects-tool.ts` | The `show_objects` tool, snapshot resolution |
| `packages/ai-ui/src/objects/` | Widget registry, row chrome, intent seam, fallback card |
| `modules/*/ui/register-object-widget.tsx` | Per-module registration |
| `apps/ai/src/ai/mcp-apps/`, `packages/ai-ui/src/components/copilot/tool-call/mcp-app-frame.tsx` | MCP Apps host |
