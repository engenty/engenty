---
title: Platform settings & credentials
description: Configure platform-wide keys and credentials from the UI, with per-tenant overrides — backed by encrypted database storage with environment variables as the fallback.
---

# Platform settings & credentials

Engenty reads most of its keys and credentials — AI provider keys, connector
OAuth clients, channel bot tokens, web-ingest keys, feature toggles — from
**environment variables**. From v0.1.53 the same values can also be set at
runtime from the UI and stored (encrypted) in the database, so you can stand up
an installation without redeploying to change a key, and let individual tenants
bring their own credentials.

## How resolution works

Every configurable setting is resolved in this order, first hit wins:

1. **Tenant override** — a value set by a tenant admin for their tenant (only
   for settings marked tenant-overridable, e.g. connector OAuth clients).
2. **Platform setting** — a value set by the platform superadmin, applied to the
   whole installation.
3. **Environment variable** — the classic `.env` value (the permanent fallback).
4. **Built-in default** — from the setting's manifest entry, if any.

Because the environment variable is always a fallback, **existing deployments
keep working unchanged** — the database store is purely additive. A zero-config
install (all keys in `.env`) never has to touch the UI.

## Where to set things

| Scope | Who | Where |
| --- | --- | --- |
| Platform-wide | Platform superadmin | **Setup → Platform settings** (`/setup/platform`) |
| Per-tenant override | Tenant admin | **Settings → Integration keys** (`/settings/integration-keys`) |

Each field shows where its effective value currently comes from (tenant,
platform, environment, or default), so you can see at a glance whether a key is
set and which layer is winning.

## What the setup screen tells you

Beyond the editable fields, each group renders the context an operator needs to
fill it in:

- **Provider instructions** from the setting's `obtain.instructions`, with
  `<ENGENTY_API_BASE_URL>` resolved against the running installation — no
  placeholder to substitute by hand.
- **The OAuth redirect URI** for any group whose steps mention one, as the
  literal URL with a copy button. Every connector shares the same callback, and
  a `*.localhost` origin comes with a warning plus the loopback alternative,
  because providers refuse `*.localhost` hosts (see
  [Connections](../dev/connections.md)).
- **Deployment-environment keys** as read-only **Set / Not set** rows in their
  group. These are the keys the UI deliberately cannot write (below) — values
  never leave the server, only their presence. This is what turns a missing
  `CONNECTIONS_TOKEN_ENC_KEY` into something you can see on the page instead of
  a failed OAuth callback and a line in the container log.

After changing a deployment-environment key, restart the services — they are
read at boot.

## Secrets are write-only

Settings marked as secrets (API keys, client secrets, bot tokens) are stored
**AES-256-GCM encrypted** (via the same crypto as the secrets vault, keyed by
`SECRETS_ENC_KEY`, with the ciphertext bound to its row so a value cannot be
copied between settings or tenants). The UI and API **never return a secret's
value** — you can set it, replace it, or clear it, but not read it back. Clearing
a setting removes the database row and falls back to the environment variable.

## What stays environment-only

Bootstrap secrets and anything read before the database is reachable are
**never** DB-configurable and must remain in `.env`:

- `ENGENTY_SECURITY_JWT_SECRET`, `ENGENTY_AI_SERVICE_SECRET` — the AI service credential is read before the process can authenticate to read anything ([service identity](../dev/service-identity.md))
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_DB_URL` (and the `VITE_` variants)
- `CONNECTIONS_TOKEN_ENC_KEY`, `SECRETS_ENC_KEY` — an encryption key cannot live inside the data it encrypts

The manifest enforces this: marking one of these keys as configurable fails the
build.

## Making a module's env var configurable

Module env vars are declared in the module's `engenty.plugin.json` under
`env.vars`. Add a `configurable` field to opt a var into the settings store:

```json
{
  "key": "GOOGLE_OAUTH_CLIENT_SECRET",
  "group": "Connections — Google",
  "secret": true,
  "required": "optional",
  "configurable": "tenant",
  "obtain": { "kind": "provider", "url": "https://console.cloud.google.com/apis/credentials", "instructions": ["Create an OAuth 2.0 Client ID"] }
}
```

- `"platform"` — editable by the superadmin in Setup; overrides env for the whole install.
- `"tenant"` — additionally overridable per tenant (implies platform-configurable).
- omitted / `false` — environment-only (the default).

Set `secret: true` for anything sensitive so it is stored encrypted and rendered
write-only. The `group`, `description`, and `obtain` fields drive how the setting
is presented in the Setup UI.

## Tenant "bring your own" OAuth

Connector OAuth clients (Google, Microsoft, Slack) are `configurable: "tenant"`.
A tenant admin can enter their own OAuth **Client ID / Client Secret** under
Integration keys; the connect flow (and the initial token exchange) then uses the
tenant's client instead of the platform default. Connectors with no client
credentials configured at any layer show **"Needs setup"** in the connections UI
instead of a Connect button that would fail.

> Note: long-lived **token refresh** for a tenant that uses a fully custom OAuth
> client currently falls back to the platform/env client. If you rely on
> per-tenant OAuth clients, keep the platform client configured as well, or track
> the refresh-path enhancement.
