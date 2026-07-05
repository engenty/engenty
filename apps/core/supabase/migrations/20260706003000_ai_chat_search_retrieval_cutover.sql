-- Chat-search cutover to the central retrieval service (Phase 5a,
-- docs/wip/retrieval-service.md). The legacy ai.agent_chat_search_* tables
-- held derived lexical-only text — no embeddings — so there is nothing
-- semantic to preserve. Session-level rows are copied into
-- search.documents/chunks (embedding NULL) so lexical search stays live
-- through the cutover; content_updated_at is pinned to epoch so the standard
-- backfill re-chunks with the new paragraph splitter and embeds every
-- session (first-time embeddings — semantic chat search is new capability).
--
-- Message-level rows (document_type = 'message') are NOT copied: the new
-- source indexes one document per session and the session transcript
-- already contains every message's text.

insert into search.source_visibility (source_type, module, visibility)
values ('ai.chat_session', 'ai', 'user')
on conflict (source_type) do update set
  module = excluded.module,
  visibility = excluded.visibility,
  updated_at = now();

insert into search.documents (
  tenant_id, source_type, doc_id, module, scope_id, owner_user_id,
  title, metadata, occurred_at, content_updated_at, indexed_at, embedding_model
)
select
  d.tenant_id,
  'ai.chat_session',
  d.thread_id::text,
  'ai',
  'default',
  d.user_id,
  t.title,
  jsonb_strip_nulls(jsonb_build_object(
    'agent_id', d.agent_id,
    'status', d.session_status,
    'workspace_key', d.workspace_key,
    'route_key', d.route_context ->> 'routeKey'
  )),
  d.source_updated_at,
  -- Epoch = always older than ai.thread.updated_at, so the status scan marks
  -- every copied session stale and backfill re-chunks + embeds it.
  timestamptz 'epoch',
  now(),
  null
from ai.agent_chat_search_document d
join ai.thread t on t.id = d.thread_id
where d.document_type = 'session'
on conflict (tenant_id, source_type, doc_id) do nothing;

insert into search.chunks (
  id, tenant_id, source_type, doc_id, chunk_index, module, scope_id,
  owner_user_id, occurred_at, metadata, text, embedding, embedding_model
)
select
  d.thread_id::text || '::chunk::' || c.chunk_index,
  c.tenant_id,
  'ai.chat_session',
  d.thread_id::text,
  c.chunk_index,
  'ai',
  'default',
  d.user_id,
  d.source_updated_at,
  jsonb_strip_nulls(jsonb_build_object(
    'agent_id', d.agent_id,
    'status', d.session_status,
    'workspace_key', d.workspace_key,
    'route_key', d.route_context ->> 'routeKey'
  )),
  c.text,
  null,
  null
from ai.agent_chat_search_chunk c
join ai.agent_chat_search_document d on d.doc_id = c.doc_id
join ai.thread t on t.id = d.thread_id
where d.document_type = 'session'
on conflict (tenant_id, id) do nothing;

-- Legacy surface teardown. The chat-search store was the only reader/writer;
-- the FK cascade from ai.thread that cleaned these tables up is replaced by
-- the explicit ai.chat_session.deleted subscriber in apps/ai.
drop table if exists ai.agent_chat_search_chunk;
drop table if exists ai.agent_chat_search_document;
