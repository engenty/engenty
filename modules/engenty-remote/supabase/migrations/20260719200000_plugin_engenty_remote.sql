-- engenty-remote module baseline: external messengers as remote chat
-- interfaces. Schema: module_remote (bindings, identities, conversations,
-- inbound_events).
--
-- Access model:
--   * service_role — full CRUD via the core API / apps/ai channel runtime;
--     repos enforce tenant scoping in code.
--   * authenticated — no direct table access in v1. Binding management and
--     pairing run through core API routes; identities hold PII-adjacent
--     external ids and stay server-side.
--
-- Concepts:
--   * binding       — one external workspace/bot ↔ one tenant (Slack team,
--                     Telegram bot, …). Carries platform, credential linkage
--                     (connections framework), and the unmapped-sender policy.
--   * identity      — verified mapping (platform, external user) → engenty
--                     user, created by the pairing flow.
--   * conversation  — external thread ↔ Mastra memory thread linkage.
--   * inbound_event — dedup ledger for webhook retries.

create schema if not exists module_remote;

-- ── Bindings ─────────────────────────────────────────────────────────────────
create table if not exists module_remote.bindings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  platform text not null check (platform in ('slack', 'telegram', 'whatsapp', 'teams')),
  status text not null default 'active' check (status in ('active', 'disabled')),
  -- Agent answering on this binding. Default: the chat-tuned core agent.
  agent_id text not null default 'engenty.remote',
  -- Connections-framework connection holding platform credentials (nullable:
  -- spike/env-credential bindings have no stored connection).
  connection_id uuid,
  -- Platform workspace anchor (Slack team_id, Telegram bot id, …). Webhook
  -- events resolve tenant through (platform, external_workspace_id).
  external_workspace_id text,
  display_name text,
  unmapped_sender_policy text not null default 'invite'
    check (unmapped_sender_policy in ('ignore', 'invite', 'deny')),
  -- Optional capability ceiling intersected with the mapped user's roles
  -- (Phase 2). Empty object = no extra restriction.
  capability_ceiling jsonb not null default '{}',
  settings jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_module_remote_binding_workspace
  on module_remote.bindings (platform, external_workspace_id)
  where external_workspace_id is not null;

create index if not exists idx_module_remote_bindings_tenant
  on module_remote.bindings (tenant_id, platform);

-- ── Identities ───────────────────────────────────────────────────────────────
create table if not exists module_remote.identities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  platform text not null check (platform in ('slack', 'telegram', 'whatsapp', 'teams')),
  external_user_id text not null,
  user_id uuid not null,
  display_name text,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists uq_module_remote_identity
  on module_remote.identities (tenant_id, platform, external_user_id);

create index if not exists idx_module_remote_identities_user
  on module_remote.identities (tenant_id, user_id);

-- ── Conversations ────────────────────────────────────────────────────────────
create table if not exists module_remote.conversations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  binding_id uuid not null references module_remote.bindings(id) on delete cascade,
  -- Platform thread id as surfaced by the Chat SDK adapter.
  external_thread_id text not null,
  -- Mastra memory thread backing this conversation.
  ai_thread_id text,
  is_dm boolean not null default false,
  created_at timestamptz not null default now(),
  last_event_at timestamptz not null default now()
);

create unique index if not exists uq_module_remote_conversation
  on module_remote.conversations (binding_id, external_thread_id);

-- ── Inbound dedup ledger ─────────────────────────────────────────────────────
create table if not exists module_remote.inbound_events (
  id uuid primary key default gen_random_uuid(),
  binding_id uuid not null references module_remote.bindings(id) on delete cascade,
  external_event_id text not null,
  received_at timestamptz not null default now()
);

create unique index if not exists uq_module_remote_inbound_event
  on module_remote.inbound_events (binding_id, external_event_id);

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- v1: service_role only (bypasses RLS); no authenticated policies yet.
alter table module_remote.bindings enable row level security;
alter table module_remote.identities enable row level security;
alter table module_remote.conversations enable row level security;
alter table module_remote.inbound_events enable row level security;
