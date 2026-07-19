-- engenty-remote Phase 2/3: identity pairing + proactive outbound queue.
--
--   * pairing_requests — one-time codes handed to unmapped senders in chat;
--     claiming one (logged into engenty) creates the verified identity row.
--   * remote_outbound  — pgmq queue for proactive messages posted into bound
--     platform threads (consumed by apps/ai).

create table if not exists module_remote.pairing_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  binding_id uuid not null references module_remote.bindings(id) on delete cascade,
  platform text not null check (platform in ('slack', 'telegram', 'whatsapp', 'teams')),
  external_user_id text not null,
  display_name text,
  -- One-time claim code embedded in the pairing link shown in chat.
  code text not null unique,
  expires_at timestamptz not null,
  claimed_by uuid,
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);

-- One open request per sender per binding; re-inviting refreshes it.
create unique index if not exists uq_module_remote_pairing_open
  on module_remote.pairing_requests (binding_id, external_user_id)
  where claimed_at is null;

alter table module_remote.pairing_requests enable row level security;

-- Proactive outbound sends (Phase 3): consumed by apps/ai remote-channels.
SELECT pgmq.create('remote_outbound');
