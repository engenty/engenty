-- Digest classification: what kind of mail a message/thread is. Surfaced as a
-- tag in the optimized view today; the inbox filter lanes will build on it.
-- Values are validated by the module's zod schema, not a CHECK, so adding a
-- category later needs no migration.

alter table module_inbox.message_digests
  add column if not exists category text not null default 'conversation';

alter table module_inbox.thread_digests
  add column if not exists category text not null default 'conversation';

create index if not exists idx_module_inbox_thread_digests_category
  on module_inbox.thread_digests (tenant_id, scope_id, category);
