# Plan — Secrets Vault + Services module (`secrets`)

**Status:** draft for review · Branch: `feat/secrets-vault` (worktree `engenty-pro-secrets-vault`) · 2026-07-16
**Scope repo:** engenty-pro (closed). One cross-repo dependency to the public `engenty/engenty` is called out in §9.

A human-facing **secrets/password manager** for a tenant's **clients**, plus a **paid-services (subscription) registry** — ported in *spirit* from `engrdian`, but rebuilt on engenty's server-side-authorized, RLS-per-tenant architecture instead of engrdian's client-side-encrypted, server-blind vault. Agents can be granted **read** access to specific secrets, reusing the existing capability + goal-grant machinery.

This doc is deliberately implementation-heavy so we hit the roadblocks (§9) before writing throwaway code.

---

## 0. Why not port engrdian directly

engrdian encrypts secrets **client-side** with a single shared master passphrase; the server only stores ciphertext. That is incompatible with engenty for one structural reason: **agents run inside engenty's own tenant sandboxes** (`PLAN-tenancy-architecture.md` §6.3 "per-box tenant secrets at start", §9.3 open "BYOK for spawned agents"). Something inside engenty's trust boundary must decrypt a secret to hand it to an agent — so "the server never sees plaintext" cannot hold for the secrets that matter most here. (The full engrdian audit that motivated this is summarised in `docs/wip/secrets-vault-engrdian-audit.md`.)

Instead we **generalise what `module_connections` already does right**:

- ciphertext at rest, **decrypted only server-side** (`packages/connections-sdk/src/token-crypto.ts`);
- `*_enc` columns **never granted** to `authenticated` — column-limited grants so RLS-passing rows still can't leak ciphertext to the browser;
- writes go through the **service role** only;
- tenant + owner/scope isolation via **RLS** (`tenant_id = core.current_tenant_id() and core.has_scope(scope_id)`).

The one weakness `connections` shares with engrdian — a **single static env key** (`CONNECTIONS_TOKEN_ENC_KEY`) — is the only crypto lesson worth carrying over, addressed as a phased upgrade to **per-tenant DEK + KMS envelope** (§4).

The optional "opaque even to engenty operators" tier (engrdian-style E2E, human-only, never grantable to an agent) is explicitly **out of v1** and captured in §10.

---

## 1. Domain model — the durable anchor

engenty already has the client entity: **`module_contacts.contacts` with `type = 'organisation'`** (has `legal_name`, `vat_id`, `billing_email`, address, logo). `module_offers.offers.client_id` already FKs it (`references module_contacts.contacts(id)`). Projects reference a client via loose `client_id text` (not a FK).

**Rule we adopt:** durable assets (secrets, paid services) are owned by the **durable** entity (the client), not the **ephemeral** one (the quarterly project).

- **Owner scope** — exactly one, decides lifecycle + who may see the row. One of: `user` | `project` | `client` | `tenant`.
- **Associations** — many, cosmetic/discovery: link a secret to projects and to services. A new quarterly project just *associates* the same client-owned secret; nothing migrates.

### Scope ladder (generalises connections' `personal`/`org`)

| `owner_scope` | `owner_id` refers to | Visible to | Typical use |
|---|---|---|---|
| `user` | `core.users.id` | that user only | personal login |
| `project` | `module_projects.projects.id` | project members | narrow, dies with the engagement |
| `client` | `module_contacts.contacts.id` (org) | anyone assigned to that client | **default** — DB creds, client SaaS logins |
| `tenant` | `core.tenants.id` | tenant, role-gated | the agency's own shared tooling |

`scope_id` (the engenty sub-tenant partition, `core.has_scope`) is carried on every row **independently** of `owner_scope`, exactly like contacts/tasks — it is the coarse RLS visibility gate; `owner_scope`/`owner_id` is the fine-grained ownership within it.

---

## 2. Module structure (one package, three faces)

Mirrors `modules/connections`. New workspace package `@engenty/secrets`, slug `secrets`.

```
modules/secrets/
  engenty.plugin.json            # manifest: capabilities.operations + ui true, ai false (v1)
  package.json                   # exports: ".", "./ui/plugin", "./ui/extensions"
  supabase/migrations/
    20260716120000_plugin_module_secrets.sql
  src/                           # CORE face (→ engenty-core)
    plugin.ts                    # registerRoleProfiles + wire repo + routes + operations
    api/
      operations.ts              # list/get-metadata/create/update/delete/move + reveal + grants
      reveal-routes.ts           # server-side decrypt endpoint (audit + scope check)
    resolve.ts                   # server-side "can principal read secret X" + decrypt
  ui/                            # UI face (→ engenty-ui)
    plugin.ts                    # standalone routes (phase 1) + settings item
    extensions.ts                # tab contribution registration (phase 2, see §9-R1)
    pages/
      vault-page.tsx             # global vault (admin) — engrdian dashboard analogue
      secret-editor-dialog.tsx
    components/
      client-secrets-tab.tsx     # contributed into contact/client detail (phase 2)
      project-secrets-tab.tsx    # contributed into project detail (phase 2)
      services-tab.tsx           # paid-services registry (phase 2/3)
      reveal-field.tsx           # copy/reveal with audit ping
    queries.ts
    locales/{en,de}.json
```

Crypto + repo live in a small SDK package so both core and (future) AI plane share them, mirroring `packages/connections-sdk`:

```
packages/secrets-sdk/
  src/{index,crypto,repo,resolve,types}.ts
```

**Activation** (per AGENTS.md, the *only* sanctioned path — never hand-edit `engenty.plugins`):
```bash
pnpm engenty plugins install secrets --db-migrate --db-restart
```

**Gotcha — PostgREST schema allowlist.** `engenty db sync` writes `module_secrets`
into `[api].schemas` in `supabase/config.toml`, but the live
`authenticator.pgrst.db_schemas` role setting **shadows** that list. If create
fails with `secrets_create: Invalid schema: module_secrets` (PostgREST
`PGRST106`) while the Postgres schema exists, restart from a synced checkout
(`--db-restart` above, or `supabase stop` + `start` — never `--no-backup`), or
hot-fix:

```sql
ALTER ROLE authenticator SET pgrst.db_schemas = '<full list from config.toml including module_secrets>';
NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';
```

Sibling worktrees that restart Supabase with an older schema list can stomp this
again on the shared local DB.

---

## 3. Schema — `20260716120000_plugin_module_secrets.sql`

Follows the `connections` migration conventions verbatim: dedicated schema, RLS on, column-limited `authenticated` grants that **exclude `*_enc`**, all writes `service_role`.

```sql
create schema if not exists module_secrets;

-- ── secrets ────────────────────────────────────────────────────────────────
create table if not exists module_secrets.secrets (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references core.tenants(id) on delete cascade,
  scope_id     text not null,                       -- core.has_scope() partition
  owner_scope  text not null check (owner_scope in ('user','project','client','tenant')),
  owner_id     text not null,                       -- user uuid | project uuid | contact id (text!) | tenant uuid
  name         text not null,
  kind         text not null check (kind in
                 ('username_password','api_key','key_list','credit_card','note')),
  url          text,
  description  text,
  -- payload: AES-256-GCM, server-only. Format mirrors token-crypto: iv.ct.tag (base64)
  payload_enc  text not null,
  -- envelope metadata (phase 2 KMS); null in phase-1 static-key mode
  dek_id       uuid references module_secrets.data_keys(id),
  created_by   uuid references core.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
create index if not exists idx_secrets_owner
  on module_secrets.secrets (tenant_id, owner_scope, owner_id) where deleted_at is null;
create index if not exists idx_secrets_scope
  on module_secrets.secrets (tenant_id, scope_id, updated_at desc);

-- ── associations (many) ──────────────────────────────────────────────────────
create table if not exists module_secrets.secret_projects (
  tenant_id  uuid not null references core.tenants(id) on delete cascade,
  secret_id  uuid not null references module_secrets.secrets(id) on delete cascade,
  project_id uuid not null,
  primary key (secret_id, project_id)
);

-- ── explicit principal grants (durable, non-goal) ────────────────────────────
-- Mirrors core.role_assignments' principal shape: exactly one of user/agent.
create table if not exists module_secrets.secret_grants (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references core.tenants(id) on delete cascade,
  secret_id   uuid not null references module_secrets.secrets(id) on delete cascade,
  user_id     uuid,
  agent_id    uuid,
  access      text not null default 'read' check (access in ('read')),  -- read-only for now
  granted_by  uuid references core.users(id) on delete set null,
  expires_at  timestamptz,
  created_at  timestamptz not null default now(),
  check ((user_id is null) <> (agent_id is null)),
  unique nulls not distinct (secret_id, user_id, agent_id)
);
create index if not exists idx_secret_grants_lookup
  on module_secrets.secret_grants (tenant_id, secret_id);

-- ── per-tenant data keys (envelope; phase 2) ─────────────────────────────────
create table if not exists module_secrets.data_keys (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references core.tenants(id) on delete cascade,
  version      int  not null,
  wrapped_dek  text not null,      -- DEK wrapped by KMS master (opaque)
  kms_key_ref  text,               -- which KMS master wrapped it
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  unique (tenant_id, version)
);

-- ── paid services / subscriptions registry ───────────────────────────────────
create table if not exists module_secrets.services (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references core.tenants(id) on delete cascade,
  scope_id          text not null,
  owner_scope       text not null check (owner_scope in ('client','tenant')),
  owner_id          text not null,
  name              text not null,
  url               text,
  description       text,
  cost_amount       numeric(14,2),
  cost_currency     text,
  cost_period       text check (cost_period in ('monthly','yearly','once')),
  next_billing_date date,
  billing_email     text,
  paid_via          text,
  connection_id     uuid,          -- optional link to module_connections.connections
  status            text not null default 'active' check (status in ('active','cancelled')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create table if not exists module_secrets.service_secrets (
  service_id uuid not null references module_secrets.services(id) on delete cascade,
  secret_id  uuid not null references module_secrets.secrets(id) on delete cascade,
  primary key (service_id, secret_id)
);

-- ── audit (every reveal) ─────────────────────────────────────────────────────
create table if not exists module_secrets.access_log (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references core.tenants(id) on delete cascade,
  secret_id    uuid not null,
  principal_id text not null,       -- user or agent id
  principal_kind text not null check (principal_kind in ('user','agent')),
  action       text not null check (action in ('reveal','copy','decrypt_for_agent')),
  goal_id      text,                -- when an agent read it for a goal
  created_at   timestamptz not null default now()
);
create index if not exists idx_secrets_access_log
  on module_secrets.access_log (tenant_id, secret_id, created_at desc);

-- ── RLS + grants (the connections discipline) ────────────────────────────────
alter table module_secrets.secrets        enable row level security;
alter table module_secrets.secret_projects enable row level security;
alter table module_secrets.secret_grants  enable row level security;
alter table module_secrets.services       enable row level security;
alter table module_secrets.service_secrets enable row level security;
alter table module_secrets.access_log     enable row level security;
alter table module_secrets.data_keys      enable row level security;

-- Metadata is readable to tenant members in-scope; the reveal path is a
-- separate server-side op. NOTE: row visibility here is coarse (scope). Whether
-- a given member may see a specific secret's *metadata* is refined server-side
-- in resolve.ts (owner_scope membership) — see §5-R2.
create policy secrets_read on module_secrets.secrets for select
  using (tenant_id = core.current_tenant_id() and core.has_scope(scope_id));
create policy services_read on module_secrets.services for select
  using (tenant_id = core.current_tenant_id() and core.has_scope(scope_id));
create policy secret_grants_read on module_secrets.secret_grants for select
  using (tenant_id = core.current_tenant_id());
create policy access_log_read on module_secrets.access_log for select
  using (tenant_id = core.current_tenant_id());

grant usage on schema module_secrets to service_role;
grant select, insert, update, delete on all tables in schema module_secrets to service_role;

grant usage on schema module_secrets to authenticated;
-- CRITICAL: payload_enc / wrapped_dek are NOT in these column lists.
grant select (
  id, tenant_id, scope_id, owner_scope, owner_id, name, kind, url, description,
  created_by, created_at, updated_at, deleted_at
) on module_secrets.secrets to authenticated;
grant select on module_secrets.secret_projects  to authenticated;
grant select on module_secrets.secret_grants     to authenticated;
grant select on module_secrets.services          to authenticated;
grant select on module_secrets.service_secrets   to authenticated;
grant select on module_secrets.access_log        to authenticated;
-- data_keys: service_role only, no authenticated grant at all.
```

Design notes baked in:
- `owner_id` is `text` because the client is a contact whose PK is `text` (see §9-R3). We do **not** FK it (owner can be four different tables); integrity is enforced in the DAL.
- `payload_enc` holds the whole JSON payload for the secret kind (like engrdian's per-kind shape), encrypted as one blob — not column-per-field.
- No per-secret salt column: the DEK/AES-GCM `iv` is embedded in `payload_enc` (`iv.ct.tag`), matching `token-crypto`.

---

## 4. Encryption — phase it, don't gold-plate v1

**Phase 1 (ship): static per-module key**, identical shape to connections.
- New env var `SECRETS_ENC_KEY` (32-byte base64, `openssl rand -base64 32`), declared in `engenty.plugin.json` `env.vars` with `"secret": true`, `scopes: ["root","deploy"]`.
- `packages/secrets-sdk/src/crypto.ts` = a copy of `token-crypto.ts` keyed on `SECRETS_ENC_KEY`. **Separate key from connections on purpose** (blast-radius isolation).
- `payload_enc = iv.ct.tag` base64, AES-256-GCM.

**Phase 2 (upgrade): per-tenant DEK + KMS envelope.**
- `data_keys` row per tenant: a random DEK, stored **wrapped by a KMS master** (`wrapped_dek`), never in plaintext at rest.
- Read path: KMS unwrap → DEK → AES-GCM decrypt. Cache unwrapped DEK in memory with a short TTL.
- Payoffs: a Postgres dump alone is useless; **deleting a tenant's `data_keys` = instant crypto-shred** of that tenant's secrets (fits the tenant-isolation invariant).
- Migration from phase 1: lazy re-encrypt on write, plus a backfill job; `dek_id null` ⇒ static-key path, `dek_id set` ⇒ envelope path. Both decrypt paths coexist behind `resolve.ts`.

**KMS choice is an open decision** (§9-R5): AWS KMS / GCP KMS / Vault Transit / age-with-managed-key. Keep `crypto.ts` behind a `Wrapper` interface so the backend is swappable, mirroring the sandbox-provider pattern (`PLAN-tenancy-architecture.md` §6.5).

**AAD (do it in phase 1, cheap):** bind GCM with `AAD = secretId || owner_scope || owner_id` so a ciphertext can't be swapped between rows. `token-crypto` doesn't use AAD today — this is a deliberate improvement, not a copy.

---

## 5. Authorization — reuse the capability + grant machinery

### Capabilities (roadblock-aware — see §9-R2)

engenty's `tenant.member` role bundle holds `module.*`, and `capabilityCovers("module.*", "module.secrets.read")` is **true**. So if we name the read cap `module.secrets.read`, *every member can read every client's secrets by default*. That is wrong for a vault.

Resolution — two-tier, and it's the crux of the design:

1. **Feature capability** `module.secrets.read` / `module.secrets.write` — "may use the vault UI / list metadata for secrets they're in scope for". Covered by `module.*` → fine, members get the feature.
2. **Plaintext reveal is NOT a `module.*` capability.** The decrypt endpoint requires **scope membership of the secret's `owner_scope`** (enforced in `resolve.ts`, server-side), *not* a capability string. Being a member of the tenant is necessary but not sufficient — you must be assigned to that client/project (or own the user/tenant-scoped secret).

Register two module role profiles (like `connections.viewer`/`editor`):
```ts
engenty.server.registerRoleProfiles([
  { id: "secrets.viewer", title: "Secrets viewer", capabilities: ["module.secrets.read"] },
  { id: "secrets.editor", title: "Secrets editor",
    capabilities: ["module.secrets.read", "module.secrets.write"] },
]);
```

### `resolve.ts` — the single authority for "can principal read secret X"

```ts
// packages/secrets-sdk/src/resolve.ts  (server-side, service-role client)
export async function canReadSecret(db, {
  tenantId, principal /* {kind:'user'|'agent', id, goalId?} */, secret,
}): Promise<boolean> {
  // 1. explicit durable grant (either principal kind)
  if (await hasSecretGrant(db, tenantId, secret.id, principal)) return true;

  // 2. agent goal-scoped grant — reuse core.agent_goal_grants via a concrete
  //    capability string "secrets.read:<id>" (no wildcards, matches the
  //    agent_goal_grants "concrete capability" contract).
  if (principal.kind === "agent" && principal.goalId) {
    const caps = await listGoalGrantCapabilities(db, {
      tenantId, goalId: principal.goalId, agentId: principal.id });
    if (caps.includes(`secrets.read:${secret.id}`)) return true;
  }

  // 3. users: scope membership of the secret's owner_scope
  if (principal.kind === "user") {
    switch (secret.owner_scope) {
      case "user":    return secret.owner_id === principal.id;
      case "tenant":  return true; // in-tenant + has feature cap (checked at route)
      case "client":  return isAssignedToClient(db, tenantId, principal.id, secret.owner_id);
      case "project": return isProjectMember(db, tenantId, principal.id, secret.owner_id);
    }
  }
  return false;
}
```

`isAssignedToClient` / `isProjectMember` are the open integration points with contacts/projects (§9-R4): today "assigned to a client" has no first-class table — projects have members, clients (contacts) do not. Decide the membership source before building phase-2 tabs.

### Reveal — two endpoints, because agent identity isn't in the HTTP context (R10)

Validated against `plugin-sdk`: the operation/HTTP auth context has `principalId`, `scopeId`, `tenantId`, `capabilities?` — **but not `agentId`/`goalId`** (those exist only in the profile-policy layer, `createAgentEscalationPolicy`'s `input.auth`). So a single hand-rolled route can't branch on "is this an agent". Split it:

- **Human reveal — HTTP route:**
  ```
  POST /api/secrets/:id/reveal   (authenticated; requires module.secrets.read)
    → load secret (RLS-scoped) → canReadSecret(user) → decrypt → access_log → plaintext over TLS
  ```
  Never via a column grant; never cached client-side beyond the focused field.
- **Agent reveal — registered operation**, so the escalation policy fires and evaluates `agent_goal_grants`:
  ```
  operation secrets_reveal { requiredCapabilities: ["secrets.read:<id>"] }
    → escalation policy unions agent role caps + goal grants → allow | require_approval
    → on allow: decrypt → access_log(decrypt_for_agent, goal_id) → payload
  ```
  The concrete per-secret capability string `secrets.read:<id>` is what a human approves "for this goal", inserting the goal grant.

### Agent consumption — two paths, both reuse existing machinery

- **Standing:** `secret_grants` row with `agent_id` (admin grants an agent durable read to a specific secret). Resolved by `canReadSecret` step 1.
- **Ephemeral / goal-scoped:** the **existing** `createAgentEscalationPolicy` (`apps/core/src/security/agent-escalation-policy.ts`) already unions agent role caps with `agent_goal_grants`. A secret-read operation declares `requiredCapabilities: ["secrets.read:<id>"]`; the gap escalates to `require_approval`; approving "for this goal" inserts the goal grant; it reaps on goal end. **No new policy code** — we only add the operation and the concrete-cap convention.
- **Runtime delivery** is an open item (§9-R6): v1 = agent calls a **core operation** `secrets_reveal` at run time (auditable, simplest, no box plumbing). Box-env injection ("per-box tenant secrets at start") is the phase-3 optimisation tied to the AI-plane BYOK open item.

---

## 6. Services (paid subscriptions) — kept distinct from `connections`

Two different things that must not merge:
- **`module_connections`** = live integrations agents *act through* (OAuth/api_key, refreshed, policy-gated). Machine-consumed.
- **`module_secrets.services`** = passive records of *what a client pays for* + attached human secrets (cost, renewal, billing email). Human-managed.

A `services` row may optionally reference a `connections.connections.id` when the vendor is also a live integration, but they stay separate tables/lifecycles. Services reuse the same scope ladder (client/tenant only — a subscription isn't user- or project-owned).

---

## 7. UI plan

### Phase 1 — standalone, ships without any host-surface dependency
- `/mdl/secrets` **global vault** page (the engrdian dashboard analogue): paginated list of secret *metadata* the caller is in scope for, filter by client/project/kind, search. Reveal is per-row via the reveal endpoint.
- `/mdl/secrets/:id` editor dialog/page (create/update, choose owner scope + associations).
- `/mdl/secrets/services` services registry.
- Settings item under `/settings` (per `registerSettingsItem`), `requiresAdmin: false` (scoped members can use it).
- `reveal-field.tsx`: masked by default, click-to-reveal (calls reveal endpoint → audit), copy-to-clipboard with auto-clear; a vault-lock timeout is a *client convenience*, not a security boundary (unlike engrdian, plaintext isn't in the browser at rest).

### Phase 2 — contributed tabs (depends on §9-R1)
- `client-secrets-tab.tsx` contributed into the **contact/client detail** surface (`/mdl/contacts/:id`, `ContactDetailPage`) — the natural home. Shows that client's secrets + services.
- `project-secrets-tab.tsx` contributed into **project detail** — secrets *associated* to the project (read-mostly).

Both depend on the `UiTabContribution` registry, which **is not built yet** (§9-R1).

### Reveal UX invariants
- Nothing decrypted is persisted to `localStorage`/`sessionStorage`/IndexedDB (engrdian's H2/H3 mistakes — see the audit doc). Plaintext lives only in the focused field's React state, cleared on blur/unmount/route change.
- Every reveal and copy pings `access_log`.

---

## 8. Milestones

| Phase | Deliverable | Gated by |
|---|---|---|
| **0** | This doc reviewed; KMS + membership decisions (§9-R2/R4/R5) taken | review |
| **1** | Module scaffold, migration, static-key crypto (`SECRETS_ENC_KEY`), CRUD + reveal ops, `resolve.ts`, standalone `/mdl/secrets` UI, audit log | 0 |
| **2** | `secret_grants` + agent goal-grant read path + `secrets_reveal` core op; contributed client/project tabs (needs R1) | 1, R1 |
| **3** | Services registry UI; envelope/KMS crypto + `data_keys` + crypto-shred; box-env agent injection | 2, R5, R6 |
| **4** (opt) | Human-only E2E tier (§10) | demand |

---

## 9. Roadblocks & open decisions (surface now)

**R1 — Contributed tabs don't exist yet, and live in the public repo.**
`PLAN-tab-contributions.md` shows `UiTabContribution` is *unbuilt*, scoped to `engenty/engenty` (public), and its first surface is `projects.detail` only — **no `contacts.detail` surface**. Consequences:
- Phase-2 client/project tabs are **blocked** on that public-repo work landing, and on a new `contacts.detail` surface being added to `ContactDetailPage`.
- Mitigation: Phase 1 ships entirely on standalone `/mdl/secrets` routes (no host dependency). Decide whether we (a) wait for R1, (b) co-drive the public tab registry + add the `contacts.detail`/`projects.detail` surfaces as part of this work, or (c) ship a temporary in-module "open vault for this client" deep-link button on the contact page instead of an embedded tab.

**R2 — `module.*` over-grants read.** `tenant.member` = `module.*` covers `module.secrets.read`. The vault therefore **cannot** rely on capability strings for row/plaintext authorization — it must gate reveal on **scope membership** in `resolve.ts` (§5). Confirm this is acceptable vs. introducing a capability *outside* the `module.` namespace (e.g. `secrets.reveal`) that `module.*` does not cover. Recommendation: keep `module.secrets.*` as feature access + enforce reveal by scope membership + audit; do **not** invent a parallel cap.

**R3 — `contacts.id` is `text`, not `uuid`.** So `owner_id` must be `text` and can't be a uniform FK across the four owner types. We rely on DAL integrity + a periodic orphan check. Confirm acceptable (offers already FKs `contacts(id)` as text, so precedent exists for the client case specifically — we *could* add a partial FK only for `owner_scope='client'` via a trigger, but that's gold-plating).

**R4 — client access flows through project membership (RESOLVED).** Decision: clients *own* the secret (`owner_scope='client'`), but a user is granted access **through a project** that references the client, **or** by a direct `secret_grants` row (both managed via UI / mass-edit). Wired to the real sources found in code:
- `isProjectMember(userId, projectId)` = a row in `module_projects.project_team (project_id, user_id)`.
- `isAssignedToClient(userId, clientId)` = the user is on `project_team` for **any** project whose `module_projects.projects.client_id = clientId` (in tenant).
Implemented in `reveal-routes.ts::buildResolveDeps`, with try/catch → default-deny if `module_projects` isn't installed. **New coupling (extends R7):** the secrets module now *reads* `module_projects` at resolve time — a soft, schema-qualified read (no FK). If projects can be disabled, client/project-scoped reveal silently denies; confirm that's the intended failure mode. `projects.client_id` is soft `text` (its FK to contacts was intentionally dropped), so a `client` owner_id and a project's `client_id` are compared as text — keep them consistent (the contact id).

**R5 — KMS backend undecided.** Phase-2 envelope needs a managed master key. Pick AWS KMS / GCP KMS / Vault Transit / age. Affects deploy (`deploy/`), env, and the self-hosted story (self-hosted has no cloud KMS → need a file-based master fallback). Keep behind a `Wrapper` interface.

**R6 — Agent runtime delivery.** Injecting secrets into the tenant box "at start" is an *open architecture item* (§9.3 BYOK), not built. v1 must use the core-operation reveal path (agent → core op → audited decrypt) and defer box-env injection to phase 3.

**R7 — Migration aggregation & module coupling.** `pnpm engenty plugins install` aggregates module migrations into the supabase compose (AGENTS.md §Activation). The secrets migration references `core.tenants`, `core.users`, and (soft) contacts/projects — so **install order / enabled-set** matters: cross-schema `references core.*` are fine (core always present), but `services.connection_id` referencing `module_connections` must be a **soft** reference (no FK) unless we make `connections` a hard dependency. Recommendation: soft reference (nullable uuid, no FK) to avoid coupling the vault to connections being installed.

**R8 — `core.has_scope` semantics (partly resolved).** We adopt `scope_id` + `core.has_scope()` for RLS like contacts/tasks. Validated: the principal context carries `scopeId`, so `secrets_create` sets `scope_id = ctx.auth.scopeId` (not client input) — a secret can't be planted in a foreign scope. Still confirm how a user acquires a scope and whether client/project secrets should live in a specific non-default scope.

**R9 — Reveal ≠ RLS.** Because metadata RLS is coarse (scope-level), two in-scope members could see each other's *metadata* even when only one may reveal. Confirm that's acceptable (names/urls are lower-sensitivity than payloads) or tighten metadata visibility server-side too.

**R10 — Agent identity is not in the operation/HTTP context (CONFIRMED + RESOLVED).** `plugin-sdk`'s handler `ctx.auth` (`PluginAuthContext`) exposes `principalId/scopeId/tenantId/capabilities` only; `agentId`/`goalId`/`principalType` live *exclusively* in `PluginPolicyAuthContext` (the profile-policy layer). Resolution, mirroring `connections`:
- **Human reveal** = the HTTP route (`reveal-routes.ts`), `principalId` is always a user → resolves as a user principal. (Its earlier agent branch was type-invalid and has been removed.)
- **Agent reveal** = the `secrets_reveal` **operation** gated by **`createSecretsRevealPolicy`** (`src/policy.ts`). Only the policy sees `agentId`/`goalId`, so it runs `canReadSecret` for the agent (explicit grants ∪ `agent_goal_grants` `secrets.read:<id>`) and escalates the gap to `require_approval` — exactly `createConnectionsProfilePolicy`/`createAgentEscalationPolicy`. For humans the policy abstains and the handler's user-scope resolve governs.
- **Handler can't tell principal kind** (no `principalType`): the `secrets_reveal` handler does a `core.agents` lookup on `principalId` to (a) pick the user-vs-agent resolve branch and (b) stamp `access_log.principal_kind`. Wire in Phase 1. A per-secret static `requiredCapabilities` won't work (the cap is dynamic, `secrets.read:<id>`), which is *why* it's a custom profile policy, not a static capability declaration.

---

## 10. Explicitly out of v1
- **Human-only E2E tier** (opaque to engenty operators, passkey/PRF-wrapped, never grantable to agents). Contract if built later: an E2E secret can never be granted to an agent (the box would have to decrypt it). Build only on tenant demand.
- Secret **versioning/history** and rollback.
- Secret **sharing across tenants** (deliberately impossible — `tenant_id` isolation).
- Write/rotate access for agents (grants are `read`-only in v1).

---

## 11. Testing

### Done / verified in this worktree
- ✅ `secrets-sdk` **crypto** (`crypto.test.ts`, 4 tests): round-trip; **AAD anti-swap** (a blob won't decrypt under a different `ownerId` or `secretId`); tamper → auth-tag failure; missing key env is a hard error. `pnpm --filter @engenty/secrets-sdk exec vitest run`.
- ✅ `secrets-sdk` **`resolve.canReadSecret`** (`resolve.test.ts`, 10 tests): full truth table — direct grant beats scope; user × {user/tenant/client/project}; agent path proves **no scope fallthrough** (only explicit grant or `secrets.read:<id>` goal grant, scoped to `(tenant,goal,agent)`).
- ✅ `secrets-sdk` **typechecks clean** (`tsc --noEmit`).
- ✅ **Module activated + compiles end-to-end.** `pnpm engenty plugins install secrets` enabled it in `engenty.plugins`, aggregated 71 migrations, exposed `module_secrets` in PostgREST config, generated the UI catalog. `pnpm turbo build --filter=@engenty/secrets` builds core + UI faces with DTS (17/17 tasks). The core face — `secrets_reveal`/`secrets_create`/`update`/`delete`/`move` operations + `createSecretsRevealPolicy` (R10 agent gate, wired in `plugin.ts`) — typechecks against the real `plugin-sdk`.
- ✅ **Migration applied via the tracked runner** (`pnpm db:migrate`, version `20260716120000`) and re-verified: 7/7 tables RLS-on; `payload_enc` still `permission denied` for `authenticated`; schema API-exposed.
- ✅ **Live end-to-end round-trip** against the running local Postgres (seed tenant/user/agent/client-contact/project → encrypt with the real SDK → store → checks → cleanup). All assertions green:
  - `authenticated` (jwt `tenant_id`+`scopes`): `payload_enc` → **permission denied**; metadata row **visible**; **cross-tenant jwt → 0 rows** (proves `core.current_tenant_id()` isolation live, not just structurally).
  - **Reveal**: service-role fetch → SDK decrypt **== original plaintext**; decrypt under a **wrong owner AAD → throws** (anti-swap proven against a really-stored ciphertext).
  - **Resolve on real rows**: `isAssignedToClient(U,C)=true` (U is on project P, `P.client_id=C`), `(U2,C)=false`; agent goal-grant absent→**deny**, after inserting `secrets.read:<id>`→**allow**.

- ✅ **Full UI create→reveal in the running app** (dedicated-DB worktree: isolated Supabase on 54421/54422, whole stack via `pnpm dev:portless --domain=secrets`). Seeded a dev admin+tenant via `POST /api/users/setup/create-initial-admin` (API, not the credential form), signed in via GoTrue (JWT carried `tenant_id`+`scopes`), injected the session into the browser. Built a minimal functional `VaultPage` (plain `requestApiJson`) and drove it in-browser: **Create secret** → `secrets_create` op stored ciphertext (`6EXX3d2W…`, no `alice`/`hunter2` in the column); **Reveal** → audited `/api/secrets/:id/reveal` returned `{"username":"alice","password":"hunter2"}`; `access_log` got a `reveal · user` row. The vault UI is now a real (if minimal) page rather than the earlier stub.

> ⚠️ **Ops finding (shared-DB hazard).** Mid-verification the `module_secrets` schema + its tracking row vanished from the shared local Supabase — a sibling checkout without this module ran a migrate/reset and stomped it (`core`/`projects`/`contacts` survived). This is exactly the release-skill mode-(d) case: **do the remaining DB work in a worktree with a dedicated Supabase** (`project_id` + shifted ports) so other checkouts can't clobber it. The round-trip above was captured by re-applying the migration immediately before the run.
- ✅ **Migration applied** to local Supabase and verified at the DB layer:
  - all 7 tables have RLS enabled; 6 have a select policy; `data_keys` has none (service-role only).
  - `authenticated` column privileges on `secrets` = exactly the 14 allowed cols; **`payload_enc` is absent**.
  - behavioral: `set role authenticated; select payload_enc …` → **permission denied**; same for `data_keys.wrapped_dek`; allowed columns succeed. This is the crown-jewel property — ciphertext is unreachable from the client role.

### Pending (needs the module compiled against the host / a seeded tenant)
- RLS **cross-scope**: a member in scope A cannot select rows in scope B (predicate is the inherited `core.current_tenant_id()`+`core.has_scope()` used by every module — covered by core's own tests; add a module-level case when seeding lands).
- Route/op: reveal denied without scope membership even with `module.secrets.read`; every reveal writes `access_log`; `secrets_move` re-encrypts to the new AAD (decrypt-old → encrypt-new round-trips).
- Agent: `createSecretsRevealPolicy` escalates the gap to approval; goal grant `secrets.read:<id>` allows exactly that secret and reaps on goal end.
- Module (core-face) **typecheck** against `plugin-sdk` `registerOperation`/`registerProfilePolicy` — needs the full plugin build wired (Phase 1).
```
