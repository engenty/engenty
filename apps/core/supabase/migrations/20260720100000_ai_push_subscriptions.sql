-- Web-push subscriptions (notifications phase N2): one row per browser/device
-- push endpoint a user enabled. Owned by apps/ai (ai schema), written and read
-- ONLY through the service-role API (/ai/v1/notifications/push/*) — no
-- authenticated grants, RLS enabled with no policies (same posture as
-- ai.artifact). The endpoint is globally unique per Web Push spec; a re-
-- subscribe upserts the keys.

create table if not exists ai.push_subscriptions (
  id uuid primary key default public.uuidv7(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  user_id uuid not null,
  endpoint text not null unique,
  -- Client keys from PushSubscription.getKey(): payload encryption inputs.
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists idx_ai_push_subscriptions_user
  on ai.push_subscriptions (tenant_id, user_id);

alter table ai.push_subscriptions enable row level security;
grant select, insert, update, delete on table ai.push_subscriptions to service_role;
