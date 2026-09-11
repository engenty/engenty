# Flow explorer

`index.html` is a fully self-contained, dependency-free page that maps how
app wiring (HTTP, packages, modules) travels. **This is not the work-model
Workflow** (the published runnable) — see `docs/content/dev/work-model.md`.

Everything it shows is driven by the JSON document embedded near the bottom of
`index.html`, inside the clearly marked block:

```html
<!-- ==== FLOW DATA (pure JSON — edit this block to add/update flows …) ==== -->
<script type="application/json" id="engenty-flows">
{ "nodes": [...], "flows": [...] }
</script>
```

It is pure JSON (parsed with `JSON.parse`), so keep it comment-free and strictly valid.

## Adding or updating a flow

Append an entry to `flows`:

```js
{
  "id": "my-flow",
  "title": "Button label",
  "description": "One-paragraph overview shown in the side panel.",
  "steps": [
    {
      "section": "Optional grouping heading",
      "from": "ui",            // node id, or group id: "apps" | "packages" | "modules"
      "to": "core",            // from === to renders as an internal step (numbered badge, no arrow)
      "mechanism": "HTTP POST /api/…",
      "payload": "{ what, moves, across, the, boundary }",
      "detail": "1–2 sentences on what happens at this hop.",
      "refs": ["apps/core/src/…:120-140"]   // click-to-copy in the UI
    }
  ],
  "uncertain": ["Anything not verified in code — rendered as a caveat box."]
}
```

Node ids are directory names (`core`, `ai-ui`, `contacts`, …) plus the pseudo-nodes
`supabase`, `scripts`, `deploy`, `llm`, `manage`. New workspace units go in `nodes`
with `kind: "app" | "package" | "module" | "infra" | "external"`.

The flows were traced from actual code on 2026-07-03; refs point at the call sites,
so re-verify them when the code they anchor to moves.
