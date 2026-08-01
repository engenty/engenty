---
title: Connections framework
description: Central external-service connections — OAuth, per-action permissions, approvals, and how to build a connector module.
---

# Connections

The connections framework is the one central mechanism for connecting external
services (Gmail, Google Drive, Outlook, Slack, …) to Engenty. It owns OAuth,
token custody, and a per-action permission model — connector modules only
*declare* a service's actions and never touch tokens or approval logic.

Working design notes live in `docs/wip/connections-framework.md`; this page is
the stable developer reference.

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

## The permission model — three axes

Effective policy for one call = the intersection of three axes, resolved in
`@engenty/connections-sdk` (`resolveConnectionActionPolicy`):

1. **Action policy** — `allow | ask | deny` per action. Resolution order:
   action-id override → group override (`group:<name>`) → group default
   (`read → allow`, `write`/`destructive → ask`). Overrides are stored per
   connection in `module_connections.connection_action_policies` and edited in
   the UI matrix (Settings → Connections).
2. **Sharing** — `personal` (owner only; anyone else is denied) or `org`
   (tenant-wide). Org connections can cap non-owners with
   `non_owner_max_group` (e.g. others get `read` only). Group-based sharing is
   deferred until the auth model has groups.
3. **Run context** — per connection `autonomous_mode: off | read_only | full`
   clamps what agent/service principals may do when no user is present.

### Where each axis is enforced

There is exactly **one authoritative gate**: an async profile policy the
connections module registers in core (`registerProfilePolicy`), evaluated on
every operation invoke:

- `deny` outcomes (personal/not-owner, non-owner cap, autonomous clamps,
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
  owner (org: tenant admins) decides in Admin → Connections — "Approve always"
  also writes an `allow` override so the retry passes.
- `allow` overrides → the policy returns an explicit allow, which bypasses
  core's default approval requirement for non-user principals.

Defense in depth: the connector runtime re-checks the policy before executing,
so a route that skipped the policy layer still cannot run a denied action.

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
[Platform settings](/setup/platform-settings)). This lets a tenant bring their
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
connector) — and are forced to `personal` sharing.

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
(`module_local_files.bridge_requests`): the always-mounted bridge component (a
`backgroundComponents` UI contribution) heartbeats liveness, claims pending
requests, executes them against the handle, and posts results back. When no
tab holding the handle is online, actions fail fast with
`local_files_browser_offline`; a revoked handle flips the connection to
`error` until the user re-grants it (one click — Chromium often returns
`prompt` after a restart, which is expected, not a bug).

## Operations reference

| Operation | Purpose |
| --- | --- |
| `connections_catalog` | Connectors + caller's connections + policy matrix (drives the UI) |
| `connections_update_settings` | Sharing, autonomous mode, non-owner cap, display name |
| `connections_set_policy` | Set/clear an `allow\|ask\|deny` override (action id or `group:<g>`) |
| `connections_disconnect` | Delete a connection (tokens destroyed) |
| `connections_approvals_list` / `connections_approvals_decide` | Autonomous approval queue |
| `connections_granted_operations` | Durably-allowed operation ids, merged into chat approval grants |

## Gotchas

- **Cross-plugin singletons don't work.** Core loads each plugin through its
  own jiti instance (fresh module cache), so the connector registry lives on
  `globalThis` under `Symbol.for("engenty.connections.connector-registry")`.
  Any future cross-module registry needs the same treatment.
- **New schema ⇒ restart Supabase.** PostgREST only reads `[api].schemas` at
  start. The failure signature is
  `connections repo: Invalid schema: module_connections`; fix with a plain
  `supabase stop` + `start` (never `--no-backup`).
- **Profile policies may be async** since this framework landed
  (`evaluatePolicy` awaits them) — keep them fast; they run on every invoke.
- **Delegated agent principals resolve to the org connection.** Personal
  connections match on the principal id, which for autonomous/delegated runs
  is the service/agent principal — mapping through the delegation chain is a
  known follow-up, as is automatic task re-dispatch when an approval is
  granted, and the MCP connector kind.
