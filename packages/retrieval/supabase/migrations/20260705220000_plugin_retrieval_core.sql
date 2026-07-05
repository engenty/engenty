-- Retrieval service central schema (docs/wip/retrieval-service.md §5–§6).
-- Additive: no module table is touched. Service-role only — all reads flow
-- through search.query_chunks with auth-injected tenant/user.

create schema if not exists search;
create extension if not exists vector;
create extension if not exists pg_trgm;

-- Per-source visibility kind, maintained at registration time.
create table if not exists search.source_visibility (
  source_type text primary key,
  module text not null,
  visibility text not null check (visibility in ('tenant', 'owner', 'user')),
  updated_at timestamptz not null default now()
);

-- Doc-level bookkeeping: staleness tracking + cascade root for chunks.
create table if not exists search.documents (
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  source_type text not null,
  doc_id text not null,
  module text not null,
  scope_id text not null default 'default',
  owner_user_id uuid,
  title text,
  metadata jsonb not null default '{}',
  entity_refs text[] not null default '{}',
  occurred_at timestamptz,
  content_updated_at timestamptz not null,
  indexed_at timestamptz not null default now(),
  embedding_model text,
  primary key (tenant_id, source_type, doc_id)
);

create index if not exists idx_search_documents_module
  on search.documents (tenant_id, module, source_type);

create table if not exists search.chunks (
  -- Chunk ids are only doc-scoped ("<doc>::chunk::N") — the SAME id exists in
  -- every tenant indexing the same doc id, so the key must be tenant-scoped.
  id text not null,
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  source_type text not null,
  doc_id text not null,
  chunk_index int not null,
  module text not null,
  scope_id text not null default 'default',
  owner_user_id uuid,
  occurred_at timestamptz,
  metadata jsonb not null default '{}',
  text text not null,
  fts tsvector generated always as (to_tsvector('simple', text)) stored,
  embedding vector(1536),
  embedding_model text,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, id),
  foreign key (tenant_id, source_type, doc_id)
    references search.documents (tenant_id, source_type, doc_id) on delete cascade
);

create index if not exists idx_search_chunks_fts
  on search.chunks using gin (fts);
create index if not exists idx_search_chunks_vector
  on search.chunks using hnsw (embedding vector_cosine_ops);
create index if not exists idx_search_chunks_metadata
  on search.chunks using gin (metadata jsonb_path_ops);
create index if not exists idx_search_chunks_source_time
  on search.chunks (tenant_id, source_type, occurred_at desc);

grant usage on schema search to service_role;
grant select, insert, update, delete on search.source_visibility to service_role;
grant select, insert, update, delete on search.documents to service_role;
grant select, insert, update, delete on search.chunks to service_role;

alter table search.source_visibility enable row level security;
alter table search.documents enable row level security;
alter table search.chunks enable row level security;
-- No authenticated policies by design: service-role + RPC only.

-- Fusion query: weighted FTS (chunk body + doc title) + optional title
-- trigram + cosine similarity, per-row visibility from source_visibility.
-- Scoring copied from module_contacts.search_contacts / module_inbox.
-- search_messages (score = fts*2 + trigram + vector; keep row iff any
-- signal clears its threshold). Vector scores apply only to chunks embedded
-- with p_embedding_model — mismatched-model chunks stay lexical.
create or replace function search.query_chunks(
  p_tenant_id uuid,
  p_user_id uuid,
  p_scope_id text,
  p_query text,
  p_query_embedding text default null,
  p_embedding_model text default null,
  p_modules text[] default null,
  p_source_types text[] default null,
  p_metadata jsonb default null,
  p_occurred_after timestamptz default null,
  p_occurred_before timestamptz default null,
  p_limit int default 25,
  p_offset int default 0,
  p_vector_threshold double precision default 0.62,
  p_trigram_threshold double precision default 0.30,
  p_use_trigram boolean default false
)
returns jsonb
language plpgsql
stable
as $$
declare
  qemb vector(1536);
begin
  if p_query_embedding is not null and btrim(p_query_embedding) <> '' and p_query_embedding <> '[]' then
    begin
      qemb := p_query_embedding::vector;
    exception when others then
      qemb := null;
    end;
  end if;

  return (
    with params as (
      select
        nullif(trim(coalesce(p_query, '')), '') as raw_query,
        lower(nullif(trim(coalesce(p_query, '')), '')) as query_lower,
        websearch_to_tsquery('simple', nullif(trim(coalesce(p_query, '')), '')) as tsq
    ),
    docs as (
      select
        c.id as chunk_id,
        c.chunk_index,
        c.doc_id,
        c.module,
        c.source_type,
        c.occurred_at,
        c.metadata,
        c.text,
        d.title,
        (
          setweight(to_tsvector('simple', coalesce(d.title, '')), 'A') || c.fts
        ) as search_vector,
        case
          when c.embedding is null then null
          when p_embedding_model is null then c.embedding
          when c.embedding_model = p_embedding_model then c.embedding
          else null
        end as embedding
      from search.chunks c
      join search.documents d
        on d.tenant_id = c.tenant_id
       and d.source_type = c.source_type
       and d.doc_id = c.doc_id
      join search.source_visibility sv on sv.source_type = c.source_type
      where c.tenant_id = p_tenant_id
        and c.scope_id = p_scope_id
        and (p_modules is null or c.module = any(p_modules))
        and (p_source_types is null or c.source_type = any(p_source_types))
        and (p_metadata is null or c.metadata @> p_metadata)
        and (p_occurred_after is null or c.occurred_at >= p_occurred_after)
        and (p_occurred_before is null or c.occurred_at <= p_occurred_before)
        and (
          sv.visibility = 'tenant'
          or p_user_id is null
          or (sv.visibility = 'owner'
              and (c.owner_user_id is null or c.owner_user_id = p_user_id))
          or (sv.visibility = 'user' and c.owner_user_id = p_user_id)
        )
    ),
    scored as (
      select
        d.*,
        case
          when params.tsq is null then 0::double precision
          else ts_rank_cd(d.search_vector, params.tsq)::double precision
        end as fts_score,
        case
          when not p_use_trigram or params.query_lower is null or d.title is null
            then 0::double precision
          else greatest(
            similarity(lower(d.title), params.query_lower),
            word_similarity(params.query_lower, lower(d.title))
          )::double precision
        end as trigram_score,
        case
          when qemb is null or d.embedding is null then 0::double precision
          else (1.0 - (d.embedding <=> qemb))::double precision
        end as vector_score
      from docs d
      cross join params
    ),
    validated as (
      select
        *,
        (fts_score * 2.0 + trigram_score + vector_score) as score,
        array_remove(array[
          case when fts_score > 0 then 'text' end,
          case when trigram_score >= p_trigram_threshold then 'fuzzy' end,
          case when vector_score >= p_vector_threshold then 'semantic' end
        ], null) as matched_fields
      from scored
      where
        (select raw_query from params) is null
        or fts_score > 0
        or trigram_score >= p_trigram_threshold
        or vector_score >= p_vector_threshold
    ),
    ordered as (
      select *, row_number() over (
        order by score desc, occurred_at desc nulls last, chunk_id asc
      ) as rn
      from validated
    )
    select jsonb_build_object(
      'total', (select count(*)::bigint from validated),
      'matches', coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'chunk_id', chunk_id,
              'chunk_index', chunk_index,
              'doc_id', doc_id,
              'module', module,
              'source_type', source_type,
              'title', title,
              'text', text,
              'occurred_at', occurred_at,
              'metadata', metadata,
              'score', score,
              'matched_fields', to_jsonb(matched_fields),
              'source_scores', jsonb_build_object(
                'fts', fts_score,
                'trigram', trigram_score,
                'vector', vector_score
              )
            )
            order by rn
          )
          from ordered
          where rn > p_offset and rn <= p_offset + p_limit
        ),
        '[]'::jsonb
      )
    )
  );
end;
$$;

grant execute on function search.query_chunks(
  uuid, uuid, text, text, text, text, text[], text[], jsonb,
  timestamptz, timestamptz, int, int, double precision, double precision, boolean
) to service_role;
