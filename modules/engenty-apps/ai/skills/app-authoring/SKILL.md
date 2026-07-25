---
name: app-authoring
title: Authoring an engenty App
description: File layout, manifest shape, the two frontend shapes (single document or bundled React), and the build-fix loop for creating tenant Apps.
allowed-tools: engenty_tools_search engenty_tool_execute
---

# Authoring an engenty App

Use this when someone asks for a tool, a form, a calculator, a tracker or a
workflow that does not exist yet as a module.

## Pick a shape first

| | Single document | Bundled React |
| --- | --- | --- |
| `entry.frontend` | `index.html` | `src/main.tsx` |
| Good for | one screen, a form, a calculator | components, shared state, several views |
| Frontend files | one, self-contained | as many as you like |

The extension decides the mode. Nothing else has to be set, and the two cannot
fall out of sync.

**Reach for bundled React by default** unless the whole thing genuinely fits on
one screen. Components, `useState` and real imports cost nothing here, and a
single-document app that grows past a few hundred lines becomes very hard to
edit through `app_file_write`.

## File layout

```
src/main.tsx     bundle mode: mounts into #root
src/App.tsx      your components, imported normally
src/styles.css   imported from a component, inlined at build
index.html       single-document mode instead: markup, CSS and JS inline
server.js        optional backend: export default { fetch(request) }
rules.js         optional pure rules module
```

## The manifest

```jsonc
{
  "name": "Travel expenses",
  "entry": { "frontend": "src/main.tsx", "backend": "server.js" },
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

Always write `entry.frontend` with its extension. `src/main` is not bundle
mode; it is a missing file.

## Bundled React

```tsx
// src/main.tsx
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(<App />);
```

```tsx
// src/App.tsx
import { useEffect, useState } from "react";
import { data } from "engenty:bridge";

export function App() {
  const [draft, setDraft] = useState("");
  useEffect(() => {
    data.get("draft").then((saved) => setDraft(String(saved ?? "")));
  }, []);
  return (
    <textarea
      value={draft}
      onChange={(event) => {
        setDraft(event.target.value);
        void data.set("draft", event.target.value);
      }}
    />
  );
}
```

TypeScript and JSX are compiled for you. `#root` already exists in the
document — do not write your own `index.html` in this mode.

**The entire dependency surface is:**

```
react   react-dom/client   engenty:bridge
```

There is no `package.json` and no npm install. Importing anything else fails
the build and names what you asked for. If a task seems to need a chart or a
date library, write the twenty lines yourself.

`engenty:bridge` replaces the hand-written `postMessage` plumbing: it exports
`call`, `engenty`, `action`, `data`, `config`, `notify`, `openLink` and
`onSession`. See the engenty-bridge skill.

## Single document

`index.html` must be **self-contained**. It is inlined into a sandboxed frame
with `default-src 'none'`, so an external stylesheet, a CDN script tag or a web
font will simply not load. Inline everything; use system fonts. The same rule
holds in bundle mode — it is just enforced by the bundler instead of by you.

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
src/App.tsx:12:20: ERROR: Expected "}" but found "1"
```

Fix that file with `app_file_write` and propose again. The version number does
not advance on a failed build, so iterating costs nothing. The frontend is
built before the backend is deployed, so a broken component fails in under a
second rather than after a deploy.

Three failures the log will not spell out for you:

- `app_entry_missing` — `manifest.entry.frontend` names a file you never wrote.
- `app_manifest_invalid` — the manifest failed validation; the reason is in
  `build_log`.
- An import that is not on the list above — the message names the specifier and
  lists what is available.

## Worked shape: an interactive report

1. `src/App.tsx` renders the current state and a form. On submit it calls
   `action("collect", {...})` from `engenty:bridge`.
2. `server.js` handles `/collect`: validates with `rules.js`, writes the item
   to the working store, returns the updated list.
3. The component re-renders from the response. Live rule violations come from
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
