---
name: engenty-bridge
title: The engenty bridge
description: How an App talks to engenty and to its own store — the bridge tools, the manifest allow-list, and why an App never holds a credential.
allowed-tools: engenty_tools_search engenty_tool_execute
---

# The engenty bridge

An App has no credentials. It never receives a token, a key or a session. Its
one route to anything outside its own frame is the bridge, and the bridge only
ever does what the App's manifest declared.

Apps are tenant-shared artifacts. Activation, artifact placement, and callable
module operations are constrained by the **active Space**. App Coder cannot read
tenant data directly — it only authors the App. The bridge's `engenty(operationId, input)`
calls still obey that Space's operation policy.

## From a bundled App

If `entry.frontend` names sources (`src/main.tsx`), import the bridge instead
of building it. It is the same protocol below, written once and audited:

```tsx
import { action, config, data, engenty, notify, onTableChange, table } from "engenty:bridge";

const threads = await engenty("inbox_threads_list", { limit: 20 });
const games = await table.read("<table_id>");
await table.write("<table_id>", { update: [{ row_id: games.rows[0].id, values: { turn: "o" } }] });
onTableChange(({ table_id }) => { /* re-read */ });
const saved = await data.get("draft");
await data.set("draft", { note: "in progress" });
const currency = await config.get("currency");
const result = await action("collect", { amount: 12.5 });
notify("Added the receipt.");
```

Everything it exports: `call(name, args)` for any bridge tool,
`engenty(operationId, input)`, `action(id, input)`, the `data` and `config`
stores (`get` / `set` / `list` / `delete`), `table.read(id, { limit?, offset? })`
and `table.write(id, { insert?, update?, delete? })` for declared Space tables,
`notify(text)`, `openLink(url)`, `onSession(cb)` for the host's initial push
and `onTableChange(cb)` for a declared table's changes. Every call returns a
promise.

## From a single-document App

The frame speaks MCP JSON-RPC over `postMessage`. In practice:

```js
let nextId = 1;
const pending = new Map();

window.addEventListener("message", (event) => {
  const msg = event.data;
  if (!msg || msg.jsonrpc !== "2.0" || msg.id === undefined) return;
  const entry = pending.get(msg.id);
  if (!entry) return;
  pending.delete(msg.id);
  msg.error ? entry.reject(new Error(msg.error.message)) : entry.resolve(msg.result);
});

function call(name, args = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    parent.postMessage(
      { jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } },
      "*",
    );
  });
}

// Announce yourself once, or the host will not push initial data.
parent.postMessage(
  { jsonrpc: "2.0", method: "ui/notifications/initialized" },
  "*",
);
```

## The bridge tools

| Tool | Arguments | What it does |
| --- | --- | --- |
| `engenty_call` | `{ operation_id, input }` | Invoke an engenty operation **as the viewing user** |
| `app_action` | `{ action, input }` | Invoke one of your backend's declared actions |
| `data_get` | `{ key }` | Read one key from the working store |
| `data_set` | `{ key, value }` | Write one key |
| `data_list` | `{ prefix? }` | List keys in this session |
| `data_delete` | `{ key }` | Delete one key |
| `config_get` | `{ key }` | Read one config key |
| `config_set` | `{ key, value }` | Write one config key |
| `config_list` | `{ prefix? }` | List config keys |
| `config_delete` | `{ key }` | Delete one config key |
| `table_read` | `{ table_id, limit?, offset? }` | Read a declared Space table: `{ columns, rows: [{ id, cells }], title }` |
| `table_write` | `{ table_id, insert?, update?, delete? }` | Write rows into a declared Space table (same shape as the agent's `table_write` tool) |

Anything else is rejected. There is no `shell`, no `fetch`, no `sql`.

The bridge is the *frontend's* reach. The backend has one thing more: `/data`,
its own directory with `node:sqlite` — the App's records live there, not in
`data_*`. See "The backend" in the app-authoring skill.

## Two stores, and picking the right one

They look identical and they are not interchangeable:

| | `data_*` | `config_*` |
| --- | --- | --- |
| Scope | **this session** — one artifact instance | this **user**, or the tenant |
| Lifetime | dies with the instance | outlives every instance |
| Use for | the work in progress: a half-filled form, a draft, a running total | what the App should remember: a preference, a default, a saved filter |

Open the same App twice and you get two `data_*` stores and one `config_*`. So
a draft expense report belongs in `data_*`; "this user prefers EUR" belongs in
`config_*`. Putting working state in `config_*` means two open instances fight
over the same keys.

Both must be declared, or every call returns `apps.storageNotDeclared`:

```jsonc
"storage": { "data": true, "config": true }
```

`config_set` always writes **that user's own value**. You cannot set a
tenant-wide default from inside an App — that is an admin action. Reads fall
back to the tenant default when the user has no value of their own, so
`config_get` is how you read a default an admin set for everyone.

## Space tables — the third store

| | `data_*` | `config_*` | `table_*` |
| --- | --- | --- | --- |
| Scope | this session | this user, or the tenant | the **Space** — shared with every agent and person in it |
| Written by | this instance | this instance | agents (`table_write`), people (Data tab), Apps |
| Use for | work in progress | preferences | the state itself: a board, a queue, a ledger |

A table must be declared by id in `manifest.engenty.tables`; `apps.tableNotDeclared`
otherwise, and the store is never asked. Rows only — the column definition
belongs to whoever created the table, and a value the column cannot hold comes
back as `apps.invalidRowValues` instead of landing.

The host follows every declared table and pushes `ui/notifications/table-changed`
with `{ table_id }` on any change. Re-read on it; the push carries no rows. A
single-document App listens for that method on `window` exactly like
`ui/notifications/tool-result`.

## What the allow-list actually means

`engenty_call` intersects `operation_id` with `manifest.engenty.operations`
before anything happens. An operation you did not declare returns
`apps.operationNotDeclared` and engenty is never asked. Adding an operation
means a new version and a new human approval — which is the point: the
manifest is the thing a person reads before saying yes.

The call then runs **with the viewing user's own identity**. Your App can
never do more than the person using it. If they cannot read invoices, neither
can your App while they are looking at it.

## External services (connections)

Connector actions — Gmail, HubSpot, Slack, GitHub, whatever the tenant has
connected — are **ordinary engenty operations**. There is no second mechanism:
discover them, declare them, call them through `engenty_call` like anything
else.

- **Discover** with `connections_catalog`: it lists every connector with its
  actions, and each action carries the `operation_id` you declare (e.g.
  `gmail_messages_list`, `hubspot_contact_create`). Never guess an id.
- **Declare** each one in `manifest.engenty.operations`. Same rule as always:
  undeclared means non-existent.
- **Read actions** run silently under the viewing user's existing connection.
- **Write actions** are approval-gated: expect the `pending_approval` result
  (next section) and handle it — that is the product working, not an error.

Two failure modes specific to connections, and what to render for each:

- **No connection.** The tenant never connected the service, or the user has
  no account on it. The call fails; do not retry. Render "connect
  <service> under Settings → Connections" and stop. Requesting a connection
  is a person's act — an App never initiates one.
- **`connection_ambiguous`.** The user has several accounts on the connector
  (two Gmail addresses, say). Every connector action takes an optional
  `account` parameter; declare `connections_list_accounts` too, offer the
  accounts it returns, and pass the chosen one back on the retry.

Declaring a connector operation is a bigger ask than declaring `tasks_list` —
it reaches **outside** the tenant. The approving human will read it that way,
so the manifest description should say plainly what leaves (e.g. "emails a
weekly summary of open tasks to the user's own address").

## Approval-gated operations

Some operations require human approval. When one does, the call comes back
with an approval-pending result rather than data. Handle it:

```js
const result = await call("engenty_call", {
  operation_id: "invoices_create",
  input: draft,
});
if (result?.status === "pending_approval") {
  render("Waiting for approval — you can close this and come back.");
  return;
}
```

Do not retry in a loop. Do not present the pending state as an error. The user
will approve it from their inbox and the next call will succeed.

## Other host methods

- `ui/notifications/message` with `{ text }` — say something into the
  conversation. Text only, capped. Use it to report what you finished.
- `ui/open-link` with `{ url }` — open an `http(s)` link in a new tab.
- `ui/notifications/table-changed` with `{ table_id }` — **from the host**: a
  declared Space table changed; read it again.
- `ui/notifications/size-changed` with `{ height }` — only honoured in the
  chat transcript; in the artifact pane the host owns the height.

## From the backend

The backend receives a **capability handle** on each invocation, as the
`x-engenty-capability` header. It is opaque, it expires in minutes, it is
scoped to one app and one session, and it is worthless anywhere except
engenty's own proxy. Pass it back on calls to
`POST /ai/apps/<app_id>/call`; do not log it, store it or return it in a
response body.

The handle can only ever narrow what the manifest already allows. It is not a
token, and there is no way to exchange it for one.
