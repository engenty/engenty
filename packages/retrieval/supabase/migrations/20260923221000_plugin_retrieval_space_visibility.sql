-- Retrieval: `owner` visibility becomes `space` (PLAN-space-owned-connections.md).
--
-- Mail and other records kept against a connected account follow the account:
-- it belongs to a Space, so its documents are visible to that Space's members
-- and agents. The owner-or-org rule (`owner_user_id` null = everyone) goes.
-- Fresh start: documents indexed under the owner rule carry no space and are
-- dropped; the source re-ingests them on its next sync.

SET check_function_bodies = false;

DELETE FROM search.chunks
WHERE source_type IN (
  SELECT source_type FROM search.source_visibility WHERE visibility = 'owner'
);
DELETE FROM search.documents
WHERE source_type IN (
  SELECT source_type FROM search.source_visibility WHERE visibility = 'owner'
);

ALTER TABLE search.source_visibility
  DROP CONSTRAINT source_visibility_visibility_check;
UPDATE search.source_visibility SET visibility = 'space', updated_at = now()
WHERE visibility = 'owner';
ALTER TABLE search.source_visibility
  ADD CONSTRAINT source_visibility_visibility_check
    CHECK (visibility = ANY (ARRAY['tenant'::text, 'space'::text, 'user'::text]));

CREATE OR REPLACE FUNCTION search.query_chunks(p_tenant_id uuid, p_user_id uuid, p_scope_id text, p_query text, p_query_embedding text DEFAULT NULL::text, p_embedding_model text DEFAULT NULL::text, p_modules text[] DEFAULT NULL::text[], p_source_types text[] DEFAULT NULL::text[], p_metadata jsonb DEFAULT NULL::jsonb, p_occurred_after timestamp with time zone DEFAULT NULL::timestamp with time zone, p_occurred_before timestamp with time zone DEFAULT NULL::timestamp with time zone, p_limit integer DEFAULT 25, p_offset integer DEFAULT 0, p_vector_threshold double precision DEFAULT 0.62, p_trigram_threshold double precision DEFAULT 0.30, p_use_trigram boolean DEFAULT false, p_space_ids uuid[] DEFAULT NULL::uuid[]) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    AS $$
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
        -- covers every document that is not space-scoped (contacts, KB), so
        -- behaviour is unchanged for them. `p_space_ids is null` means the CALLER did not
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
          or (sv.visibility = 'user'
              and (p_user_id is null or c.owner_user_id = p_user_id))
          -- `space`: a document kept against a Space's account (mail) is
          -- visible to that Space's members and agents only. A person must be
          -- a member (a named space never widens past membership); a call
          -- that names neither a person nor a space sees none of it.
          or (sv.visibility = 'space'
              and d.space_id is not null
              and (p_space_ids is not null or p_user_id is not null)
              and (p_space_ids is null or d.space_id = any(p_space_ids))
              and (
                p_user_id is null
                or exists (
                  select 1
                  from core.spaces s
                  where s.id = d.space_id
                    and s.tenant_id = p_tenant_id
                    and s.deleted_at is null
                    and (
                      s.owner_user_id = p_user_id
                      or exists (
                        select 1
                        from core.space_member mem
                        where mem.tenant_id = s.tenant_id
                          and mem.space_id = s.id
                          and mem.user_id = p_user_id
                      )
                    )
                )
              ))
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


RESET check_function_bodies;
