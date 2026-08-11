-- Optimized thread view: cached AI digests (per-message stripped content +
-- attachment triage, per-thread status summary). Generated on demand by the
-- inbox_thread_digest_get operation with a light model; keyed by digest_version
-- so a prompt change invalidates the cache lazily.

create table if not exists module_inbox.message_digests (
  message_id text primary key references module_inbox.messages(id) on delete cascade,
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  scope_id text not null,
  thread_id text not null references module_inbox.threads(id) on delete cascade,
  owner_user_id uuid,
  digest_version integer not null default 1,
  model_id text,
  -- The message stripped to its substance (markdown): no greetings-only lines,
  -- signatures, footers, disclaimers, or quoted history.
  content_md text not null,
  -- attachments_json subset that survived triage (real documents/images only;
  -- social icons, tracking pixels, and inline decoration dropped).
  attachments_json jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_module_inbox_message_digests_thread
  on module_inbox.message_digests (thread_id);

create table if not exists module_inbox.thread_digests (
  thread_id text primary key references module_inbox.threads(id) on delete cascade,
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  scope_id text not null,
  owner_user_id uuid,
  digest_version integer not null default 1,
  model_id text,
  -- Current status of the conversation (markdown, a few sentences + open points).
  summary_md text not null,
  -- [{ email, name, role }] as inferred from the thread.
  participants_json jsonb not null default '[]',
  -- Staleness check: the summary covered messages up to this point.
  summarized_message_count integer not null default 0,
  last_message_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant usage on schema module_inbox to service_role;
grant select, insert, update, delete on module_inbox.message_digests to service_role;
grant select, insert, update, delete on module_inbox.thread_digests to service_role;

grant select on table module_inbox.message_digests to authenticated;
grant select on table module_inbox.thread_digests to authenticated;
