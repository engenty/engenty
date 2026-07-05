-- Contacts search cutover to the central retrieval service (Phase 4,
-- docs/wip/retrieval-service.md). Copies the per-contact embeddings into
-- search.documents/chunks (single chunk per contact, same 1536 dims — no
-- re-embedding), then drops the module-local vector surface and the
-- search_contacts RPC. After this migration the legacy contacts search SQL
-- surface no longer exists; the fused query (FTS + title trigram + vector)
-- runs in search.query_chunks with type/roles pushed down as chunk metadata.

-- Visibility registration (idempotent; the service also upserts at boot).
insert into search.source_visibility (source_type, module, visibility)
values ('contacts.contact', 'contacts', 'tenant')
on conflict (source_type) do update set
  module = excluded.module,
  visibility = excluded.visibility,
  updated_at = now();

-- Doc rows for every live contact that has an embedding row. Title carries
-- the display_name (trigram target); metadata carries the type plus the
-- multi-valued roles array so `{"roles":["client"]}` containment filters
-- match supersets. occurred_at stays null — contacts have no content time.
insert into search.documents (
  tenant_id, source_type, doc_id, module, scope_id, owner_user_id,
  title, metadata, occurred_at, content_updated_at, indexed_at, embedding_model
)
select
  c.tenant_id,
  'contacts.contact',
  c.id,
  'contacts',
  c.scope_id,
  null,
  c.display_name,
  jsonb_build_object(
    'type', c.type,
    'roles', coalesce(
      (
        select jsonb_agg(cr.role order by cr.role)
        from module_contacts.contact_roles cr
        where cr.contact_id = c.id
      ),
      '[]'::jsonb
    )
  ),
  null,
  c.updated_at,
  now(),
  coalesce(e.embedding_model, 'openai/text-embedding-3-small')
from module_contacts.contact_search_embeddings e
join module_contacts.contacts c on c.id = e.contact_id
where c.deleted_at is null
on conflict (tenant_id, source_type, doc_id) do nothing;

insert into search.chunks (
  id, tenant_id, source_type, doc_id, chunk_index, module, scope_id,
  owner_user_id, occurred_at, metadata, text, embedding, embedding_model
)
select
  e.contact_id || '::chunk::0',
  c.tenant_id,
  'contacts.contact',
  e.contact_id,
  0,
  'contacts',
  c.scope_id,
  null,
  null,
  jsonb_build_object(
    'type', c.type,
    'roles', coalesce(
      (
        select jsonb_agg(cr.role order by cr.role)
        from module_contacts.contact_roles cr
        where cr.contact_id = c.id
      ),
      '[]'::jsonb
    )
  ),
  e.document_text,
  e.embedding,
  coalesce(e.embedding_model, 'openai/text-embedding-3-small')
from module_contacts.contact_search_embeddings e
join module_contacts.contacts c on c.id = e.contact_id
where c.deleted_at is null
on conflict (tenant_id, id) do nothing;

-- Legacy surface teardown — the retrieval service owns contact search now.
-- Both historical overloads of the RPC exist (single- and multi-embedding);
-- an unqualified drop would be ambiguous.
drop function if exists module_contacts.search_contacts(
  uuid, text, text, int, int, text, text, text,
  double precision, double precision
);
drop function if exists module_contacts.search_contacts(
  uuid, text, text, int, int, text, text, text, text, text[],
  double precision, double precision
);
drop table if exists module_contacts.contact_search_embeddings;
