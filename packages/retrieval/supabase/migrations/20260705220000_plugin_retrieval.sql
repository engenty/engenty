-- retrieval: consolidated baseline.
-- Replaces 3 migration(s) (20260705220000..20260815010000),
-- dumped from a database with the full history applied. Existing databases
-- have this version marked applied and never run it; it is the fresh-install
-- path only.
SET check_function_bodies = false;

--
-- Name: search; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA search;

--
-- Name: query_chunks(uuid, uuid, text, text, text, text, text[], text[], jsonb, timestamp with time zone, timestamp with time zone, integer, integer, double precision, double precision, boolean, uuid[]); Type: FUNCTION; Schema: search; Owner: -
--

CREATE FUNCTION search.query_chunks(p_tenant_id uuid, p_user_id uuid, p_scope_id text, p_query text, p_query_embedding text DEFAULT NULL::text, p_embedding_model text DEFAULT NULL::text, p_modules text[] DEFAULT NULL::text[], p_source_types text[] DEFAULT NULL::text[], p_metadata jsonb DEFAULT NULL::jsonb, p_occurred_after timestamp with time zone DEFAULT NULL::timestamp with time zone, p_occurred_before timestamp with time zone DEFAULT NULL::timestamp with time zone, p_limit integer DEFAULT 25, p_offset integer DEFAULT 0, p_vector_threshold double precision DEFAULT 0.62, p_trigram_threshold double precision DEFAULT 0.30, p_use_trigram boolean DEFAULT false, p_space_ids uuid[] DEFAULT NULL::uuid[]) RETURNS jsonb
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
$$;

--
-- Name: chunks; Type: TABLE; Schema: search; Owner: -
--

CREATE TABLE search.chunks (
    id text NOT NULL,
    tenant_id uuid NOT NULL,
    source_type text NOT NULL,
    doc_id text NOT NULL,
    chunk_index integer NOT NULL,
    module text NOT NULL,
    scope_id text DEFAULT 'default'::text NOT NULL,
    owner_user_id uuid,
    occurred_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    text text NOT NULL,
    fts tsvector GENERATED ALWAYS AS (to_tsvector('simple'::regconfig, text)) STORED,
    embedding public.vector(1536),
    embedding_model text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: documents; Type: TABLE; Schema: search; Owner: -
--

CREATE TABLE search.documents (
    tenant_id uuid NOT NULL,
    source_type text NOT NULL,
    doc_id text NOT NULL,
    module text NOT NULL,
    scope_id text DEFAULT 'default'::text NOT NULL,
    owner_user_id uuid,
    title text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    entity_refs text[] DEFAULT '{}'::text[] NOT NULL,
    occurred_at timestamp with time zone,
    content_updated_at timestamp with time zone NOT NULL,
    indexed_at timestamp with time zone DEFAULT now() NOT NULL,
    embedding_model text,
    space_id uuid
);

--
-- Name: source_visibility; Type: TABLE; Schema: search; Owner: -
--

CREATE TABLE search.source_visibility (
    source_type text NOT NULL,
    module text NOT NULL,
    visibility text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT source_visibility_visibility_check CHECK ((visibility = ANY (ARRAY['tenant'::text, 'owner'::text, 'user'::text])))
);

--
-- Name: chunks chunks_pkey; Type: CONSTRAINT; Schema: search; Owner: -
--

ALTER TABLE ONLY search.chunks
    ADD CONSTRAINT chunks_pkey PRIMARY KEY (tenant_id, id);

--
-- Name: documents documents_pkey; Type: CONSTRAINT; Schema: search; Owner: -
--

ALTER TABLE ONLY search.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (tenant_id, source_type, doc_id);

--
-- Name: source_visibility source_visibility_pkey; Type: CONSTRAINT; Schema: search; Owner: -
--

ALTER TABLE ONLY search.source_visibility
    ADD CONSTRAINT source_visibility_pkey PRIMARY KEY (source_type);

--
-- Name: documents_tenant_space_idx; Type: INDEX; Schema: search; Owner: -
--

CREATE INDEX documents_tenant_space_idx ON search.documents USING btree (tenant_id, space_id) WHERE (space_id IS NOT NULL);

--
-- Name: idx_search_chunks_fts; Type: INDEX; Schema: search; Owner: -
--

CREATE INDEX idx_search_chunks_fts ON search.chunks USING gin (fts);

--
-- Name: idx_search_chunks_metadata; Type: INDEX; Schema: search; Owner: -
--

CREATE INDEX idx_search_chunks_metadata ON search.chunks USING gin (metadata jsonb_path_ops);

--
-- Name: idx_search_chunks_source_time; Type: INDEX; Schema: search; Owner: -
--

CREATE INDEX idx_search_chunks_source_time ON search.chunks USING btree (tenant_id, source_type, occurred_at DESC);

--
-- Name: idx_search_chunks_vector; Type: INDEX; Schema: search; Owner: -
--

CREATE INDEX idx_search_chunks_vector ON search.chunks USING hnsw (embedding public.vector_cosine_ops);

--
-- Name: idx_search_documents_module; Type: INDEX; Schema: search; Owner: -
--

CREATE INDEX idx_search_documents_module ON search.documents USING btree (tenant_id, module, source_type);

--
-- Name: chunks chunks_tenant_id_fkey; Type: FK CONSTRAINT; Schema: search; Owner: -
--

ALTER TABLE ONLY search.chunks
    ADD CONSTRAINT chunks_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: chunks chunks_tenant_id_source_type_doc_id_fkey; Type: FK CONSTRAINT; Schema: search; Owner: -
--

ALTER TABLE ONLY search.chunks
    ADD CONSTRAINT chunks_tenant_id_source_type_doc_id_fkey FOREIGN KEY (tenant_id, source_type, doc_id) REFERENCES search.documents(tenant_id, source_type, doc_id) ON DELETE CASCADE;

--
-- Name: documents documents_tenant_id_fkey; Type: FK CONSTRAINT; Schema: search; Owner: -
--

ALTER TABLE ONLY search.documents
    ADD CONSTRAINT documents_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: chunks; Type: ROW SECURITY; Schema: search; Owner: -
--

ALTER TABLE search.chunks ENABLE ROW LEVEL SECURITY;

--
-- Name: documents; Type: ROW SECURITY; Schema: search; Owner: -
--

ALTER TABLE search.documents ENABLE ROW LEVEL SECURITY;

--
-- Name: source_visibility; Type: ROW SECURITY; Schema: search; Owner: -
--

ALTER TABLE search.source_visibility ENABLE ROW LEVEL SECURITY;

--
-- Name: source_visibility srv_read_visibility; Type: POLICY; Schema: search; Owner: -
--

CREATE POLICY srv_read_visibility ON search.source_visibility FOR SELECT TO engenty_server USING (true);

--
-- Name: chunks srv_tenant_isolation; Type: POLICY; Schema: search; Owner: -
--

CREATE POLICY srv_tenant_isolation ON search.chunks TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: documents srv_tenant_isolation; Type: POLICY; Schema: search; Owner: -
--

CREATE POLICY srv_tenant_isolation ON search.documents TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: SCHEMA search; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA search TO service_role;
GRANT USAGE ON SCHEMA search TO engenty_server;

--
-- Name: FUNCTION query_chunks(p_tenant_id uuid, p_user_id uuid, p_scope_id text, p_query text, p_query_embedding text, p_embedding_model text, p_modules text[], p_source_types text[], p_metadata jsonb, p_occurred_after timestamp with time zone, p_occurred_before timestamp with time zone, p_limit integer, p_offset integer, p_vector_threshold double precision, p_trigram_threshold double precision, p_use_trigram boolean, p_space_ids uuid[]); Type: ACL; Schema: search; Owner: -
--

REVOKE ALL ON FUNCTION search.query_chunks(p_tenant_id uuid, p_user_id uuid, p_scope_id text, p_query text, p_query_embedding text, p_embedding_model text, p_modules text[], p_source_types text[], p_metadata jsonb, p_occurred_after timestamp with time zone, p_occurred_before timestamp with time zone, p_limit integer, p_offset integer, p_vector_threshold double precision, p_trigram_threshold double precision, p_use_trigram boolean, p_space_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION search.query_chunks(p_tenant_id uuid, p_user_id uuid, p_scope_id text, p_query text, p_query_embedding text, p_embedding_model text, p_modules text[], p_source_types text[], p_metadata jsonb, p_occurred_after timestamp with time zone, p_occurred_before timestamp with time zone, p_limit integer, p_offset integer, p_vector_threshold double precision, p_trigram_threshold double precision, p_use_trigram boolean, p_space_ids uuid[]) TO service_role;
GRANT ALL ON FUNCTION search.query_chunks(p_tenant_id uuid, p_user_id uuid, p_scope_id text, p_query text, p_query_embedding text, p_embedding_model text, p_modules text[], p_source_types text[], p_metadata jsonb, p_occurred_after timestamp with time zone, p_occurred_before timestamp with time zone, p_limit integer, p_offset integer, p_vector_threshold double precision, p_trigram_threshold double precision, p_use_trigram boolean, p_space_ids uuid[]) TO engenty_server;

--
-- Name: TABLE chunks; Type: ACL; Schema: search; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE search.chunks TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE search.chunks TO engenty_server;

--
-- Name: TABLE documents; Type: ACL; Schema: search; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE search.documents TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE search.documents TO engenty_server;

--
-- Name: TABLE source_visibility; Type: ACL; Schema: search; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE search.source_visibility TO service_role;
GRANT SELECT ON TABLE search.source_visibility TO engenty_server;

--
--

-- Rows these migrations seeded.

SET check_function_bodies = false;

--
-- Data for Name: documents; Type: TABLE DATA; Schema: search; Owner: postgres
--


--
-- Data for Name: chunks; Type: TABLE DATA; Schema: search; Owner: postgres
--


--
-- Data for Name: source_visibility; Type: TABLE DATA; Schema: search; Owner: postgres
--

-- Reference rows: `COPY … FROM stdin` cannot run through the
-- migration runner, which sends statements without a stdin stream.
insert into search.source_visibility (source_type, module, visibility, updated_at) values
  ('kb.article', 'knowledge-base', 'tenant', now()),
  ('inbox.message', 'inbox', 'owner', now()),
  ('contacts.contact', 'contacts', 'tenant', now()),
  ('ai.chat_session', 'ai', 'user', now())
on conflict do nothing;

--
--

RESET check_function_bodies;
