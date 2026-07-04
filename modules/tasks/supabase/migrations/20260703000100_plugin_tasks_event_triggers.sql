-- Event triggers (phase 2 of the trigger cutover).
--
-- An event trigger fires when an external event arrives, through one of two
-- ingestion edges:
--   provider_id = 'module-events' — the in-process plugin event bus
--     (`engenty.events.modules`); `resource` is the canonical event name
--     (`<module>.<entity>.<verb>`), `event_filter` a shallow payload match.
--   provider_id = 'webhook' — a public, secret-authenticated HTTP route
--     (`POST /api/tasks/trigger-hooks/:triggerId/:secret`).
-- Both edges converge on the same `triggers_fire` task materialization used by
-- schedule and manual triggers. (Mastra SignalProviders are deliberately NOT
-- used here — they are thread-scoped; see docs/wip/agent-ops-target-architecture.md.)

alter table module_tasks.triggers
  add column if not exists webhook_secret text;

-- Event dispatch lookup: match enabled event triggers by provider + resource.
create index if not exists idx_module_tasks_triggers_event_lookup
  on module_tasks.triggers (tenant_id, provider_id, resource)
  where kind = 'event' and enabled;

-- Webhook fires look the trigger up by primary key across tenants (the route
-- is public, authenticated by the per-trigger secret) — pk index suffices.

alter table module_tasks.triggers
  add constraint triggers_event_requires_provider
  check (kind <> 'event' or provider_id is not null);
