---
name: app-authoring
title: Authoring an engenty App
description: File layout, manifest shape, the two frontend shapes (single document or bundled React), and the build-fix loop for creating tenant Apps.
allowed-tools: engenty_tools_search engenty_tool_execute
license: MIT
author: Engenty; visual direction adapted from Anthropic frontend-design (Apache-2.0)
metadata:
  engenty:
    origin: anthropics/skills skills/frontend-design; anthropics/skills skills/web-artifacts-builder (scope only)
---

# Authoring an engenty App

Use this when someone asks for a tool, a form, a calculator, a tracker or a
workflow that does not exist yet as a module.

A **one-screen HTML handout** (report, poster, simple explainer) is
`artifact_write { type: "html" }` — load **artifacts-and-downloads**. Do not
scaffold a Vite/Parcel/shadcn repo. `app_build` is the Engenty equivalent of
“init, develop, bundle, share”: one call commits files into the App's
repository, builds the commit, and publishes a live preview artifact.

## Where an App lives

Every App is a git repository. On the space computer it is checked out at
`/space/apps/<slug>/src`, beside `/space/apps/<slug>/data` — the same
directory the running App sees as `/data`. You can edit files there with
ordinary tools and commit them; `app_build` and `app_file_write` write into the
same tree and commit for you. A release is a commit: `app_release_propose`
commits whatever is uncommitted, builds that commit, and records it as a
version with its sha.

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
engenty.json     the manifest (below); written by app_build from `manifest`
src/main.tsx     bundle mode: mounts into #root
src/App.tsx      your components, imported normally
src/styles.css   imported from a component, inlined at build
index.html       single-document mode instead: markup, CSS and JS inline
server.js        optional backend: export default { fetch(request) }
rules.js         optional pure rules module
```

## The manifest

`engenty.json` in the repository. `app_build` writes it from the `manifest`
argument; editing the file directly is the same thing.

```jsonc
{
  "name": "Travel expenses",
  "entry": { "frontend": "src/main.tsx", "backend": "server.js" },
  "engenty": {
    "operations": ["inbox_threads_list", "gmail_send_message"],
    "tables": ["<table_id>"]
  },
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
  with `engenty_tools_search`; do not guess — a release naming an operation
  that does not exist fails with the unknown ids in its build log. Connector
  actions (Gmail, GitHub, …) are operations too — `gmail_send_message` above
  rides the tenant's connection, approval-gated like any external write.
  Discover those with `connections_catalog`; see "External services" in the
  engenty-bridge skill.
- `engenty.tables` — the Space tables (by id) the App may read and write
  through the bridge. Undeclared means nonexistent, like operations. See
  "Space data" below.
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
date library, write the twenty lines yourself. Do not unpack a shadcn component
archive or run `init-artifact.sh` — those are not this runtime.

`engenty:bridge` replaces the hand-written `postMessage` plumbing: it exports
`call`, `engenty`, `action`, `data`, `config`, `notify`, `openLink` and
`onSession`. See the engenty-bridge skill.

## Single document

`index.html` must be **self-contained**. It is inlined into a sandboxed frame
with `default-src 'none'`, so an external stylesheet, a CDN script tag or a web
font will simply not load. Inline everything; use system fonts. The same rule
holds in bundle mode — it is just enforced by the bundler instead of by you.

## Visual direction

Before writing UI, name the subject, the audience, and the screen's one job.
Pick a short token set: 4–6 named hex colors, a display/body type pairing that
fits the subject (not Inter-by-default), and one signature element the page
will be remembered by. Spend boldness there; keep the rest quiet.

Avoid templated looks unless the brief asks for them: cream + terracotta serif,
near-black + acid accent, or dense broadsheet rules. No purple gradients, no
uniform giant rounding, no numbered 01/02/03 markers unless the content is
actually a sequence.

Copy is UI: sentence case, active verbs, the same word on the button and in the
result. Errors say what happened and how to fix it. Empty states invite an
action.

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
the isolate as root. Never persist in a module-level variable: the process is
put to sleep after a few idle minutes and starts fresh.

### `/data` — the App's own directory

Every App has `/data`, a real directory on the host that outlives every
release. It is where the App's database and its files live; `/app` (the
release itself) is read-only.

```js
import { DatabaseSync } from "node:sqlite";

export default {
  async fetch(request) {
    const db = new DatabaseSync("/data/app.db");
    try {
      db.exec("CREATE TABLE IF NOT EXISTS items (id INTEGER PRIMARY KEY, body TEXT NOT NULL)");
      db.prepare("INSERT INTO items (body) VALUES (?)").run("hello");
      return Response.json(db.prepare("SELECT * FROM items").all());
    } finally {
      db.close();
    }
  },
};
```

Two rules, both because `node:sqlite` in the isolate is a checkout: `open()`
copies the file to a working copy and `close()` writes it back.

- **Open per request, close in `finally`.** The file in `/data` is only
  current after `close()`. A handle left open means a stale file and, if the
  host dies, lost writes.
- **One process owns the file.** Apps run as a single replica; do not open the
  same database from two places at once.

`node:fs` works on `/data` as normal files (`readFileSync`, `writeFileSync`,
`mkdirSync`) — uploads, exports, caches go there. Native drivers
(`better-sqlite3`, `@libsql/client` on a file) do not load in the isolate;
`node:sqlite` is the one that does.

## Space data

Shared, durable state lives in a **Space table**, never in the App. What an
agent writes with `table_write`, a person sees in the Data tab and the App
reads through the bridge — one source, three views. An App that keeps its own
copy in `data_*` drifts from the table the moment someone else writes it.

- Declare every table the App touches in `engenty.tables`. The id is what
  `table_write` answered when the table was created, or what `table_read`
  shows; it is in the table artifact's handle too.
- Read it on mount, and again whenever `onTableChange` fires — the host pushes
  that the moment a row changes, whoever changed it. Never poll.
- Write rows with `table.write`; the App never defines columns. Coercion runs
  against the table's own column definition, so a bad value is refused, not
  stored.
- `data_*` stays what it is: this instance's working state (an unsent form, a
  selection). `config_*` stays the user's preferences. What the App's backend
  owns outright — its own records, not a Space table — goes in `/data`.

```tsx
import { onTableChange, table } from "engenty:bridge";

const TABLE = "<table_id>";
const load = () => table.read(TABLE).then((t) => setRows(t.rows));
useEffect(() => {
  load();
  return onTableChange(({ table_id }) => table_id === TABLE && load());
}, []);
```

## The build-fix loop

Call `app_build` with `{ name, slug, manifest, files }` — it creates (or
reuses) the app, commits the files, builds the commit, and publishes a live
preview artifact into the chat. On failure you get `build_log` verbatim, with
a file and a line:

```
src/App.tsx:12:20: ERROR: Expected "}" but found "1"
```

Fix that file and call `app_build` again with the **same slug**; files you do
not send again stay as they are in the repository. A failed build is recorded
as a `failed` version so its log can be read back; the next successful build
is simply the next version. The frontend is built before the backend is
deployed, so a broken component fails in under a second rather than after a
deploy.

Three failures the log will not spell out for you:

- `app_entry_missing` — `manifest.entry.frontend` names a file you never wrote.
- `app_manifest_invalid` — the manifest failed validation, or names an
  operation that does not exist; the reason is in `build_log`.
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
