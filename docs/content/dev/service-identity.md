---
title: Service identity
description: How headless work in apps/ai authenticates — the AI service principal, issuing and revoking its durable credential, and how a running process exchanges that credential for a short-lived token.
---

# Service identity

Headless work in `apps/ai` — the routine scheduler, the run substrate,
remote channels — acts as **the AI service principal**. This page covers what
that principal is, how to issue and revoke its credential, and how a running
process turns that credential into a token.

## The shape of it

A service credential is **not** a bearer token. It is a durable secret whose
only power is to be exchanged for a short-lived access token:

```
ENGENTY_AI_SERVICE_SECRET = <credentialId>.<rawSecret>
        │
        │  POST /api/auth/service-token   { credentialId, secret }
        ▼
   engenty access token   principalType: "service"   TTL 15 min
```

That split is the point. A 30–90 day bearer sitting in an env var is a session
anyone who reads the environment can replay for months. A credential is
useless without a round trip to core, which checks it against
`core.service_credential` (sha256, constant-time) and can refuse it the moment
you revoke.

| | Service credential | `engenty auth tokens` API token |
|---|---|---|
| What's in the env var | a secret, not a session | a live bearer |
| Lifetime of the thing you hold | until revoked | 30–90 days |
| Lifetime of what it authenticates with | 15 min | same as the token |
| Revocation | immediate, ≤15 min lag on live tokens | immediate (jti) |
| Audit | every mint logged with a `jti` | creation logged |

## Issuing one

```bash
pnpm engenty service-token create --name ai-service
```

The command needs a **core principal token** — `pnpm engenty auth login`
(device flow). The `--dev` login stores a Supabase user token, which core's
own routes reject with a 401; the CLI says so.

The secret is printed **once** — only its sha256 is stored. Capabilities are
clamped to your own, so you cannot mint a credential more powerful than the
account you ran the command with, and the credential lands in your tenant.

### Locally, `engenty setup` does it

`core.service_credential` lives in the local Supabase, so a `db reset` drops
the row every `.env.local` names and apps/ai boots with `invalid_client`
— scheduler off, routines silent. `pnpm engenty setup` therefore ends by
checking `ENGENTY_AI_SERVICE_SECRET` against the database and, when the row
is missing, revoked or the secret no longer matches, mints a **platform**
credential (`tenant_id NULL`, name `ai-service (local)`, the locked-down AI
set) and rewrites the variable. A live row that lacks part of the current AI
set is replaced the same way. `pnpm engenty service-token ensure-local`
runs the same check by hand; it refuses any `SUPABASE_URL` that is not
loopback. One local stack serves every worktree, so after a reset run it once
and copy the value into each checkout's `.env.local`.

Grant only what the service calls. For the AI service that is
`AI_SERVICE_CAPABILITIES` (`@engenty/plugin-sdk`): `module.*` and
`core.agents.manage` (an agent's `core.agents` identity is provisioned on its
first run). `module.*` is the ceiling, not the grant: `module.read` /
`module.write` cover no module that names its own capabilities
(`module.offers.write`, `module.tasks.*`, `module.connections.*`, …), so a
narrower list 403s a workflow step on the Space's own apps. What a run may
actually reach is the Space's mounts (`agent_access`). If remote channels are
in use, add `core.users.impersonate` — the capability
`POST /api/auth/actor-token` checks before it will mint a user-scoped actor
token:

```bash
pnpm engenty service-token create --name ai-service \
  --capability 'module.*' \
  --capability core.agents.manage \
  --capability core.users.impersonate
```

Omit `--capability` entirely and the credential inherits your full capability
set. Convenient for local dev, wrong for production — it re-creates the
"service is a fake human with everything" problem this design removes.

```bash
pnpm engenty service-token list
pnpm engenty service-token revoke <credentialId>
```

Revoking sets `disabled_at`. Exchanges fail immediately; tokens already minted
stay valid for up to their remaining 15 minutes. That lag is the deliberate
trade for stateless token verification — the same one `core.api_tokens` makes.

## Wiring it into a deployment

Set one variable on the `engenty-ai` service:

```
ENGENTY_AI_SERVICE_SECRET=<credentialId>.<rawSecret>
```

`apps/ai` mints on demand and caches until 2 minutes before expiry, with
concurrent callers sharing one in-flight exchange
(`apps/ai/src/ai/service-credential.ts`). A
scheduled routine firing days after boot rides a token minted seconds earlier,
never the one from boot.

`ENGENTY_AI_SERVICE_SECRET` is the only credential — a static JWT and the
Supabase password grant were removed: both are single-tenant by construction
and the static token dies silently at expiry.

With it unset, the scheduler logs `scheduler disabled — no service
credential configured` at boot and **no routine ever fires**. That message is
the thing to grep for when routines go quiet.

The credential being present is not the same as the scheduler working. Boot
goes: scope resolves (`scheduler service scope resolved`) → workers start →
five seconds later the reconcile turns routine rows and system jobs into Mastra
schedules. A `scheduler reconcile failed` line means the credential is fine but
**nothing is scheduled** — the routines exist in the database and no schedule
backs them. Both lines are worth an alert; the second is the quieter failure,
because everything up to it looks healthy.

## What a service principal can see

A service credential has no row in `auth.users` and no tenant membership.
`/api/users/setup/context` answers for it from a separate path
(`apps/core/src/dal/core-users/workspace.ts`) that
reports `tenantRole: "service"`, `onboarded: true`, and only the credential's
own tenant — it cannot enumerate or switch tenants.

`"service"` is not a membership role; no row in `core.user_tenant_roles` ever
holds it. Every place that branches on tenant role treats an unrecognised role
as least privilege, so a service principal is denied admin surfaces (agent
registry mutation, usage administration) rather than waved through. Its
authority is exactly the capability list baked into its credential.

That last sentence is enforced literally in the operation policy: when the
platform service credential acts **on its own behalf** (no agent in the chain),
high-risk operations are *not* escalated to human approval — the scheduler's
routine reconcile and fires are unattended by definition, so an escalation
would deadlock them, which is exactly how production ran with zero routines
("Approval required" on `routines_create`). The moment an agent rides the same
token (headless runs forward `x-engenty-agent-id`), the escalation
returns: that is the durable-approvals lane, and it is keyed on the agent, not
the bearer.

**When a headless run needs to act *as a user*** — a remote-channel turn, for
instance — the answer is not a broader service credential. It is an **actor
token**: `POST /api/auth/actor-token` mints a short-lived token carrying that
user's own grants, with the delegation recorded in the claims and an audit
event on every mint. See [remote channels](./remote-channels.md).

## Auditing

Every exchange writes `auth.service_token_minted` with the credential id, its
capabilities, and the minted token's `jti`; every rejection writes
`auth.service_token_rejected` with a reason (`unknown`, `disabled`,
`bad_secret`). Because `sub` on the minted token is the credential id, an
action in the audit log traces back to a specific credential rather than to
"the service".
