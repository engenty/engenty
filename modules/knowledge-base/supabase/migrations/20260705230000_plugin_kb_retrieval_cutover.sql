-- KB search cutover to the central retrieval service (Phase 2,
-- docs/wip/retrieval-service.md). Copies existing article embeddings into
-- search.documents/chunks (same model family, same 1536 dims — no
-- re-embedding), then drops the module-local vector store. After this
-- migration the legacy KB search SQL surface no longer exists.

-- Visibility registration (idempotent; the service also upserts at boot).
insert into search.source_visibility (source_type, module, visibility)
values ('kb.article', 'knowledge-base', 'tenant')
on conflict (source_type) do update set
  module = excluded.module,
  visibility = excluded.visibility,
  updated_at = now();

-- Doc rows for every live article that has embeddings. embedding_model is
-- stamped with the platform default: per-tenant overrides re-embed on the
-- next backfill/edit anyway, and mismatched-model chunks degrade to lexical
-- (never cross-model cosine).
insert into search.documents (
  tenant_id, source_type, doc_id, module, scope_id, owner_user_id,
  title, metadata, occurred_at, content_updated_at, indexed_at, embedding_model
)
select
  a.tenant_id,
  'kb.article',
  a.id,
  'knowledge-base',
  a.scope_id,
  null,
  a.title,
  jsonb_build_object('kb_id', a.kb_id),
  a.updated_at,
  a.updated_at,
  now(),
  'openai/text-embedding-3-small'
from module_kb.articles a
where a.deleted_at is null
  and exists (
    select 1 from module_kb.article_embeddings e where e.article_id = a.id
  )
on conflict (tenant_id, source_type, doc_id) do nothing;

insert into search.chunks (
  id, tenant_id, source_type, doc_id, chunk_index, module, scope_id,
  owner_user_id, occurred_at, metadata, text, embedding, embedding_model
)
select
  e.article_id || '::chunk::' || e.chunk_index,
  e.tenant_id,
  'kb.article',
  e.article_id,
  e.chunk_index,
  'knowledge-base',
  a.scope_id,
  null,
  a.updated_at,
  jsonb_build_object('kb_id', a.kb_id),
  e.chunk_text,
  e.embedding,
  'openai/text-embedding-3-small'
from module_kb.article_embeddings e
join module_kb.articles a on a.id = e.article_id
where a.deleted_at is null
on conflict (tenant_id, id) do nothing;

-- Legacy surface teardown — the retrieval service owns search now.
drop function if exists module_kb.search_kb_embeddings;
drop function if exists module_kb.kb_embedding_index_status;
drop table if exists module_kb.article_embeddings;
