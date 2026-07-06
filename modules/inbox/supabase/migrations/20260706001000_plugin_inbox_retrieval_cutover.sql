-- Inbox search cutover to the central retrieval service (Phase 3,
-- docs/wip/retrieval-service.md). Copies the per-message embeddings into
-- search.documents/chunks (single chunk per message, no re-embedding), then
-- drops the module-local vector surface added by
-- 20260705210000_plugin_inbox_hybrid_search.sql.

insert into search.source_visibility (source_type, module, visibility)
values ('inbox.message', 'inbox', 'owner')
on conflict (source_type) do update set
  module = excluded.module,
  visibility = excluded.visibility,
  updated_at = now();

insert into search.documents (
  tenant_id, source_type, doc_id, module, scope_id, owner_user_id,
  title, metadata, occurred_at, content_updated_at, indexed_at, embedding_model
)
select
  m.tenant_id,
  'inbox.message',
  m.id,
  'inbox',
  m.scope_id,
  m.owner_user_id,
  m.subject,
  jsonb_build_object('connection_id', m.connection_id, 'status', m.status),
  m.received_at,
  m.updated_at,
  now(),
  coalesce(e.embedding_model, 'openai/text-embedding-3-small')
from module_inbox.message_embeddings e
join module_inbox.messages m on m.id = e.message_id
on conflict (tenant_id, source_type, doc_id) do nothing;

insert into search.chunks (
  id, tenant_id, source_type, doc_id, chunk_index, module, scope_id,
  owner_user_id, occurred_at, metadata, text, embedding, embedding_model
)
select
  e.message_id || '::chunk::0',
  m.tenant_id,
  'inbox.message',
  e.message_id,
  0,
  'inbox',
  m.scope_id,
  m.owner_user_id,
  m.received_at,
  jsonb_build_object('connection_id', m.connection_id, 'status', m.status),
  e.document_text,
  e.embedding,
  coalesce(e.embedding_model, 'openai/text-embedding-3-small')
from module_inbox.message_embeddings e
join module_inbox.messages m on m.id = e.message_id
on conflict (tenant_id, id) do nothing;

-- Legacy surface teardown. `search_messages` had no callers left (the
-- provider was its only consumer); the thread list uses `list_threads`.
drop function if exists module_inbox.search_messages;
drop table if exists module_inbox.message_embeddings;
