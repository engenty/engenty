-- Space containment for the retrieval index (PLAN-spaces.md Phase P4).
--
-- The leak this closes: `search.documents` had no space at all, and the KB
-- retrieval source indexes every article tenant-wide. Knowledge bases ARE
-- space-scoped (`module_kb.knowledge_bases.space_id`, Phase 6b), so a private
-- space's articles were reachable through `/api/workspace-search` by anyone in
-- the tenant. Latent rather than active today only because no KB backfill has
-- run here — the code path was already live.
--
-- Search is the surface where a private space dies quietly: it never passes
-- through a `/s/<key>` route, so neither `requireSpaceAccess` nor the module
-- route gate sees it.
--
-- `space_id is null` = not space-scoped (contacts, inbox) or indexed before this
-- column existed: unchanged behaviour, which is what makes this deployable
-- without a re-index. `p_space_ids is null` = the CALLER did not scope the
-- search (module tools, admin diagnostics keep working); the user-facing route
-- always passes the set.
--
-- Idempotent: guarded add, replaceable function.

alter table search.documents
  add column if not exists space_id uuid;

create index if not exists documents_tenant_space_idx
  on search.documents (tenant_id, space_id) where space_id is not null;

CREATE OR REPLACE FUNCTION search.query_chunks(p_tenant_id uuid, p_user_id uuid, p_scope_id text, p_query text, p_query_embedding text DEFAULT NULL::text, p_embedding_model text DEFAULT NULL::text, p_modules text[] DEFAULT NULL::text[], p_source_types text[] DEFAULT NULL::text[], p_metadata jsonb DEFAULT NULL::jsonb, p_occurred_after timestamp with time zone DEFAULT NULL::timestamp with time zone, p_occurred_before timestamp with time zone DEFAULT NULL::timestamp with time zone, p_limit integer DEFAULT 25, p_offset integer DEFAULT 0, p_vector_threshold double precision DEFAULT 0.62, p_trigram_threshold double precision DEFAULT 0.30, p_use_trigram boolean DEFAULT false, p_space_ids uuid[] DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
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
        -- Space containment (PLAN-spaces.md Phase P4). `d.space_id is null`
        -- covers every document that is not space-scoped (contacts, inbox)
        -- and every row indexed before this column existed, so behaviour is
        -- unchanged for them. `p_space_ids is null` means the CALLER did not
        -- scope the search -- module tools and admin diagnostics -- and is
        -- why the user-facing route must always pass the set.
        and (
          p_space_ids is null
          or d.space_id is null
          or d.space_id = any(p_space_ids)
        )
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
$function$

;

notify pgrst, 'reload schema';

-- Drop the pre-space signature.
--
-- Adding a parameter created an OVERLOAD rather than replacing the function, and
-- PostgREST calls this by NAMED arguments: a request that omits `p_space_ids`
-- matches both, which is an ambiguity error at best and silently the unfiltered
-- one at worst. Exactly the shape of bug this phase exists to prevent, so the old
-- signature goes rather than being left "harmlessly" in place.
drop function if exists search.query_chunks(
  uuid, uuid, text, text, text, text, text[], text[], jsonb,
  timestamptz, timestamptz, integer, integer,
  double precision, double precision, boolean
);

notify pgrst, 'reload schema';
