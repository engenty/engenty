-- Inbox hybrid search: per-message embeddings + FTS/vector fusion in
-- `search_messages` (docs/wip/inbox-module.md — "semantic can be layered
-- later without changing the tool"). Mirrors the contacts pattern
-- (module_contacts.contact_search_embeddings / search_contacts).

create extension if not exists vector;

-- One embedding row per message. `owner_user_id` is denormalized from the
-- message so RLS keeps personal-connection embeddings owner-only — same
-- visibility split as module_inbox.messages, from the first vector row.
create table if not exists module_inbox.message_embeddings (
  message_id text primary key references module_inbox.messages(id) on delete cascade,
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  scope_id text not null,
  owner_user_id uuid,
  document_text text not null,
  embedding vector(1536),
  embedding_model text,
  updated_at timestamptz not null default now()
);

create index if not exists idx_module_inbox_message_embeddings_scope
  on module_inbox.message_embeddings (tenant_id, scope_id);

create index if not exists idx_module_inbox_message_embeddings_vector
  on module_inbox.message_embeddings using hnsw (embedding vector_cosine_ops);

grant select, insert, update, delete on module_inbox.message_embeddings to service_role;

alter table module_inbox.message_embeddings enable row level security;

create policy message_embeddings_read_visible on module_inbox.message_embeddings
for select using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
  and (owner_user_id is null or owner_user_id = auth.uid())
);

-- Signature changes (new hybrid params) — drop the lexical-only version
-- instead of stacking an overload PostgREST could not disambiguate.
drop function if exists module_inbox.search_messages(uuid, text, uuid, text, int, int, uuid, text);

-- Hybrid message search: weighted FTS + cosine similarity over the optional
-- per-message embedding, with the owner-visibility filter applied in every
-- version of the index (p_user_id null = service caller, sees everything).
-- `p_query_embedding` null = lexical-only (same behavior as v1).
create or replace function module_inbox.search_messages(
  p_tenant_id uuid,
  p_scope_id text,
  p_user_id uuid,
  p_query text,
  p_limit int,
  p_offset int,
  p_connection_id uuid default null,
  p_status text default null,
  p_query_embedding text default null,
  p_vector_threshold double precision default 0.62
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
        websearch_to_tsquery('simple', nullif(trim(coalesce(p_query, '')), '')) as tsq
    ),
    docs as (
      select
        m.id,
        m.thread_id,
        m.received_at,
        (
          setweight(to_tsvector('simple', coalesce(m.subject, '')), 'A') ||
          setweight(to_tsvector('simple', coalesce(m.from_email, '') || ' ' || coalesce(m.from_name, '')), 'B') ||
          setweight(to_tsvector('simple', coalesce(m.body_text, '')), 'D')
        ) as search_vector,
        e.embedding
      from module_inbox.messages m
      left join module_inbox.message_embeddings e on e.message_id = m.id
      where m.tenant_id = p_tenant_id
        and m.scope_id = p_scope_id
        and (m.owner_user_id is null or p_user_id is null or m.owner_user_id = p_user_id)
        and (p_connection_id is null or m.connection_id = p_connection_id)
        and (p_status is null or m.status = p_status)
    ),
    scored as (
      select
        d.id,
        d.thread_id,
        d.received_at,
        case
          when params.tsq is null then 0::double precision
          else ts_rank_cd(d.search_vector, params.tsq)::double precision
        end as fts_score,
        case
          when qemb is null or d.embedding is null then 0::double precision
          else (1.0 - (d.embedding <=> qemb))::double precision
        end as vector_score,
        array_remove(array[
          case when params.tsq is not null and d.search_vector @@ params.tsq then 'text' end,
          case when qemb is not null and d.embedding is not null and (1.0 - (d.embedding <=> qemb)) >= p_vector_threshold then 'semantic' end
        ], null) as matched_fields
      from docs d
      cross join params
    ),
    validated as (
      select
        *,
        (fts_score * 2.0 + vector_score) as score
      from scored
      where
        nullif(trim(coalesce(p_query, '')), '') is null
        or fts_score > 0
        or vector_score >= p_vector_threshold
    ),
    ordered as (
      select *, row_number() over (
        order by score desc, received_at desc nulls last, id asc
      ) as rn
      from validated
    )
    select jsonb_build_object(
      'total', (select count(*)::bigint from validated),
      'matches', coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', id,
              'thread_id', thread_id,
              'score', score,
              'matched_fields', to_jsonb(matched_fields),
              'match_reason',
                case
                  when fts_score > 0 then 'text'
                  when vector_score >= p_vector_threshold then 'semantic'
                  else 'filtered'
                end,
              'source_scores', jsonb_build_object(
                'fts', fts_score,
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

grant execute on function module_inbox.search_messages(uuid, text, uuid, text, int, int, uuid, text, text, double precision) to service_role;
