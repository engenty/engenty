---
name: app-authoring
title: Authoring an engenty App
description: File layout, manifest shape, the single-inlined-HTML frontend constraint, and the build-fix loop for creating tenant Apps.
allowed-tools: engenty_tools_search engenty_tool_execute
---

# Authoring an engenty App

Use this when someone asks for a tool, a form, a calculator, a tracker or a
workflow that does not exist yet as a module.

## File layout

```
index.html     the whole frontend — markup, CSS and JS inline
server.js      optional backend: export default { fetch(request) }
rules.js       optional pure rules module
manifest       written as the `manifest` argument to app_file_write
```

`index.html` must be **self-contained**. It is inlined into a sandboxed frame
with `default-src 'none'`, so an external stylesheet, a CDN script tag or a
web font will simply not load. Inline everything; use system fonts.

## The manifest

```jsonc
{
  "name": "Travel expenses",
  "entry": { "frontend": "index.html", "backend": "server.js" },
  "engenty": { "operations": ["inbox_threads_list"] },
  "storage": { "data": true, "config": true },
  "egress": { "connect": [] },
  "actions": [
    { "id": "collect",  "risk": "low",  "summary": "Add a receipt to the current report" },
    { "id": "finalize", "risk": "high", "requiresApproval": true,
      "summary": "Submit the finished report to accounting" }
  ],
  "rules": "rules.js"
}
```

- `engenty.operations` — the exact operation ids the App may invoke. Find them
  with `engenty_tools_search`; do not guess.
- `actions` — each maps to a path in the backend. `{ "id": "collect" }` means
  the backend must answer `POST /collect`.
- `storage.data` / `storage.config` — declare only what you use; both are
  enforced, and an undeclared store returns `apps.storageNotDeclared`.
  `data` is session-scoped working state, `config` is what survives between
  instances. See the engenty-bridge skill for which to reach for.
- `egress.connect` — hosts the App may reach directly. Leave it empty. It is
  deny-all by default and that is almost always right: an App reaches the
  world through declared engenty operations.
- `risk` / `requiresApproval` — see the honesty rule in AGENTS.md.

## The backend

```js
export default {
  async fetch(request) {
    const { input, session_id } = await request.json();
    // ...
    return Response.json({ ok: true });
  },
};
```

Web-standard only: `Request`, `Response`, `URL`, `JSON`. Node 22 runs inside
the isolate. There is no filesystem worth using and no durable memory between
replicas — persist through the working store, never in a module-level
variable.

## The build-fix loop

`app_release_propose` builds the draft. On failure you get `build_log`
verbatim, with a file and a line:

```
workspace/index.js:1:33: ERROR: Expected "}" but found "1"
```

Fix that file with `app_file_write` and propose again. The version number does
not advance on a failed build, so iterating costs nothing.

Two failures the log will not spell out for you:

- `app_entry_missing` — `manifest.entry.frontend` names a file you never
  wrote.
- `app_manifest_invalid` — the manifest failed validation; the reason is in
  `build_log`.

## Worked shape: an interactive report

1. `index.html` renders the current state and a form. On submit it calls the
   bridge tool `app_action` with `{ action: "collect", input: {...} }`.
2. `server.js` handles `/collect`: validates with `rules.js`, writes the item
   to the working store, returns the updated list.
3. `index.html` re-renders from the response. Live rule violations come from
   importing `rules.js` in the page too — the same function, so the browser
   and the batch can never disagree.
4. `finalize` is a separate high-risk action that produces the final document
   through a declared engenty operation.

The same App then works headlessly: a routine calls the `finalize` action,
which pauses for approval, and the rules module runs identically with no
browser present.

## Starter prompts

- Build me a travel-expense report that applies our per-diem rules.
- Make a small tool for tracking equipment loans.
- Turn this spreadsheet process into an app.
