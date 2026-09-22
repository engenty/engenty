---
title: Connections framework
description: Central external-service connections — OAuth, per-action permissions, approvals, and how to build a connector module.
---

# Connections

The connections framework is the one central mechanism for connecting external
services (Gmail, Google Drive, Outlook, Slack, …) to Engenty. It owns OAuth,
token custody, and a per-action permission model — connector modules only
*declare* a service's actions and never touch tokens or approval logic.

Working design notes in `docs/wip/connections-framework.md` predate the
space/agent attachment model; this page is the stable developer reference.

## Architecture

```
packages/connections-sdk                 @engenty/connections-sdk — shared types + runtime
modules/connections                      framework module: schema, OAuth routes,
                                         management operations, policy gate, UI
modules/connections/providers/google       connectors: google-gmail, google-drive,
                                           google-calendar, google-contacts
modules/connections/providers/microsoft    connectors: microsoft-outlook, microsoft-onedrive
modules/connections/providers/slack        connector: slack
modules/connections/providers/hubspot      connector: hubspot (api_key / private app)
modules/connections/providers/s3           connector: s3 (api_key auth, files capability)
modules/connections/providers/local-files  connector: local-files (browser auth, FSA bridge)
modules/connections/providers/external     tenant-scoped imported OpenAPI/MCP connectors
```

Connector providers are **nested workspace plugins** under
`modules/connections/providers/*`. Each is its own package (`@engenty/connections-<provider>`)
with its own `engenty.plugin.json` — the manifest `id` (e.g. `connections-google`)
is the slug used in the root `engenty.plugins` map and for enable/disable.
Nesting is discovered by convention (only the literal `providers/` segment is
scanned one level deeper); a nested provider **must** declare an explicit `id`
and its `package.json` name must equal `@engenty/<id>`.

A **connector** is a `ConnectorDefinition`: an OAuth2 config plus a list of
**actions**. Each action is projected as a regular module operation
(`<toolPrefix>_<actionId>`, e.g. `gmail_search_threads`), so everything
downstream — the API catalog, agent tools, Code Mode `external_*` stubs, the
approval gate, audit — works unchanged.

**Tokens never leave the app plane.** They are AES-256-GCM encrypted at rest
(`CONNECTIONS_TOKEN_ENC_KEY`) in `module_connections.connections`, the
encrypted columns are excluded from the `authenticated` column grant, and the
only decryption path is the repo's `withFreshAccessToken` helper (which also
transparently refreshes). Agents — chat, task jobs, and sandboxed Code Mode
programs — call tools; the provider request is made host-side in core.

## Action groups and the static contract

Every action belongs to a group, and the group fixes the operation contract:

| Group         | Contract                                            | Effect |
| ------------- | --------------------------------------------------- | ------ |
| `read`        | `idempotent: true`, risk `low`, no approval         | `readOnly` ⇒ callable from Code Mode |
| `write`       | risk `medium`, `requiresApproval: true`             | chat suspends for approval |
| `destructive` | risk `high`, `requiresApproval: true`               | send / delete / trash |

`readOnly` is *derived* (`idempotent && low && !requiresApproval` — see
`buildOperationContracts` in core), so classifying an action honestly is what
makes it available (or not) to Code Mode.

## The permission model — reach, action policy, run context

A **plugin** is a connector definition (builtin Gmail, or a tenant-imported
OpenAPI/MCP surface). A **connection** is one authenticated account on that
plugin (`module_connections.connections`). `owner_user_id` is who signed in.
Where the account may be used is a separate attachment, not a personal/org
toggle.

Effective policy for one call is **reach first**, then action policy, then
unattended clamps. Connector prefixes and account candidates are both a
**union**, not an intersection:

```mermaid
flowchart TD
  plugin[Plugin definition]
  plugin --> spacePlugin["Space plugin mount<br/>resource_type=plugin"]
  plugin --> connUuid["Space account mount<br/>resource_type=connection"]
  plugin --> allSpaces["Account all_spaces"]
  plugin --> grant["connection_agent_grants"]
  spacePlugin --> prefixes[Connector prefixes]
  connUuid --> prefixes
  connUuid --> accounts[Account candidates]
  allSpaces --> prefixes
  allSpaces --> accounts
  grant --> prefixes
  grant --> accounts
```

1. **Account reach** — decided *before* `resolveConnectionActionPolicy` (see
   `isAccountReachableInRun` and `connectorPrefixesForAgent` in
   `@engenty/connections-sdk`). Distinguish plugin enablement (the *service*
   is on this space) from account candidates (which *mailbox*):

   | Attachment | Stored as | What it adds |
   | --- | --- | --- |
   | Space plugin enablement | `core.space_mount` `resource_type = 'plugin'`, `resource_key` = connector id | Connector prefix only. The space enabled this service with no account yet ("added, needs authentication"). |
   | Space-shared account | `core.space_mount` `resource_type = 'connection'`, `resource_key` = account UUID | This mailbox is shared with **this** space: prefix + account. Every specialist there may use it, and the copilot may while the person is standing in that space. |
   | All spaces | `module_connections.connections.all_spaces` | Prefix + account in every space of the tenant and on `{kind:"global"}` agent runs. One flag, not a mount row per space. |
   | Agent grant | `module_connections.connection_agent_grants` | Prefix + account for **that agent**, even when the standing space did not mount it. |

   An agent's preferred plugin list (`ai.engenty_ai_agents.connector_ids`)
   further filters *which connectors* the agent may call. Empty = every plugin
   enabled on the active space (plus all-spaces prefixes). Non-empty =
   intersection of that list with the space/all-spaces set, **then** the
   agent's granted-account prefixes are always re-added.

   `sharing` (`personal` \| `org`) and `non_owner_max_group` remain on the
   row as leftover columns. Access, RLS, and `resolveConnectionActionPolicy`
   do not read them. `connection_personal_not_owner` and the org non-owner cap
   are gone.

   That attachment model is **not** the personal Space (`/s/me`). A personal
   space is `core.spaces.owner_user_id IS NOT NULL` (private, no members).
   `/s/me` resolves it. Old `sharing=personal` meant "only the authenticating
   user may use this account anywhere"; that flag no longer authorizes
   anything.

2. **Action policy** — `allow | ask | deny` per action, resolved in
   `resolveConnectionActionPolicy`. Resolution order: action-id override →
   group override (`group:<name>`) → group default (`read → allow`,
   `write`/`destructive → ask`). Overrides are stored per connection in
   `module_connections.connection_action_policies` and edited in the UI
   matrix (Settings → Connections).

3. **Run context** — per connection `autonomous_mode: off | read_only | full`
   clamps what agent/service principals may do when no user is present. The
   space's `agent_access` on a connection mount (`none | read | write`) is the
   other half of that clamp for unattended runs in that space: the lower of
   the two wins. A space that never set a level falls through to the account
   setting alone.

RLS for authenticated members: accounts they own, accounts flagged
`all_spaces`, and accounts mounted on a space they can enter. Encrypted token
columns stay off the authenticated grant.

### Where each axis is enforced

There is exactly **one authoritative gate**: an async profile policy the
connections module registers in core (`registerProfilePolicy`), evaluated on
every operation invoke:

- `deny` outcomes (account not reachable in this run, autonomous clamps,
  user-configured deny) → HTTP 403 for *every* principal type.
- `ask` for **user principals** → the policy returns `null`; the AI-side
  pre-gate owns the chat UX (native tool-level suspend/resume, invoker
  approves). Durable "always allow" from the connections UI is merged into the
  run's approval grants at run start (`connections_granted_operations`), so
  the Approve card is skipped for those.
- `ask` for **autonomous principals** (task jobs, triggers) → the policy
  records a durable row in `module_connections.approval_requests`, and core
  returns 202 `approval_required`. Task jobs run with the AI-side
  `approvalPolicy: "defer"`, which passes gated calls through to core and
  shapes the 202 into a structured `approval_pending` tool result plus a
  tenant-inbox notification (`connection_approval_requested`). The connection
  owner (all-spaces: owner or tenant admin) decides in Admin → Connections —
  "Approve always" also writes an `allow` override so the retry passes.
- `allow` overrides → the policy returns an explicit allow, which bypasses
  core's default approval requirement for non-user principals.

Defense in depth: the connector runtime re-checks reach and policy before
executing, so a route that skipped the policy layer still cannot run a denied
action. Agent grants are resolved from `x-engenty-agent-id` before candidate
listing, so a copilot-only mailbox is a candidate inside a space that never
mounted it.

## Building a connector module

A connector module is a nested workspace plugin that declares one or more
connectors. See `modules/connections/providers/slack` for the smallest complete
example.

1. **Scaffold** `modules/connections/providers/<provider>/` with
   `engenty.plugin.json` (`kind: "module"`, `capabilities.operations: true`, an
   explicit `id` of `connections-<provider>`), `package.json` (name
   `@engenty/connections-<provider>`, depends on `@engenty/connections-sdk`,
   `tsconfig.json` extending `../../../../tsconfig.base.json`), and register the
   slug in the root `package.json` `engenty.plugins` map. `pnpm engenty plugins
   create` still scaffolds flat `modules/<slug>/` only, so nested provider
   scaffolds are currently manual.
2. **Define the connector**:

```ts
import { defineConnector, registerConnectorModule } from "@engenty/connections-sdk";
import { z } from "zod";

export const myConnector = defineConnector({
  id: "my-service",            // kebab-case, unique
  moduleId: "connections-my-service",
  toolPrefix: "mysvc",         // operations become mysvc_<action>
  name: "My Service",
  description: "…",
  icon: "🔌",                  // emoji renders; anything else falls back to a glyph
  auth: {
    kind: "oauth2",
    oauth2: {
      authUrl: "https://…/authorize",
      tokenUrl: "https://…/token",
      clientIdEnv: "MYSVC_OAUTH_CLIENT_ID",
      clientSecretEnv: "MYSVC_OAUTH_CLIENT_SECRET",
      baseScopes: ["openid", "email"],
      resolveAccount: async (token, fetchImpl) => ({ label: "…" }),
    },
  },
  actions: [
    {
      id: "search_items",
      group: "read",
      summary: "Search items",
      description: "…",
      providerScopes: ["items.readonly"],
      inputSchema: z.object({
        query: z.string().describe("Search query"),
      }),
      handler: async (input, ctx) => {
        const res = await ctx.fetchImpl("https://api…/search", {
          headers: { authorization: `Bearer ${ctx.accessToken}` },
        });
        if (!res.ok) throw new Error(`mysvc_api_error (${res.status})`);
        return /* compact mapped JSON, not the raw payload */;
      },
    },
  ],
});
```

3. **Register** in `src/plugin.ts`:

```ts
const plugin: EngentyPluginFactory = (engenty) => {
  registerConnectorModule(engenty, myConnector);
};
export default plugin;
```

4. **Document env vars** via the `env` block in `engenty.plugin.json` (the
   `engenty env` helper discovers it), then run `pnpm env:example:write`.

That's everything — OAuth routes, the settings/admin UI, policy enforcement,
approvals, and token refresh come from the framework. No migration is needed
unless the module stores its own data.

Handler conventions: use `ctx.accessToken` + `ctx.fetchImpl`, throw
`<provider>_api_error (<status>): <excerpt>` on failure, `.describe()` every
input field (it becomes the tool's JSON schema), cap list sizes and long
bodies, and return mapped, compact JSON.

## OAuth setup

The generic flow is
`GET /api/connections/:connectorId/connect` → `{ authUrl }` → provider →
`GET /api/connections/oauth/callback` (public, nonce-validated, 10 min TTL).
Register `<ENGENTY_API_BASE_URL>/api/connections/oauth/callback` as the
redirect URI with each provider (override with `CONNECTIONS_REDIRECT_URI`
behind a proxy). Required env per provider is documented in `.env.example`
(Google Cloud Console, Azure App registrations, api.slack.com).

Every connector shares that one callback route, so a provider only ever needs
this single redirect URI — not one per connector. **Setup → Platform settings**
resolves the placeholder against the running installation and shows the literal
URL with a copy button next to each OAuth group, so you do not have to assemble
it by hand. The app origin on its own is not a valid redirect URI, though Google
additionally wants it under "Authorized JavaScript origins".

**Local development.** Providers reject `*.localhost` redirect hosts — only
`localhost` and `127.0.0.1` with a port are accepted, so the Portless origin
(`https://engenty.localhost`) cannot be registered with Google. Point
`CONNECTIONS_REDIRECT_URI` at core's loopback origin instead and register that
exact URL:

```bash
CONNECTIONS_REDIRECT_URI=http://127.0.0.1:8787/api/connections/oauth/callback
```

The callback lands on core directly and then redirects back to
`ENGENTY_UI_BASE_URL`, so the browser flow is unchanged. Worktrees run on their
own port slot (8797, 8807, …) and each needs its own value plus its own entry in
the provider console — the setup screen shows the loopback URL for the checkout
you are looking at, derived from `ENGENTY_CORE_BASE_URL`.

**Client-credential resolution.** A connector's `clientIdEnv` / `clientSecretEnv`
are resolved through the settings store, not just `process.env`: a tenant
override → a platform setting → the environment variable (see
[Platform settings](/docs/setup/platform-settings)). This lets a tenant bring their
own OAuth app from the UI without redeploying. The catalog's per-connector
`configured` flag reflects whether client credentials resolve at any layer;
`hasOAuth2ClientCredentials()` computes it and the UI shows "Needs setup" when
false. The imported-connectors (`external`) provider still supplies its own
`resolveClientCredentials` and takes precedence over both.

Note for Slack-style providers: user scopes ride in `extraAuthParams`
(`user_scope`) because the standard `scope` param would request bot scopes;
the token parser already handles the nested `authed_user` response.

## Auth kinds

`ConnectorDefinition.auth` is a discriminated union:

| Kind | Credential | Connect flow | `ctx.accessToken` |
| --- | --- | --- | --- |
| `oauth2` | refreshable bearer tokens | provider redirect (above) | fresh bearer token |
| `api_key` | encrypted credentials JSON | generic form dialog → `POST /api/connections/:id/connect_credentials` | decrypted credentials JSON |
| `browser` | none server-side | bespoke UI the connector registers (e.g. a folder picker) | `""` |

`api_key` connectors declare `auth.apiKey.fields` (rendered by the shared
credentials dialog; secrets as password inputs, never echoed back) and a
`verify()` that validates against the provider and resolves the account label.
Credentials are stored AES-256-GCM encrypted in the same token column as OAuth
tokens with `token_expires_at = null`, so they flow through the DAL unchanged
and are never refreshed. `browser` connectors hold no server-side secret —
their action handlers bridge into the user's browser (see the local-files
connector) — and cannot be flagged `all_spaces` (they are device-local).

## The files capability

A connector may declare `files?: ConnectorFilesCapability` (sibling of
`stream`): normalized read-only file access — `list`/`read`/`stat` and optional
`search` over provider-native refs (Drive fileIds, Graph itemIds, S3 keys,
local paths). `defineConnector` synthesizes `files_list` / `files_read` /
`files_stat` / `files_search` as regular `read` actions from it, so policies,
approvals, audit, and agent tools (`gdrive_files_list`, `s3_files_read`, …)
all apply with zero extra gate code. `read` results are discriminated
(`url` presigned passthrough | `base64` proxied bytes | `text`) so each
provider returns its cheapest shape.

Modules consume the capability through the connections module client
(`listFileSources`, `filesList`, `filesRead`, `filesStat`) — the files module
uses exactly this to mount connected folders into file spaces ("Connect
folder" in any file manager, including the projects Files tab). Mounts are
`module_files.file_folders` rows carrying `connection_id` +
`source_folder_id`; everything beneath a mount is a virtual, read-only
projection (`cnx:<connection>:<base64url-ref>` node ids — no rows).

## Browser connectors: local-files

`modules/connections/providers/local-files` grants agents read access to local
directories the user picks in the browser (File System Access API,
Chromium-only). Each granted directory is one `browser`-auth connection; the
handle persists in IndexedDB per browser profile. Server-side actions
round-trip into the tab over a durable bridge
(`module_local_files.bridge_requests`): files surfaces (File Manager, the
Data-tree folder listing, the connect-folder dialog) heartbeat liveness and
claim pending requests only while that folder UI is on screen. Chat and Work
do not poll. When no tab is showing the folder, actions fail fast with
`local_files_browser_offline`; a revoked handle flips the connection to
`error` until the user re-grants it (one click — Chromium often returns
`prompt` after a restart, which is expected, not a bug).

## Imported connectors: OpenAPI and MCP

Two different MCP surfaces exist. Do not mix them up:

| | First-party MCP resource server | Imported MCP / OpenAPI plugins |
| --- | --- | --- |
| Direction | **Outbound.** Engenty exposes itself to external MCP clients. | **Inbound.** A remote spec or MCP server becomes a connector *inside* Engenty. |
| Where | Core `GET`/`POST` `/mcp` (`packages/mcp-server`, `ENGENTY_MCP_RESOURCE_URL`) | `modules/connections/providers/external` |
| What the agent sees | Not a connector. External tools talk *to* Engenty. | Ordinary `<toolPrefix>_<actionId>` operations, same as Gmail. |

This section is inbound imports only.

Not every connector is hand-written. Builtins (Gmail, Drive, Outlook, Slack,
GitHub, HubSpot, S3, local-files, …) are **code**, always listed, and have no
`tenant_id`. Everything else is a tenant-scoped **import**: an admin pulls an
OpenAPI spec or MCP server (search via [integrations.sh](https://integrations.sh)
`/surface`, or paste a URL) and the external provider materializes an ordinary
`ConnectorDefinition`. Rows live in
`module_external_connectors.imported_connectors` with a required `tenant_id`
(primary key `(tenant_id, id)`). The process-global registry keys them
`${tenantId}::${id}` so one tenant's import is not listed or executed as
another's. Builtins stay `id` with no tenant prefix.

The catalog a tenant sees is **builtins ∪ that tenant's imports**. An import
is sticky across spaces of that tenant; it is not enabled on a space until
someone mounts the plugin or an account. `/setup/connectors` is the admin
console over the tenant import API, not a platform-wide catalog.

What an import produces is an ordinary connector — so agent tools, Space
plugin/account mounts, policies, approvals and audit all apply unchanged. An
agent never learns that a tool came from an MCP server; it calls
`<toolPrefix>_<actionId>` like any other operation.

The pipeline is: fetch the source → apply the registry's spec overrides →
normalize → map auth → store. Either half refuses rather than half-works: a
surface that needs a URL variable, an environment-sourced header, or auth that
cannot be expressed never becomes a connector.

| | OpenAPI | MCP |
| --- | --- | --- |
| Source | spec URL | server endpoint |
| Actions from | paths × methods | `tools/list` |
| Group | HTTP method + path hints (`GET`→`read`, `DELETE`→`destructive`, ambiguous→`write`) | `readOnlyHint`→`read`, `destructiveHint`→`destructive`, no hint→`write` |
| Transport | HTTP | streamable HTTP, SSE when the registry declares it or the handshake is rejected |

Both cap at 500 actions per connector. MCP annotations are **advisory**: no
hint never yields `read`, so an unannotated tool requires approval.

Two properties worth keeping:

- **Every outbound call goes through a guarded fetch.** URLs here come from a
  registry, an admin-pasted field, or a stored record — attacker-influenceable
  in all three cases — so the host is DNS-resolved and private/link-local ranges
  are blocked before the first request and again on each redirect. An MCP
  endpoint cannot be pointed at a private address.
- **The MCP SDK's own OAuth provider is deliberately unused.** Grants live in the
  connections store; this module only renders the resolved token into
  headers. Every call opens a client and releases it in `finally`, terminating
  the streamable session, so a failed `tools/call` leaks no server-side session.

## Connectors in a Space, on an agent, and on the copilot river

A Space still answers two questions, but the prefix set is the **union**
described above — plugin enablement, connection UUID mounts, `all_spaces`, and
the acting agent's grants — not "mounted account ids ∩ grants":

| Question | Checked against |
| --- | --- |
| May this run use Gmail at all? | the run's connector **tool prefixes** (`space-gate.ts`, filled by `enrichToolsSpaceForAgentRun`) |
| Which mailbox? | mounted connection ids ∪ `all_spaces` ∪ `connection_agent_grants` (`isAccountReachableInRun`) |

Prefix matching is longest-match-wins, because ids are minted as
`<toolPrefix>_<actionId>` and a connector whose prefix prefixes another's
(`g` vs `gmail`) must not swallow it. Discovery is filtered by the same rule —
an unavailable connector's operations are hidden from `engenty_tools_search`
and refused by `engenty_tool_execute`; hiding alone would be decoration,
refusing alone would waste a turn. See the
Spaces runtime contract (`docs/agent/spaces-runtime.md`).

**Copilot (the river).** `engenty.copilot` is one private conversation per
person (`POST /ai/threads/dm` with no `space_id`). A turn is placed by
**where the person is standing** (`route_context`), not by a thread-owned
space. Connector reach for that turn is the standing space's enabled plugins
and shared accounts, **plus** accounts granted to the copilot (and any
`all_spaces` accounts). There is no per-space copilot thread to hang plugins
on. Outside `/s/…` live chat and assemble agree on `{kind:"global"}`: grants
plus all-spaces only — not a silent fallback to Company or to `/s/me`.

A verified personal-space owner stand-in (`resolveVerifiedSpaceOwnerForRun`)
still exists for unattended runs *in* `/s/me` (approval addressing and the
autonomy ceiling). It is not a replacement for `sharing`, and it does not add
connector reach.

## Operations reference

| Operation | Purpose |
| --- | --- |
| `connections_catalog` | Connectors + caller's connections + policy matrix (drives the UI) |
| `connections_update_settings` | `all_spaces`, autonomous mode, display name. `sharing` / `non_owner_max_group` are still accepted and stored; access does not read them. |
| `connections_set_policy` | Set/clear an `allow\|ask\|deny` override (action id or `group:<g>`) |
| `connections_disconnect` | Delete a connection (tokens destroyed) |
| `connections_approvals_list` / `connections_approvals_decide` | Autonomous approval queue |
| `connections_granted_operations` | Durably-allowed operation ids, merged into chat approval grants |
| `connections_agent_grants_list` / `connections_agent_grant_set` | Accounts this agent may use even when the standing space did not mount them |

## Gotchas

- **Cross-plugin singletons don't work.** Core loads each plugin through its
  own jiti instance (fresh module cache), so the connector registry lives on
  `globalThis` under `Symbol.for("engenty.connections.connector-registry")`.
  Imported definitions are keyed `${tenantId}::${id}`; builtins use `id`.
  Any future cross-module registry needs the same treatment.
- **New schema ⇒ restart Supabase.** PostgREST only reads `[api].schemas` at
  start. The failure signature is
  `connections repo: Invalid schema: module_connections`; fix with a plain
  `supabase stop` + `start` (never `--no-backup`).
- **Profile policies may be async** since this framework landed
  (`evaluatePolicy` awaits them) — keep them fast; they run on every invoke.
- **Reach is a union.** An agent grant that still had to intersect space
  mounts would make "enable on copilot" vanish the moment the person opened
  Marketing. Grants, `all_spaces`, and space mounts are `OR`. A non-empty
  `connector_ids` list on the agent is the only intersection, and grants are
  re-added after it.
- **Automatic task re-dispatch when an approval is granted** is still a
  follow-up. Approvals address the connection owner (or a tenant admin on an
  all-spaces account).
