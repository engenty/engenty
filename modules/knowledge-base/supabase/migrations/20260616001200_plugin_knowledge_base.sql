-- knowledge_base: consolidated baseline.
-- Replaces 12 migration(s) (20260616001200..20260907140300),
-- dumped from a database with the full history applied. Existing databases
-- have this version marked applied and never run it; it is the fresh-install
-- path only.
SET check_function_bodies = false;

--
-- Name: module_kb; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA module_kb;

--
-- Name: kb_articles_fts_search(uuid, text, text, text, integer, integer, text, boolean, text); Type: FUNCTION; Schema: module_kb; Owner: -
--

CREATE FUNCTION module_kb.kb_articles_fts_search(p_tenant_id uuid, p_scope_id text, p_kb_id text, p_query text, p_limit integer, p_offset integer, p_parent_article_id text DEFAULT NULL::text, p_top_level_only boolean DEFAULT false, p_status text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE sql STABLE
    AS $$
  with q as (
    select websearch_to_tsquery('simple', nullif(trim(p_query), '')) as tsq
  ),
  base as (
    select
      a.id,
      ts_rank_cd(
        to_tsvector('simple', coalesce(a.title, '') || ' ' || coalesce(a.content_markdown, '')),
        q.tsq
      ) as rank
    from module_kb.articles a
    cross join q
    where a.tenant_id = p_tenant_id
      and a.scope_id = p_scope_id
      and a.kb_id = p_kb_id
      and a.deleted_at is null
      and q.tsq is not null
      and to_tsvector('simple', coalesce(a.title, '') || ' ' || coalesce(a.content_markdown, '')) @@ q.tsq
      and (p_top_level_only is not true or a.parent_article_id is null)
      and (
        p_parent_article_id is null
        or a.parent_article_id = p_parent_article_id
      )
      and (p_status is null or a.status = p_status)
  ),
  ordered as (
    select id, rank from base order by rank desc, id asc
  ),
  numbered as (
    select id, row_number() over () as rn from ordered
  )
  select jsonb_build_object(
    'total', (select count(*)::bigint from ordered),
    'ids', coalesce(
      (
        select jsonb_agg(id order by rn)
        from numbered
        where rn > p_offset and rn <= p_offset + p_limit
      ),
      '[]'::jsonb
    )
  );
$$;

--
-- Name: kb_articles_fts_suggest(uuid, text, text, text, integer); Type: FUNCTION; Schema: module_kb; Owner: -
--

CREATE FUNCTION module_kb.kb_articles_fts_suggest(p_tenant_id uuid, p_scope_id text, p_kb_id text, p_query text, p_limit integer) RETURNS jsonb
    LANGUAGE sql STABLE
    AS $$
  with q as (
    select websearch_to_tsquery('simple', nullif(trim(p_query), '')) as tsq
  ),
  base as (
    select
      a.id,
      a.title,
      a.kb_id,
      ts_rank_cd(
        to_tsvector('simple', coalesce(a.title, '') || ' ' || coalesce(a.content_markdown, '')),
        q.tsq
      ) as rank,
      ts_headline(
        'simple',
        coalesce(a.title, '') || ' ' || left(coalesce(a.content_markdown, ''), 4000),
        q.tsq,
        'StartSel=<<, StopSel=>>, MaxFragments=2, MinWords=5, MaxWords=25'
      ) as headline
    from module_kb.articles a
    cross join q
    where a.tenant_id = p_tenant_id
      and a.scope_id = p_scope_id
      and a.kb_id = p_kb_id
      and a.deleted_at is null
      and q.tsq is not null
      and to_tsvector('simple', coalesce(a.title, '') || ' ' || coalesce(a.content_markdown, '')) @@ q.tsq
  )
  select coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', id,
          'title', title,
          'kb_id', kb_id,
          'rank', rank,
          'headline', headline
        )
        order by rank desc, title asc
      )
      from (select * from base order by rank desc, title asc limit p_limit) s
    ),
    '[]'::jsonb
  );
$$;

--
-- Name: kb_seed_default_category(); Type: FUNCTION; Schema: module_kb; Owner: -
--

CREATE FUNCTION module_kb.kb_seed_default_category() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  insert into module_kb.categories (
    id,
    tenant_id,
    scope_id,
    kb_id,
    parent_id,
    name,
    slug,
    description,
    sort_order,
    is_default,
    created_at,
    updated_at
  )
  values (
    'kb-cat-default-' || new.id,
    new.tenant_id,
    new.scope_id,
    new.id,
    null,
    'General',
    'general',
    null,
    0,
    true,
    now(),
    now()
  )
  on conflict do nothing;
  return new;
end;
$$;

--
-- Name: article_comments; Type: TABLE; Schema: module_kb; Owner: -
--

CREATE TABLE module_kb.article_comments (
    id text NOT NULL,
    tenant_id uuid NOT NULL,
    scope_id text NOT NULL,
    article_id text NOT NULL,
    content text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: article_tags; Type: TABLE; Schema: module_kb; Owner: -
--

CREATE TABLE module_kb.article_tags (
    article_id text NOT NULL,
    tag_id text NOT NULL,
    tenant_id uuid NOT NULL,
    scope_id text NOT NULL
);

--
-- Name: article_templates; Type: TABLE; Schema: module_kb; Owner: -
--

CREATE TABLE module_kb.article_templates (
    id text NOT NULL,
    tenant_id uuid NOT NULL,
    scope_id text NOT NULL,
    kb_id text NOT NULL,
    name text NOT NULL,
    description text,
    property_definitions jsonb DEFAULT '[]'::jsonb NOT NULL,
    content_json jsonb,
    content_markdown text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);

--
-- Name: article_versions; Type: TABLE; Schema: module_kb; Owner: -
--

CREATE TABLE module_kb.article_versions (
    id text NOT NULL,
    tenant_id uuid NOT NULL,
    scope_id text NOT NULL,
    article_id text NOT NULL,
    version integer NOT NULL,
    snapshot jsonb NOT NULL,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: articles; Type: TABLE; Schema: module_kb; Owner: -
--

CREATE TABLE module_kb.articles (
    id text NOT NULL,
    tenant_id uuid NOT NULL,
    scope_id text NOT NULL,
    kb_id text NOT NULL,
    title text NOT NULL,
    slug text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    content_json jsonb,
    content_markdown text,
    summary text,
    questions_answered jsonb DEFAULT '[]'::jsonb,
    original_document_url text,
    original_document_name text,
    created_by text,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    published_at timestamp with time zone,
    deleted_at timestamp with time zone,
    parent_article_id text,
    updated_by text,
    custom_properties jsonb DEFAULT '{}'::jsonb NOT NULL,
    locked_at timestamp with time zone,
    category_id text NOT NULL,
    template_mode text DEFAULT 'inherit'::text NOT NULL,
    template_id text,
    comments_mode text DEFAULT 'inherit'::text NOT NULL,
    CONSTRAINT articles_comments_mode_check CHECK ((comments_mode = ANY (ARRAY['inherit'::text, 'none'::text, 'enabled'::text, 'closed'::text]))),
    CONSTRAINT articles_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text, 'removed'::text]))),
    CONSTRAINT articles_template_mode_check CHECK ((template_mode = ANY (ARRAY['inherit'::text, 'none'::text, 'template'::text])))
);

ALTER TABLE ONLY module_kb.articles REPLICA IDENTITY FULL;

--
-- Name: COLUMN articles.updated_by; Type: COMMENT; Schema: module_kb; Owner: -
--

COMMENT ON COLUMN module_kb.articles.updated_by IS 'Principal (core user) id of the last editor; set by API on create/update.';

--
-- Name: attachments; Type: TABLE; Schema: module_kb; Owner: -
--

CREATE TABLE module_kb.attachments (
    id text NOT NULL,
    tenant_id uuid NOT NULL,
    scope_id text NOT NULL,
    article_id text NOT NULL,
    filename text NOT NULL,
    storage_key text NOT NULL,
    mime_type text DEFAULT 'application/octet-stream'::text NOT NULL,
    size_bytes bigint DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: categories; Type: TABLE; Schema: module_kb; Owner: -
--

CREATE TABLE module_kb.categories (
    id text NOT NULL,
    tenant_id uuid NOT NULL,
    scope_id text NOT NULL,
    kb_id text NOT NULL,
    parent_id text,
    name text NOT NULL,
    slug text NOT NULL,
    description text,
    sort_order integer DEFAULT 0 NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    cover jsonb,
    intro_json jsonb,
    intro_markdown text,
    outro_json jsonb,
    outro_markdown text,
    view_type text DEFAULT 'collection'::text NOT NULL,
    page_settings jsonb DEFAULT '{}'::jsonb NOT NULL,
    template_mode text DEFAULT 'inherit'::text NOT NULL,
    template_id text,
    icon text,
    comments_mode text DEFAULT 'inherit'::text NOT NULL,
    cover_inheritance text DEFAULT 'none'::text NOT NULL,
    CONSTRAINT categories_comments_mode_check CHECK ((comments_mode = ANY (ARRAY['inherit'::text, 'none'::text, 'enabled'::text, 'closed'::text]))),
    CONSTRAINT categories_cover_inheritance_check CHECK ((cover_inheritance = ANY (ARRAY['none'::text, 'direct_articles'::text, 'all_children'::text]))),
    CONSTRAINT categories_template_mode_check CHECK ((template_mode = ANY (ARRAY['inherit'::text, 'none'::text, 'template'::text]))),
    CONSTRAINT categories_view_type_check CHECK ((view_type = ANY (ARRAY['collection'::text, 'folder'::text])))
);

ALTER TABLE ONLY module_kb.categories REPLICA IDENTITY FULL;

--
-- Name: faq_tags; Type: TABLE; Schema: module_kb; Owner: -
--

CREATE TABLE module_kb.faq_tags (
    faq_id text NOT NULL,
    tag_id text NOT NULL,
    tenant_id uuid NOT NULL,
    scope_id text NOT NULL
);

--
-- Name: faq_versions; Type: TABLE; Schema: module_kb; Owner: -
--

CREATE TABLE module_kb.faq_versions (
    id text NOT NULL,
    tenant_id uuid NOT NULL,
    scope_id text NOT NULL,
    faq_id text NOT NULL,
    version integer NOT NULL,
    snapshot jsonb NOT NULL,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: faqs; Type: TABLE; Schema: module_kb; Owner: -
--

CREATE TABLE module_kb.faqs (
    id text NOT NULL,
    tenant_id uuid NOT NULL,
    scope_id text NOT NULL,
    kb_id text NOT NULL,
    question text NOT NULL,
    answer_json jsonb,
    answer_markdown text,
    sort_order integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    category_id text,
    CONSTRAINT faqs_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])))
);

--
-- Name: inbox_items; Type: TABLE; Schema: module_kb; Owner: -
--

CREATE TABLE module_kb.inbox_items (
    id text NOT NULL,
    tenant_id uuid NOT NULL,
    scope_id text NOT NULL,
    kb_id text NOT NULL,
    title text NOT NULL,
    source_type text DEFAULT 'paste'::text NOT NULL,
    source_url text,
    raw_markdown text,
    raw_text text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    triage_summary text,
    triage_metadata jsonb,
    status text DEFAULT 'new'::text NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone,
    promoted_article_id text,
    promoted_faq_id text,
    discarded_at timestamp with time zone,
    original_storage_path text,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT inbox_items_source_type_check CHECK ((source_type = ANY (ARRAY['paste'::text, 'url'::text, 'file'::text, 'chat'::text, 'other'::text]))),
    CONSTRAINT inbox_items_status_check CHECK ((status = ANY (ARRAY['new'::text, 'triaged'::text, 'needs_review'::text, 'promoted'::text, 'discarded'::text, 'failed'::text])))
);

--
-- Name: kb_activity_log; Type: TABLE; Schema: module_kb; Owner: -
--

CREATE TABLE module_kb.kb_activity_log (
    id text NOT NULL,
    tenant_id uuid NOT NULL,
    scope_id text NOT NULL,
    kb_id text,
    event_type text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    actor_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: kb_settings; Type: TABLE; Schema: module_kb; Owner: -
--

CREATE TABLE module_kb.kb_settings (
    tenant_id uuid NOT NULL,
    scope_id text NOT NULL,
    context jsonb DEFAULT '{}'::jsonb NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    value_string text,
    value_jsonb jsonb,
    value_numeric numeric,
    value_boolean boolean,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT kb_settings_type_check CHECK ((type = ANY (ARRAY['string'::text, 'numeric'::text, 'boolean'::text, 'json'::text]))),
    CONSTRAINT kb_settings_value_consistency CHECK ((((type = 'string'::text) AND (value_string IS NOT NULL)) OR ((type = 'numeric'::text) AND (value_numeric IS NOT NULL)) OR ((type = 'boolean'::text) AND (value_boolean IS NOT NULL)) OR ((type = 'json'::text) AND (value_jsonb IS NOT NULL))))
);

--
-- Name: kb_source_item_links; Type: TABLE; Schema: module_kb; Owner: -
--

CREATE TABLE module_kb.kb_source_item_links (
    id text NOT NULL,
    source_item_id text NOT NULL,
    href text NOT NULL,
    normalized_href text NOT NULL,
    link_type text NOT NULL,
    text text,
    title text,
    rel text,
    "position" integer DEFAULT 0 NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    tenant_id uuid NOT NULL,
    scope_id text NOT NULL,
    CONSTRAINT kb_source_item_links_link_type_check CHECK ((link_type = ANY (ARRAY['internal'::text, 'external'::text, 'anchor'::text, 'asset'::text])))
);

--
-- Name: kb_source_item_media; Type: TABLE; Schema: module_kb; Owner: -
--

CREATE TABLE module_kb.kb_source_item_media (
    id text NOT NULL,
    source_item_id text NOT NULL,
    source_url text NOT NULL,
    storage_object_key text,
    media_type text NOT NULL,
    content_type text,
    title text,
    description text,
    alt_text text,
    width integer,
    height integer,
    size_bytes bigint,
    content_hash text,
    "position" integer DEFAULT 0 NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    download_status text DEFAULT 'external'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    tenant_id uuid NOT NULL,
    scope_id text NOT NULL,
    CONSTRAINT kb_source_item_media_download_status_check CHECK ((download_status = ANY (ARRAY['external'::text, 'pending'::text, 'downloaded'::text, 'skipped'::text, 'failed'::text]))),
    CONSTRAINT kb_source_item_media_media_type_check CHECK ((media_type = ANY (ARRAY['image'::text, 'video'::text, 'audio'::text, 'iframe'::text, 'document'::text, 'other'::text])))
);

--
-- Name: kb_source_item_sections; Type: TABLE; Schema: module_kb; Owner: -
--

CREATE TABLE module_kb.kb_source_item_sections (
    id text NOT NULL,
    source_item_id text NOT NULL,
    kind text NOT NULL,
    title text,
    locator text,
    "position" integer DEFAULT 0 NOT NULL,
    content text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    tenant_id uuid NOT NULL,
    scope_id text NOT NULL,
    CONSTRAINT kb_source_item_sections_kind_check CHECK ((kind = ANY (ARRAY['html'::text, 'markdown'::text, 'text'::text])))
);

--
-- Name: kb_source_items; Type: TABLE; Schema: module_kb; Owner: -
--

CREATE TABLE module_kb.kb_source_items (
    id text NOT NULL,
    tenant_id uuid NOT NULL,
    scope_id text NOT NULL,
    kb_id text NOT NULL,
    source_id text NOT NULL,
    adapter_item_key text NOT NULL,
    title text,
    source_url text,
    locator text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    content_hash text,
    status text DEFAULT 'active'::text NOT NULL,
    inbox_item_id text,
    first_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone,
    missing_since timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT kb_source_items_status_check CHECK ((status = ANY (ARRAY['active'::text, 'ignored'::text, 'missing'::text, 'draft'::text, 'deleted'::text])))
);

--
-- Name: kb_source_runs; Type: TABLE; Schema: module_kb; Owner: -
--

CREATE TABLE module_kb.kb_source_runs (
    id text NOT NULL,
    tenant_id uuid NOT NULL,
    scope_id text NOT NULL,
    kb_id text NOT NULL,
    source_id text NOT NULL,
    trigger text NOT NULL,
    status text DEFAULT 'running'::text NOT NULL,
    created_items integer DEFAULT 0 NOT NULL,
    updated_items integer DEFAULT 0 NOT NULL,
    skipped_items integer DEFAULT 0 NOT NULL,
    error text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    CONSTRAINT kb_source_runs_status_check CHECK ((status = ANY (ARRAY['running'::text, 'succeeded'::text, 'skipped'::text, 'failed'::text]))),
    CONSTRAINT kb_source_runs_trigger_check CHECK ((trigger = ANY (ARRAY['manual'::text, 'schedule'::text, 'webhook'::text])))
);

--
-- Name: kb_sources; Type: TABLE; Schema: module_kb; Owner: -
--

CREATE TABLE module_kb.kb_sources (
    id text NOT NULL,
    tenant_id uuid NOT NULL,
    scope_id text NOT NULL,
    kb_id text NOT NULL,
    adapter_id text NOT NULL,
    name text NOT NULL,
    settings jsonb DEFAULT '{}'::jsonb NOT NULL,
    schedule jsonb DEFAULT '{"enabled": false, "timezone": "UTC", "interval_minutes": null}'::jsonb NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    missing_item_strategy text DEFAULT 'ignore'::text NOT NULL,
    webhook_token_hash text,
    last_run_at timestamp with time zone,
    last_run_status text,
    last_error text,
    next_run_at timestamp with time zone,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    ingest_config jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT kb_sources_adapter_id_check CHECK ((adapter_id = ANY (ARRAY['url'::text, 'sitemap'::text, 'web_index'::text, 'firecrawl_url'::text, 'manual'::text, 'file_upload'::text]))),
    CONSTRAINT kb_sources_last_run_status_check CHECK ((last_run_status = ANY (ARRAY['running'::text, 'succeeded'::text, 'skipped'::text, 'failed'::text]))),
    CONSTRAINT kb_sources_missing_item_strategy_check CHECK ((missing_item_strategy = ANY (ARRAY['ignore'::text, 'mark_missing'::text, 'set_draft'::text, 'delete'::text]))),
    CONSTRAINT kb_sources_status_check CHECK ((status = ANY (ARRAY['active'::text, 'paused'::text, 'failed'::text])))
);

--
-- Name: knowledge_bases; Type: TABLE; Schema: module_kb; Owner: -
--

CREATE TABLE module_kb.knowledge_bases (
    id text NOT NULL,
    tenant_id uuid NOT NULL,
    scope_id text NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    description text,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    article_property_definitions jsonb DEFAULT '[]'::jsonb NOT NULL,
    comments_mode text DEFAULT 'enabled'::text NOT NULL,
    space_id uuid NOT NULL,
    CONSTRAINT knowledge_bases_comments_mode_check CHECK ((comments_mode = ANY (ARRAY['none'::text, 'enabled'::text, 'closed'::text])))
);

--
-- Name: source_references; Type: TABLE; Schema: module_kb; Owner: -
--

CREATE TABLE module_kb.source_references (
    id text NOT NULL,
    tenant_id uuid NOT NULL,
    scope_id text NOT NULL,
    article_id text,
    faq_id text,
    inbox_item_id text,
    excerpt text,
    locator text,
    source_url text,
    original_storage_path text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT source_references_check CHECK ((((article_id IS NOT NULL) AND (faq_id IS NULL)) OR ((faq_id IS NOT NULL) AND (article_id IS NULL))))
);

--
-- Name: tags; Type: TABLE; Schema: module_kb; Owner: -
--

CREATE TABLE module_kb.tags (
    id text NOT NULL,
    tenant_id uuid NOT NULL,
    scope_id text NOT NULL,
    kb_id text NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    color text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: article_comments article_comments_pkey; Type: CONSTRAINT; Schema: module_kb; Owner: -
--

ALTER TABLE ONLY module_kb.article_comments
    ADD CONSTRAINT article_comments_pkey PRIMARY KEY (id);

--
-- Name: article_tags article_tags_pkey; Type: CONSTRAINT; Schema: module_kb; Owner: -
--

ALTER TABLE ONLY module_kb.article_tags
    ADD CONSTRAINT article_tags_pkey PRIMARY KEY (article_id, tag_id);

--
-- Name: article_templates article_templates_pkey; Type: CONSTRAINT; Schema: module_kb; Owner: -
--

ALTER TABLE ONLY module_kb.article_templates
    ADD CONSTRAINT article_templates_pkey PRIMARY KEY (id);

--
-- Name: article_versions article_versions_article_id_version_key; Type: CONSTRAINT; Schema: module_kb; Owner: -
--

ALTER TABLE ONLY module_kb.article_versions
    ADD CONSTRAINT article_versions_article_id_version_key UNIQUE (article_id, version);

--
-- Name: article_versions article_versions_pkey; Type: CONSTRAINT; Schema: module_kb; Owner: -
--

ALTER TABLE ONLY module_kb.article_versions
    ADD CONSTRAINT article_versions_pkey PRIMARY KEY (id);

--
-- Name: articles articles_id_tenant_scope_key; Type: CONSTRAINT; Schema: module_kb; Owner: -
--

ALTER TABLE ONLY module_kb.articles
    ADD CONSTRAINT articles_id_tenant_scope_key UNIQUE (id, tenant_id, scope_id);

--
-- Name: articles articles_pkey; Type: CONSTRAINT; Schema: module_kb; Owner: -
--

ALTER TABLE ONLY module_kb.articles
    ADD CONSTRAINT articles_pkey PRIMARY KEY (id);

--
-- Name: attachments attachments_pkey; Type: CONSTRAINT; Schema: module_kb; Owner: -
--

ALTER TABLE ONLY module_kb.attachments
    ADD CONSTRAINT attachments_pkey PRIMARY KEY (id);

--
-- Name: categories categories_pkey; Type: CONSTRAINT; Schema: module_kb; Owner: -
--

ALTER TABLE ONLY module_kb.categories
    ADD CONSTRAINT categories_pkey PRIMARY KEY (id);

--
-- Name: faq_tags faq_tags_pkey; Type: CONSTRAINT; Schema: module_kb; Owner: -
--

ALTER TABLE ONLY module_kb.faq_tags
    ADD CONSTRAINT faq_tags_pkey PRIMARY KEY (faq_id, tag_id);

--
-- Name: faq_versions faq_versions_faq_id_version_key; Type: CONSTRAINT; Schema: module_kb; Owner: -
--

ALTER TABLE ONLY module_kb.faq_versions
    ADD CONSTRAINT faq_versions_faq_id_version_key UNIQUE (faq_id, version);

--
-- Name: faq_versions faq_versions_pkey; Type: CONSTRAINT; Schema: module_kb; Owner: -
--

ALTER TABLE ONLY module_kb.faq_versions
    ADD CONSTRAINT faq_versions_pkey PRIMARY KEY (id);

--
-- Name: faqs faqs_id_tenant_scope_key; Type: CONSTRAINT; Schema: module_kb; Owner: -
--

ALTER TABLE ONLY module_kb.faqs
    ADD CONSTRAINT faqs_id_tenant_scope_key UNIQUE (id, tenant_id, scope_id);

--
-- Name: faqs faqs_pkey; Type: CONSTRAINT; Schema: module_kb; Owner: -
--

ALTER TABLE ONLY module_kb.faqs
    ADD CONSTRAINT faqs_pkey PRIMARY KEY (id);

--
-- Name: inbox_items inbox_items_pkey; Type: CONSTRAINT; Schema: module_kb; Owner: -
--

ALTER TABLE ONLY module_kb.inbox_items
    ADD CONSTRAINT inbox_items_pkey PRIMARY KEY (id);

--
-- Name: kb_activity_log kb_activity_log_pkey; Type: CONSTRAINT; Schema: module_kb; Owner: -
--

ALTER TABLE ONLY module_kb.kb_activity_log
    ADD CONSTRAINT kb_activity_log_pkey PRIMARY KEY (id);

--
-- Name: kb_settings kb_settings_pkey1; Type: CONSTRAINT; Schema: module_kb; Owner: -
--

ALTER TABLE ONLY module_kb.kb_settings
    ADD CONSTRAINT kb_settings_pkey1 PRIMARY KEY (tenant_id, scope_id, context, name);

--
-- Name: kb_source_item_links kb_source_item_links_pkey; Type: CONSTRAINT; Schema: module_kb; Owner: -
--

ALTER TABLE ONLY module_kb.kb_source_item_links
    ADD CONSTRAINT kb_source_item_links_pkey PRIMARY KEY (id);

--
-- Name: kb_source_item_media kb_source_item_media_pkey; Type: CONSTRAINT; Schema: module_kb; Owner: -
--

ALTER TABLE ONLY module_kb.kb_source_item_media
    ADD CONSTRAINT kb_source_item_media_pkey PRIMARY KEY (id);

--
-- Name: kb_source_item_sections kb_source_item_sections_pkey; Type: CONSTRAINT; Schema: module_kb; Owner: -
--

ALTER TABLE ONLY module_kb.kb_source_item_sections
    ADD CONSTRAINT kb_source_item_sections_pkey PRIMARY KEY (id);

--
-- Name: kb_source_items kb_source_items_id_tenant_scope_key; Type: CONSTRAINT; Schema: module_kb; Owner: -
--

ALTER TABLE ONLY module_kb.kb_source_items
    ADD CONSTRAINT kb_source_items_id_tenant_scope_key UNIQUE (id, tenant_id, scope_id);

--
-- Name: kb_source_items kb_source_items_pkey; Type: CONSTRAINT; Schema: module_kb; Owner: -
--

ALTER TABLE ONLY module_kb.kb_source_items
    ADD CONSTRAINT kb_source_items_pkey PRIMARY KEY (id);

--
-- Name: kb_source_items kb_source_items_source_id_adapter_item_key_key; Type: CONSTRAINT; Schema: module_kb; Owner: -
--

ALTER TABLE ONLY module_kb.kb_source_items
    ADD CONSTRAINT kb_source_items_source_id_adapter_item_key_key UNIQUE (source_id, adapter_item_key);

--
-- Name: kb_source_runs kb_source_runs_pkey; Type: CONSTRAINT; Schema: module_kb; Owner: -
--

ALTER TABLE ONLY module_kb.kb_source_runs
    ADD CONSTRAINT kb_source_runs_pkey PRIMARY KEY (id);

--
-- Name: kb_sources kb_sources_pkey; Type: CONSTRAINT; Schema: module_kb; Owner: -
--

ALTER TABLE ONLY module_kb.kb_sources
    ADD CONSTRAINT kb_sources_pkey PRIMARY KEY (id);

--
-- Name: knowledge_bases knowledge_bases_pkey; Type: CONSTRAINT; Schema: module_kb; Owner: -
--

ALTER TABLE ONLY module_kb.knowledge_bases
    ADD CONSTRAINT knowledge_bases_pkey PRIMARY KEY (id);

--
-- Name: source_references source_references_pkey; Type: CONSTRAINT; Schema: module_kb; Owner: -
--

ALTER TABLE ONLY module_kb.source_references
    ADD CONSTRAINT source_references_pkey PRIMARY KEY (id);

--
-- Name: tags tags_id_tenant_scope_key; Type: CONSTRAINT; Schema: module_kb; Owner: -
--

ALTER TABLE ONLY module_kb.tags
    ADD CONSTRAINT tags_id_tenant_scope_key UNIQUE (id, tenant_id, scope_id);

--
-- Name: tags tags_kb_id_slug_key; Type: CONSTRAINT; Schema: module_kb; Owner: -
--

ALTER TABLE ONLY module_kb.tags
    ADD CONSTRAINT tags_kb_id_slug_key UNIQUE (kb_id, slug);

--
-- Name: tags tags_pkey; Type: CONSTRAINT; Schema: module_kb; Owner: -
--

ALTER TABLE ONLY module_kb.tags
    ADD CONSTRAINT tags_pkey PRIMARY KEY (id);

--
-- Name: idx_kb_article_comments_article; Type: INDEX; Schema: module_kb; Owner: -
--

CREATE INDEX idx_kb_article_comments_article ON module_kb.article_comments USING btree (article_id, created_at);

--
-- Name: idx_kb_article_comments_scope; Type: INDEX; Schema: module_kb; Owner: -
--

CREATE INDEX idx_kb_article_comments_scope ON module_kb.article_comments USING btree (tenant_id, scope_id);

--
-- Name: idx_module_kb_activity_log_kb; Type: INDEX; Schema: module_kb; Owner: -
--

CREATE INDEX idx_module_kb_activity_log_kb ON module_kb.kb_activity_log USING btree (kb_id, created_at DESC) WHERE (kb_id IS NOT NULL);

--
-- Name: idx_module_kb_activity_log_scope_time; Type: INDEX; Schema: module_kb; Owner: -
--

CREATE INDEX idx_module_kb_activity_log_scope_time ON module_kb.kb_activity_log USING btree (tenant_id, scope_id, created_at DESC);

--
-- Name: idx_module_kb_article_tags_tag; Type: INDEX; Schema: module_kb; Owner: -
--

CREATE INDEX idx_module_kb_article_tags_tag ON module_kb.article_tags USING btree (tag_id);

--
-- Name: idx_module_kb_article_tags_tenant; Type: INDEX; Schema: module_kb; Owner: -
--

CREATE INDEX idx_module_kb_article_tags_tenant ON module_kb.article_tags USING btree (tenant_id, scope_id);

--
-- Name: idx_module_kb_article_templates_kb; Type: INDEX; Schema: module_kb; Owner: -
--

CREATE INDEX idx_module_kb_article_templates_kb ON module_kb.article_templates USING btree (tenant_id, scope_id, kb_id, name) WHERE (deleted_at IS NULL);

--
-- Name: idx_module_kb_article_versions_lookup; Type: INDEX; Schema: module_kb; Owner: -
--

CREATE INDEX idx_module_kb_article_versions_lookup ON module_kb.article_versions USING btree (tenant_id, scope_id, article_id, version DESC);

--
-- Name: idx_module_kb_articles_fts_simple; Type: INDEX; Schema: module_kb; Owner: -
--

CREATE INDEX idx_module_kb_articles_fts_simple ON module_kb.articles USING gin (to_tsvector('simple'::regconfig, ((COALESCE(title, ''::text) || ' '::text) || COALESCE(content_markdown, ''::text)))) WHERE (deleted_at IS NULL);

--
-- Name: idx_module_kb_articles_kb; Type: INDEX; Schema: module_kb; Owner: -
--

CREATE INDEX idx_module_kb_articles_kb ON module_kb.articles USING btree (kb_id, sort_order) WHERE (deleted_at IS NULL);

--
-- Name: idx_module_kb_articles_parent_siblings; Type: INDEX; Schema: module_kb; Owner: -
--

CREATE INDEX idx_module_kb_articles_parent_siblings ON module_kb.articles USING btree (kb_id, parent_article_id, sort_order, title) WHERE (deleted_at IS NULL);

--
-- Name: idx_module_kb_articles_scope; Type: INDEX; Schema: module_kb; Owner: -
--

CREATE INDEX idx_module_kb_articles_scope ON module_kb.articles USING btree (tenant_id, scope_id, updated_at DESC) WHERE (deleted_at IS NULL);

--
-- Name: idx_module_kb_articles_slug_unique; Type: INDEX; Schema: module_kb; Owner: -
--

CREATE UNIQUE INDEX idx_module_kb_articles_slug_unique ON module_kb.articles USING btree (kb_id, slug) WHERE (deleted_at IS NULL);

--
-- Name: idx_module_kb_articles_status; Type: INDEX; Schema: module_kb; Owner: -
--

CREATE INDEX idx_module_kb_articles_status ON module_kb.articles USING btree (status) WHERE (deleted_at IS NULL);

--
-- Name: idx_module_kb_articles_template; Type: INDEX; Schema: module_kb; Owner: -
--

CREATE INDEX idx_module_kb_articles_template ON module_kb.articles USING btree (tenant_id, scope_id, kb_id, template_id) WHERE (deleted_at IS NULL);

--
-- Name: idx_module_kb_attachments_article; Type: INDEX; Schema: module_kb; Owner: -
--

CREATE INDEX idx_module_kb_attachments_article ON module_kb.attachments USING btree (article_id);

--
-- Name: idx_module_kb_categories_kb; Type: INDEX; Schema: module_kb; Owner: -
--

CREATE INDEX idx_module_kb_categories_kb ON module_kb.categories USING btree (kb_id, parent_id, sort_order);

--
-- Name: idx_module_kb_categories_kb_default; Type: INDEX; Schema: module_kb; Owner: -
--

CREATE UNIQUE INDEX idx_module_kb_categories_kb_default ON module_kb.categories USING btree (kb_id) WHERE is_default;

--
-- Name: idx_module_kb_categories_kb_slug_unique; Type: INDEX; Schema: module_kb; Owner: -
--

CREATE UNIQUE INDEX idx_module_kb_categories_kb_slug_unique ON module_kb.categories USING btree (kb_id, slug);

--
-- Name: idx_module_kb_categories_scope; Type: INDEX; Schema: module_kb; Owner: -
--

CREATE INDEX idx_module_kb_categories_scope ON module_kb.categories USING btree (tenant_id, scope_id);

--
-- Name: idx_module_kb_categories_template; Type: INDEX; Schema: module_kb; Owner: -
--

CREATE INDEX idx_module_kb_categories_template ON module_kb.categories USING btree (tenant_id, scope_id, kb_id, template_id);

--
-- Name: idx_module_kb_faq_tags_tenant; Type: INDEX; Schema: module_kb; Owner: -
--

CREATE INDEX idx_module_kb_faq_tags_tenant ON module_kb.faq_tags USING btree (tenant_id, scope_id);

--
-- Name: idx_module_kb_faq_versions_lookup; Type: INDEX; Schema: module_kb; Owner: -
--

CREATE INDEX idx_module_kb_faq_versions_lookup ON module_kb.faq_versions USING btree (tenant_id, scope_id, faq_id, version DESC);

--
-- Name: idx_module_kb_faqs_kb; Type: INDEX; Schema: module_kb; Owner: -
--

CREATE INDEX idx_module_kb_faqs_kb ON module_kb.faqs USING btree (kb_id, sort_order) WHERE (deleted_at IS NULL);

--
-- Name: idx_module_kb_faqs_scope; Type: INDEX; Schema: module_kb; Owner: -
--

CREATE INDEX idx_module_kb_faqs_scope ON module_kb.faqs USING btree (tenant_id, scope_id) WHERE (deleted_at IS NULL);

--
-- Name: idx_module_kb_inbox_items_kb_status; Type: INDEX; Schema: module_kb; Owner: -
--

CREATE INDEX idx_module_kb_inbox_items_kb_status ON module_kb.inbox_items USING btree (kb_id, status, captured_at DESC);

--
-- Name: idx_module_kb_inbox_items_scope; Type: INDEX; Schema: module_kb; Owner: -
--

CREATE INDEX idx_module_kb_inbox_items_scope ON module_kb.inbox_items USING btree (tenant_id, scope_id);

--
-- Name: idx_module_kb_kb_settings_tenant_scope; Type: INDEX; Schema: module_kb; Owner: -
--

CREATE INDEX idx_module_kb_kb_settings_tenant_scope ON module_kb.kb_settings USING btree (tenant_id, scope_id);

--
-- Name: idx_module_kb_knowledge_bases_one_per_space; Type: INDEX; Schema: module_kb; Owner: -
--

CREATE UNIQUE INDEX idx_module_kb_knowledge_bases_one_per_space ON module_kb.knowledge_bases USING btree (tenant_id, space_id) WHERE (deleted_at IS NULL);

--
-- Name: idx_module_kb_knowledge_bases_scope; Type: INDEX; Schema: module_kb; Owner: -
--

CREATE INDEX idx_module_kb_knowledge_bases_scope ON module_kb.knowledge_bases USING btree (tenant_id, scope_id) WHERE (deleted_at IS NULL);

--
-- Name: idx_module_kb_knowledge_bases_slug_unique; Type: INDEX; Schema: module_kb; Owner: -
--

CREATE UNIQUE INDEX idx_module_kb_knowledge_bases_slug_unique ON module_kb.knowledge_bases USING btree (tenant_id, scope_id, slug) WHERE (deleted_at IS NULL);

--
-- Name: idx_module_kb_knowledge_bases_space; Type: INDEX; Schema: module_kb; Owner: -
--

CREATE INDEX idx_module_kb_knowledge_bases_space ON module_kb.knowledge_bases USING btree (tenant_id, space_id) WHERE (deleted_at IS NULL);

--
-- Name: idx_module_kb_source_item_links_item_position; Type: INDEX; Schema: module_kb; Owner: -
--

CREATE INDEX idx_module_kb_source_item_links_item_position ON module_kb.kb_source_item_links USING btree (source_item_id, "position");

--
-- Name: idx_module_kb_source_item_links_normalized; Type: INDEX; Schema: module_kb; Owner: -
--

CREATE INDEX idx_module_kb_source_item_links_normalized ON module_kb.kb_source_item_links USING btree (normalized_href);

--
-- Name: idx_module_kb_source_item_links_tenant; Type: INDEX; Schema: module_kb; Owner: -
--

CREATE INDEX idx_module_kb_source_item_links_tenant ON module_kb.kb_source_item_links USING btree (tenant_id, scope_id);

--
-- Name: idx_module_kb_source_item_media_item_position; Type: INDEX; Schema: module_kb; Owner: -
--

CREATE INDEX idx_module_kb_source_item_media_item_position ON module_kb.kb_source_item_media USING btree (source_item_id, "position");

--
-- Name: idx_module_kb_source_item_media_storage_object_key; Type: INDEX; Schema: module_kb; Owner: -
--

CREATE INDEX idx_module_kb_source_item_media_storage_object_key ON module_kb.kb_source_item_media USING btree (storage_object_key) WHERE (storage_object_key IS NOT NULL);

--
-- Name: idx_module_kb_source_item_media_tenant; Type: INDEX; Schema: module_kb; Owner: -
--

CREATE INDEX idx_module_kb_source_item_media_tenant ON module_kb.kb_source_item_media USING btree (tenant_id, scope_id);

--
-- Name: idx_module_kb_source_item_sections_item_position; Type: INDEX; Schema: module_kb; Owner: -
--

CREATE INDEX idx_module_kb_source_item_sections_item_position ON module_kb.kb_source_item_sections USING btree (source_item_id, "position");

--
-- Name: idx_module_kb_source_item_sections_tenant; Type: INDEX; Schema: module_kb; Owner: -
--

CREATE INDEX idx_module_kb_source_item_sections_tenant ON module_kb.kb_source_item_sections USING btree (tenant_id, scope_id);

--
-- Name: idx_module_kb_source_items_inbox; Type: INDEX; Schema: module_kb; Owner: -
--

CREATE INDEX idx_module_kb_source_items_inbox ON module_kb.kb_source_items USING btree (inbox_item_id) WHERE (inbox_item_id IS NOT NULL);

--
-- Name: idx_module_kb_source_items_source_status; Type: INDEX; Schema: module_kb; Owner: -
--

CREATE INDEX idx_module_kb_source_items_source_status ON module_kb.kb_source_items USING btree (source_id, status, updated_at DESC);

--
-- Name: idx_module_kb_source_references_article; Type: INDEX; Schema: module_kb; Owner: -
--

CREATE INDEX idx_module_kb_source_references_article ON module_kb.source_references USING btree (article_id) WHERE (article_id IS NOT NULL);

--
-- Name: idx_module_kb_source_references_faq; Type: INDEX; Schema: module_kb; Owner: -
--

CREATE INDEX idx_module_kb_source_references_faq ON module_kb.source_references USING btree (faq_id) WHERE (faq_id IS NOT NULL);

--
-- Name: idx_module_kb_source_references_inbox; Type: INDEX; Schema: module_kb; Owner: -
--

CREATE INDEX idx_module_kb_source_references_inbox ON module_kb.source_references USING btree (inbox_item_id) WHERE (inbox_item_id IS NOT NULL);

--
-- Name: idx_module_kb_source_runs_source_time; Type: INDEX; Schema: module_kb; Owner: -
--

CREATE INDEX idx_module_kb_source_runs_source_time ON module_kb.kb_source_runs USING btree (source_id, started_at DESC);

--
-- Name: idx_module_kb_sources_due; Type: INDEX; Schema: module_kb; Owner: -
--

CREATE INDEX idx_module_kb_sources_due ON module_kb.kb_sources USING btree (tenant_id, scope_id, enabled, next_run_at) WHERE ((enabled = true) AND (next_run_at IS NOT NULL));

--
-- Name: idx_module_kb_sources_kb_status; Type: INDEX; Schema: module_kb; Owner: -
--

CREATE INDEX idx_module_kb_sources_kb_status ON module_kb.kb_sources USING btree (kb_id, status, updated_at DESC);

--
-- Name: idx_module_kb_tags_kb; Type: INDEX; Schema: module_kb; Owner: -
--

CREATE INDEX idx_module_kb_tags_kb ON module_kb.tags USING btree (kb_id);

--
-- Name: knowledge_bases kb_seed_default_category; Type: TRIGGER; Schema: module_kb; Owner: -
--

CREATE TRIGGER kb_seed_default_category AFTER INSERT ON module_kb.knowledge_bases FOR EACH ROW EXECUTE FUNCTION module_kb.kb_seed_default_category();

--
-- Name: article_comments article_comments_article_id_fkey; Type: FK CONSTRAINT; Schema: module_kb; Owner: -
--

ALTER TABLE ONLY module_kb.article_comments
    ADD CONSTRAINT article_comments_article_id_fkey FOREIGN KEY (article_id) REFERENCES module_kb.articles(id) ON DELETE CASCADE;

--
-- Name: article_comments article_comments_created_by_fkey; Type: FK CONSTRAINT; Schema: module_kb; Owner: -
--

ALTER TABLE ONLY module_kb.article_comments
    ADD CONSTRAINT article_comments_created_by_fkey FOREIGN KEY (created_by) REFERENCES core.users(id) ON DELETE SET NULL;

--
-- Name: article_comments article_comments_tenant_id_fkey; Type: FK CONSTRAINT; Schema: module_kb; Owner: -
--

ALTER TABLE ONLY module_kb.article_comments
    ADD CONSTRAINT article_comments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: article_tags article_tags_article_tenant_fkey; Type: FK CONSTRAINT; Schema: module_kb; Owner: -
--

ALTER TABLE ONLY module_kb.article_tags
    ADD CONSTRAINT article_tags_article_tenant_fkey FOREIGN KEY (article_id, tenant_id, scope_id) REFERENCES module_kb.articles(id, tenant_id, scope_id) ON UPDATE CASCADE ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;

--
-- Name: article_tags article_tags_tag_tenant_fkey; Type: FK CONSTRAINT; Schema: module_kb; Owner: -
--

ALTER TABLE ONLY module_kb.article_tags
    ADD CONSTRAINT article_tags_tag_tenant_fkey FOREIGN KEY (tag_id, tenant_id, scope_id) REFERENCES module_kb.tags(id, tenant_id, scope_id) ON UPDATE CASCADE ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;

--
-- Name: article_templates article_templates_kb_id_fkey; Type: FK CONSTRAINT; Schema: module_kb; Owner: -
--

ALTER TABLE ONLY module_kb.article_templates
    ADD CONSTRAINT article_templates_kb_id_fkey FOREIGN KEY (kb_id) REFERENCES module_kb.knowledge_bases(id) ON DELETE CASCADE;

--
-- Name: article_templates article_templates_tenant_id_fkey; Type: FK CONSTRAINT; Schema: module_kb; Owner: -
--

ALTER TABLE ONLY module_kb.article_templates
    ADD CONSTRAINT article_templates_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: article_versions article_versions_article_id_fkey; Type: FK CONSTRAINT; Schema: module_kb; Owner: -
--

ALTER TABLE ONLY module_kb.article_versions
    ADD CONSTRAINT article_versions_article_id_fkey FOREIGN KEY (article_id) REFERENCES module_kb.articles(id) ON DELETE CASCADE;

--
-- Name: article_versions article_versions_tenant_id_fkey; Type: FK CONSTRAINT; Schema: module_kb; Owner: -
--

ALTER TABLE ONLY module_kb.article_versions
    ADD CONSTRAINT article_versions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: articles articles_category_id_fkey; Type: FK CONSTRAINT; Schema: module_kb; Owner: -
--

ALTER TABLE ONLY module_kb.articles
    ADD CONSTRAINT articles_category_id_fkey FOREIGN KEY (category_id) REFERENCES module_kb.categories(id) ON DELETE RESTRICT;

--
-- Name: articles articles_kb_id_fkey; Type: FK CONSTRAINT; Schema: module_kb; Owner: -
--

ALTER TABLE ONLY module_kb.articles
    ADD CONSTRAINT articles_kb_id_fkey FOREIGN KEY (kb_id) REFERENCES module_kb.knowledge_bases(id) ON DELETE CASCADE;

--
-- Name: articles articles_parent_article_id_fkey; Type: FK CONSTRAINT; Schema: module_kb; Owner: -
--

ALTER TABLE ONLY module_kb.articles
    ADD CONSTRAINT articles_parent_article_id_fkey FOREIGN KEY (parent_article_id) REFERENCES module_kb.articles(id) ON DELETE SET NULL;

--
-- Name: articles articles_template_id_fkey; Type: FK CONSTRAINT; Schema: module_kb; Owner: -
--

ALTER TABLE ONLY module_kb.articles
    ADD CONSTRAINT articles_template_id_fkey FOREIGN KEY (template_id) REFERENCES module_kb.article_templates(id) ON DELETE SET NULL;

--
-- Name: articles articles_tenant_id_fkey; Type: FK CONSTRAINT; Schema: module_kb; Owner: -
--

ALTER TABLE ONLY module_kb.articles
    ADD CONSTRAINT articles_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: attachments attachments_article_id_fkey; Type: FK CONSTRAINT; Schema: module_kb; Owner: -
--

ALTER TABLE ONLY module_kb.attachments
    ADD CONSTRAINT attachments_article_id_fkey FOREIGN KEY (article_id) REFERENCES module_kb.articles(id) ON DELETE CASCADE;

--
-- Name: attachments attachments_tenant_id_fkey; Type: FK CONSTRAINT; Schema: module_kb; Owner: -
--

ALTER TABLE ONLY module_kb.attachments
    ADD CONSTRAINT attachments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: categories categories_kb_id_fkey; Type: FK CONSTRAINT; Schema: module_kb; Owner: -
--

ALTER TABLE ONLY module_kb.categories
    ADD CONSTRAINT categories_kb_id_fkey FOREIGN KEY (kb_id) REFERENCES module_kb.knowledge_bases(id) ON DELETE CASCADE;

--
-- Name: categories categories_parent_id_fkey; Type: FK CONSTRAINT; Schema: module_kb; Owner: -
--

ALTER TABLE ONLY module_kb.categories
    ADD CONSTRAINT categories_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES module_kb.categories(id) ON DELETE SET NULL;

--
-- Name: categories categories_template_id_fkey; Type: FK CONSTRAINT; Schema: module_kb; Owner: -
--

ALTER TABLE ONLY module_kb.categories
    ADD CONSTRAINT categories_template_id_fkey FOREIGN KEY (template_id) REFERENCES module_kb.article_templates(id) ON DELETE SET NULL;

--
-- Name: categories categories_tenant_id_fkey; Type: FK CONSTRAINT; Schema: module_kb; Owner: -
--

ALTER TABLE ONLY module_kb.categories
    ADD CONSTRAINT categories_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: faq_tags faq_tags_faq_tenant_fkey; Type: FK CONSTRAINT; Schema: module_kb; Owner: -
--

ALTER TABLE ONLY module_kb.faq_tags
    ADD CONSTRAINT faq_tags_faq_tenant_fkey FOREIGN KEY (faq_id, tenant_id, scope_id) REFERENCES module_kb.faqs(id, tenant_id, scope_id) ON UPDATE CASCADE ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;

--
-- Name: faq_tags faq_tags_tag_tenant_fkey; Type: FK CONSTRAINT; Schema: module_kb; Owner: -
--

ALTER TABLE ONLY module_kb.faq_tags
    ADD CONSTRAINT faq_tags_tag_tenant_fkey FOREIGN KEY (tag_id, tenant_id, scope_id) REFERENCES module_kb.tags(id, tenant_id, scope_id) ON UPDATE CASCADE ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;

--
-- Name: faq_versions faq_versions_faq_id_fkey; Type: FK CONSTRAINT; Schema: module_kb; Owner: -
--

ALTER TABLE ONLY module_kb.faq_versions
    ADD CONSTRAINT faq_versions_faq_id_fkey FOREIGN KEY (faq_id) REFERENCES module_kb.faqs(id) ON DELETE CASCADE;

--
-- Name: faq_versions faq_versions_tenant_id_fkey; Type: FK CONSTRAINT; Schema: module_kb; Owner: -
--

ALTER TABLE ONLY module_kb.faq_versions
    ADD CONSTRAINT faq_versions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: faqs faqs_category_id_fkey; Type: FK CONSTRAINT; Schema: module_kb; Owner: -
--

ALTER TABLE ONLY module_kb.faqs
    ADD CONSTRAINT faqs_category_id_fkey FOREIGN KEY (category_id) REFERENCES module_kb.categories(id) ON DELETE SET NULL;

--
-- Name: faqs faqs_kb_id_fkey; Type: FK CONSTRAINT; Schema: module_kb; Owner: -
--

ALTER TABLE ONLY module_kb.faqs
    ADD CONSTRAINT faqs_kb_id_fkey FOREIGN KEY (kb_id) REFERENCES module_kb.knowledge_bases(id) ON DELETE CASCADE;

--
-- Name: faqs faqs_tenant_id_fkey; Type: FK CONSTRAINT; Schema: module_kb; Owner: -
--

ALTER TABLE ONLY module_kb.faqs
    ADD CONSTRAINT faqs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: inbox_items inbox_items_kb_id_fkey; Type: FK CONSTRAINT; Schema: module_kb; Owner: -
--

ALTER TABLE ONLY module_kb.inbox_items
    ADD CONSTRAINT inbox_items_kb_id_fkey FOREIGN KEY (kb_id) REFERENCES module_kb.knowledge_bases(id) ON DELETE CASCADE;

--
-- Name: inbox_items inbox_items_promoted_article_id_fkey; Type: FK CONSTRAINT; Schema: module_kb; Owner: -
--

ALTER TABLE ONLY module_kb.inbox_items
    ADD CONSTRAINT inbox_items_promoted_article_id_fkey FOREIGN KEY (promoted_article_id) REFERENCES module_kb.articles(id) ON DELETE SET NULL;

--
-- Name: inbox_items inbox_items_promoted_faq_id_fkey; Type: FK CONSTRAINT; Schema: module_kb; Owner: -
--

ALTER TABLE ONLY module_kb.inbox_items
    ADD CONSTRAINT inbox_items_promoted_faq_id_fkey FOREIGN KEY (promoted_faq_id) REFERENCES module_kb.faqs(id) ON DELETE SET NULL;

--
-- Name: inbox_items inbox_items_tenant_id_fkey; Type: FK CONSTRAINT; Schema: module_kb; Owner: -
--

ALTER TABLE ONLY module_kb.inbox_items
    ADD CONSTRAINT inbox_items_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: kb_activity_log kb_activity_log_kb_id_fkey; Type: FK CONSTRAINT; Schema: module_kb; Owner: -
--

ALTER TABLE ONLY module_kb.kb_activity_log
    ADD CONSTRAINT kb_activity_log_kb_id_fkey FOREIGN KEY (kb_id) REFERENCES module_kb.knowledge_bases(id) ON DELETE SET NULL;

--
-- Name: kb_activity_log kb_activity_log_tenant_id_fkey; Type: FK CONSTRAINT; Schema: module_kb; Owner: -
--

ALTER TABLE ONLY module_kb.kb_activity_log
    ADD CONSTRAINT kb_activity_log_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: knowledge_bases kb_knowledge_bases_space_tenant_fkey; Type: FK CONSTRAINT; Schema: module_kb; Owner: -
--

ALTER TABLE ONLY module_kb.knowledge_bases
    ADD CONSTRAINT kb_knowledge_bases_space_tenant_fkey FOREIGN KEY (space_id, tenant_id) REFERENCES core.spaces(id, tenant_id) ON DELETE CASCADE;

--
-- Name: kb_settings kb_settings_tenant_id_fkey1; Type: FK CONSTRAINT; Schema: module_kb; Owner: -
--

ALTER TABLE ONLY module_kb.kb_settings
    ADD CONSTRAINT kb_settings_tenant_id_fkey1 FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: kb_source_item_links kb_source_item_links_item_tenant_fkey; Type: FK CONSTRAINT; Schema: module_kb; Owner: -
--

ALTER TABLE ONLY module_kb.kb_source_item_links
    ADD CONSTRAINT kb_source_item_links_item_tenant_fkey FOREIGN KEY (source_item_id, tenant_id, scope_id) REFERENCES module_kb.kb_source_items(id, tenant_id, scope_id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: kb_source_item_media kb_source_item_media_item_tenant_fkey; Type: FK CONSTRAINT; Schema: module_kb; Owner: -
--

ALTER TABLE ONLY module_kb.kb_source_item_media
    ADD CONSTRAINT kb_source_item_media_item_tenant_fkey FOREIGN KEY (source_item_id, tenant_id, scope_id) REFERENCES module_kb.kb_source_items(id, tenant_id, scope_id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: kb_source_item_sections kb_source_item_sections_item_tenant_fkey; Type: FK CONSTRAINT; Schema: module_kb; Owner: -
--

ALTER TABLE ONLY module_kb.kb_source_item_sections
    ADD CONSTRAINT kb_source_item_sections_item_tenant_fkey FOREIGN KEY (source_item_id, tenant_id, scope_id) REFERENCES module_kb.kb_source_items(id, tenant_id, scope_id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: kb_source_items kb_source_items_inbox_item_id_fkey; Type: FK CONSTRAINT; Schema: module_kb; Owner: -
--

ALTER TABLE ONLY module_kb.kb_source_items
    ADD CONSTRAINT kb_source_items_inbox_item_id_fkey FOREIGN KEY (inbox_item_id) REFERENCES module_kb.inbox_items(id) ON DELETE SET NULL;

--
-- Name: kb_source_items kb_source_items_kb_id_fkey; Type: FK CONSTRAINT; Schema: module_kb; Owner: -
--

ALTER TABLE ONLY module_kb.kb_source_items
    ADD CONSTRAINT kb_source_items_kb_id_fkey FOREIGN KEY (kb_id) REFERENCES module_kb.knowledge_bases(id) ON DELETE CASCADE;

--
-- Name: kb_source_items kb_source_items_source_id_fkey; Type: FK CONSTRAINT; Schema: module_kb; Owner: -
--

ALTER TABLE ONLY module_kb.kb_source_items
    ADD CONSTRAINT kb_source_items_source_id_fkey FOREIGN KEY (source_id) REFERENCES module_kb.kb_sources(id) ON DELETE CASCADE;

--
-- Name: kb_source_items kb_source_items_tenant_id_fkey; Type: FK CONSTRAINT; Schema: module_kb; Owner: -
--

ALTER TABLE ONLY module_kb.kb_source_items
    ADD CONSTRAINT kb_source_items_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: kb_source_runs kb_source_runs_kb_id_fkey; Type: FK CONSTRAINT; Schema: module_kb; Owner: -
--

ALTER TABLE ONLY module_kb.kb_source_runs
    ADD CONSTRAINT kb_source_runs_kb_id_fkey FOREIGN KEY (kb_id) REFERENCES module_kb.knowledge_bases(id) ON DELETE CASCADE;

--
-- Name: kb_source_runs kb_source_runs_source_id_fkey; Type: FK CONSTRAINT; Schema: module_kb; Owner: -
--

ALTER TABLE ONLY module_kb.kb_source_runs
    ADD CONSTRAINT kb_source_runs_source_id_fkey FOREIGN KEY (source_id) REFERENCES module_kb.kb_sources(id) ON DELETE CASCADE;

--
-- Name: kb_source_runs kb_source_runs_tenant_id_fkey; Type: FK CONSTRAINT; Schema: module_kb; Owner: -
--

ALTER TABLE ONLY module_kb.kb_source_runs
    ADD CONSTRAINT kb_source_runs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: kb_sources kb_sources_kb_id_fkey; Type: FK CONSTRAINT; Schema: module_kb; Owner: -
--

ALTER TABLE ONLY module_kb.kb_sources
    ADD CONSTRAINT kb_sources_kb_id_fkey FOREIGN KEY (kb_id) REFERENCES module_kb.knowledge_bases(id) ON DELETE CASCADE;

--
-- Name: kb_sources kb_sources_tenant_id_fkey; Type: FK CONSTRAINT; Schema: module_kb; Owner: -
--

ALTER TABLE ONLY module_kb.kb_sources
    ADD CONSTRAINT kb_sources_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: knowledge_bases knowledge_bases_tenant_id_fkey; Type: FK CONSTRAINT; Schema: module_kb; Owner: -
--

ALTER TABLE ONLY module_kb.knowledge_bases
    ADD CONSTRAINT knowledge_bases_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: source_references source_references_article_id_fkey; Type: FK CONSTRAINT; Schema: module_kb; Owner: -
--

ALTER TABLE ONLY module_kb.source_references
    ADD CONSTRAINT source_references_article_id_fkey FOREIGN KEY (article_id) REFERENCES module_kb.articles(id) ON DELETE CASCADE;

--
-- Name: source_references source_references_faq_id_fkey; Type: FK CONSTRAINT; Schema: module_kb; Owner: -
--

ALTER TABLE ONLY module_kb.source_references
    ADD CONSTRAINT source_references_faq_id_fkey FOREIGN KEY (faq_id) REFERENCES module_kb.faqs(id) ON DELETE CASCADE;

--
-- Name: source_references source_references_inbox_item_id_fkey; Type: FK CONSTRAINT; Schema: module_kb; Owner: -
--

ALTER TABLE ONLY module_kb.source_references
    ADD CONSTRAINT source_references_inbox_item_id_fkey FOREIGN KEY (inbox_item_id) REFERENCES module_kb.inbox_items(id) ON DELETE SET NULL;

--
-- Name: source_references source_references_tenant_id_fkey; Type: FK CONSTRAINT; Schema: module_kb; Owner: -
--

ALTER TABLE ONLY module_kb.source_references
    ADD CONSTRAINT source_references_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: tags tags_kb_id_fkey; Type: FK CONSTRAINT; Schema: module_kb; Owner: -
--

ALTER TABLE ONLY module_kb.tags
    ADD CONSTRAINT tags_kb_id_fkey FOREIGN KEY (kb_id) REFERENCES module_kb.knowledge_bases(id) ON DELETE CASCADE;

--
-- Name: tags tags_tenant_id_fkey; Type: FK CONSTRAINT; Schema: module_kb; Owner: -
--

ALTER TABLE ONLY module_kb.tags
    ADD CONSTRAINT tags_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: article_comments; Type: ROW SECURITY; Schema: module_kb; Owner: -
--

ALTER TABLE module_kb.article_comments ENABLE ROW LEVEL SECURITY;

--
-- Name: article_comments article_comments_delete_own_scope; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY article_comments_delete_own_scope ON module_kb.article_comments FOR DELETE USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: article_comments article_comments_insert_own_scope; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY article_comments_insert_own_scope ON module_kb.article_comments FOR INSERT WITH CHECK (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: article_comments article_comments_read_own_scope; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY article_comments_read_own_scope ON module_kb.article_comments FOR SELECT USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: article_comments article_comments_update_own_scope; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY article_comments_update_own_scope ON module_kb.article_comments FOR UPDATE USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: article_tags; Type: ROW SECURITY; Schema: module_kb; Owner: -
--

ALTER TABLE module_kb.article_tags ENABLE ROW LEVEL SECURITY;

--
-- Name: article_tags article_tags_delete_own_scope; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY article_tags_delete_own_scope ON module_kb.article_tags FOR DELETE USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: article_tags article_tags_insert_own_scope; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY article_tags_insert_own_scope ON module_kb.article_tags FOR INSERT WITH CHECK (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: article_tags article_tags_read_own_scope; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY article_tags_read_own_scope ON module_kb.article_tags FOR SELECT USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: article_templates; Type: ROW SECURITY; Schema: module_kb; Owner: -
--

ALTER TABLE module_kb.article_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: article_templates article_templates_delete_own_scope; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY article_templates_delete_own_scope ON module_kb.article_templates FOR DELETE USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: article_templates article_templates_insert_own_scope; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY article_templates_insert_own_scope ON module_kb.article_templates FOR INSERT WITH CHECK (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: article_templates article_templates_read_own_scope; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY article_templates_read_own_scope ON module_kb.article_templates FOR SELECT USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: article_templates article_templates_update_own_scope; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY article_templates_update_own_scope ON module_kb.article_templates FOR UPDATE USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: article_versions; Type: ROW SECURITY; Schema: module_kb; Owner: -
--

ALTER TABLE module_kb.article_versions ENABLE ROW LEVEL SECURITY;

--
-- Name: articles; Type: ROW SECURITY; Schema: module_kb; Owner: -
--

ALTER TABLE module_kb.articles ENABLE ROW LEVEL SECURITY;

--
-- Name: articles articles_delete_own_scope; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY articles_delete_own_scope ON module_kb.articles FOR DELETE USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: articles articles_insert_own_scope; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY articles_insert_own_scope ON module_kb.articles FOR INSERT WITH CHECK (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: articles articles_read_own_scope; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY articles_read_own_scope ON module_kb.articles FOR SELECT USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: articles articles_update_own_scope; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY articles_update_own_scope ON module_kb.articles FOR UPDATE USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: attachments; Type: ROW SECURITY; Schema: module_kb; Owner: -
--

ALTER TABLE module_kb.attachments ENABLE ROW LEVEL SECURITY;

--
-- Name: attachments attachments_delete_own_scope; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY attachments_delete_own_scope ON module_kb.attachments FOR DELETE USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: attachments attachments_insert_own_scope; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY attachments_insert_own_scope ON module_kb.attachments FOR INSERT WITH CHECK (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: attachments attachments_read_own_scope; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY attachments_read_own_scope ON module_kb.attachments FOR SELECT USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: categories; Type: ROW SECURITY; Schema: module_kb; Owner: -
--

ALTER TABLE module_kb.categories ENABLE ROW LEVEL SECURITY;

--
-- Name: categories categories_delete_own_scope; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY categories_delete_own_scope ON module_kb.categories FOR DELETE USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: categories categories_insert_own_scope; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY categories_insert_own_scope ON module_kb.categories FOR INSERT WITH CHECK (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: categories categories_read_own_scope; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY categories_read_own_scope ON module_kb.categories FOR SELECT USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: categories categories_update_own_scope; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY categories_update_own_scope ON module_kb.categories FOR UPDATE USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: faq_tags; Type: ROW SECURITY; Schema: module_kb; Owner: -
--

ALTER TABLE module_kb.faq_tags ENABLE ROW LEVEL SECURITY;

--
-- Name: faq_tags faq_tags_delete_own_scope; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY faq_tags_delete_own_scope ON module_kb.faq_tags FOR DELETE USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: faq_tags faq_tags_insert_own_scope; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY faq_tags_insert_own_scope ON module_kb.faq_tags FOR INSERT WITH CHECK (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: faq_tags faq_tags_read_own_scope; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY faq_tags_read_own_scope ON module_kb.faq_tags FOR SELECT USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: faq_versions; Type: ROW SECURITY; Schema: module_kb; Owner: -
--

ALTER TABLE module_kb.faq_versions ENABLE ROW LEVEL SECURITY;

--
-- Name: faqs; Type: ROW SECURITY; Schema: module_kb; Owner: -
--

ALTER TABLE module_kb.faqs ENABLE ROW LEVEL SECURITY;

--
-- Name: faqs faqs_delete_own_scope; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY faqs_delete_own_scope ON module_kb.faqs FOR DELETE USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: faqs faqs_insert_own_scope; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY faqs_insert_own_scope ON module_kb.faqs FOR INSERT WITH CHECK (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: faqs faqs_read_own_scope; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY faqs_read_own_scope ON module_kb.faqs FOR SELECT USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: faqs faqs_update_own_scope; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY faqs_update_own_scope ON module_kb.faqs FOR UPDATE USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: inbox_items; Type: ROW SECURITY; Schema: module_kb; Owner: -
--

ALTER TABLE module_kb.inbox_items ENABLE ROW LEVEL SECURITY;

--
-- Name: inbox_items inbox_items_delete_own_scope; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY inbox_items_delete_own_scope ON module_kb.inbox_items FOR DELETE USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: inbox_items inbox_items_insert_own_scope; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY inbox_items_insert_own_scope ON module_kb.inbox_items FOR INSERT WITH CHECK (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: inbox_items inbox_items_read_own_scope; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY inbox_items_read_own_scope ON module_kb.inbox_items FOR SELECT USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: inbox_items inbox_items_update_own_scope; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY inbox_items_update_own_scope ON module_kb.inbox_items FOR UPDATE USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: kb_activity_log; Type: ROW SECURITY; Schema: module_kb; Owner: -
--

ALTER TABLE module_kb.kb_activity_log ENABLE ROW LEVEL SECURITY;

--
-- Name: kb_activity_log kb_activity_log_insert_own_scope; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY kb_activity_log_insert_own_scope ON module_kb.kb_activity_log FOR INSERT WITH CHECK (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: kb_activity_log kb_activity_log_read_own_scope; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY kb_activity_log_read_own_scope ON module_kb.kb_activity_log FOR SELECT USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: knowledge_bases kb_delete_own_scope; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY kb_delete_own_scope ON module_kb.knowledge_bases FOR DELETE USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: knowledge_bases kb_insert_own_scope; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY kb_insert_own_scope ON module_kb.knowledge_bases FOR INSERT WITH CHECK (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: knowledge_bases kb_read_own_scope; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY kb_read_own_scope ON module_kb.knowledge_bases FOR SELECT USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: kb_settings; Type: ROW SECURITY; Schema: module_kb; Owner: -
--

ALTER TABLE module_kb.kb_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: kb_settings kb_settings_delete_own_scope; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY kb_settings_delete_own_scope ON module_kb.kb_settings FOR DELETE USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: kb_settings kb_settings_insert_own_scope; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY kb_settings_insert_own_scope ON module_kb.kb_settings FOR INSERT WITH CHECK (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: kb_settings kb_settings_read_own_scope; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY kb_settings_read_own_scope ON module_kb.kb_settings FOR SELECT USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: kb_settings kb_settings_update_own_scope; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY kb_settings_update_own_scope ON module_kb.kb_settings FOR UPDATE USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: kb_source_item_links; Type: ROW SECURITY; Schema: module_kb; Owner: -
--

ALTER TABLE module_kb.kb_source_item_links ENABLE ROW LEVEL SECURITY;

--
-- Name: kb_source_item_links kb_source_item_links_delete_own_scope; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY kb_source_item_links_delete_own_scope ON module_kb.kb_source_item_links FOR DELETE USING ((EXISTS ( SELECT 1
   FROM module_kb.kb_source_items i
  WHERE ((i.id = kb_source_item_links.source_item_id) AND (i.tenant_id = core.current_tenant_id()) AND core.has_scope(i.scope_id)))));

--
-- Name: kb_source_item_links kb_source_item_links_insert_own_scope; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY kb_source_item_links_insert_own_scope ON module_kb.kb_source_item_links FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM module_kb.kb_source_items i
  WHERE ((i.id = kb_source_item_links.source_item_id) AND (i.tenant_id = core.current_tenant_id()) AND core.has_scope(i.scope_id)))));

--
-- Name: kb_source_item_links kb_source_item_links_own_scope; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY kb_source_item_links_own_scope ON module_kb.kb_source_item_links USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id))) WITH CHECK (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: kb_source_item_links kb_source_item_links_read_own_scope; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY kb_source_item_links_read_own_scope ON module_kb.kb_source_item_links FOR SELECT USING ((EXISTS ( SELECT 1
   FROM module_kb.kb_source_items i
  WHERE ((i.id = kb_source_item_links.source_item_id) AND (i.tenant_id = core.current_tenant_id()) AND core.has_scope(i.scope_id)))));

--
-- Name: kb_source_item_media; Type: ROW SECURITY; Schema: module_kb; Owner: -
--

ALTER TABLE module_kb.kb_source_item_media ENABLE ROW LEVEL SECURITY;

--
-- Name: kb_source_item_media kb_source_item_media_delete_own_scope; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY kb_source_item_media_delete_own_scope ON module_kb.kb_source_item_media FOR DELETE USING ((EXISTS ( SELECT 1
   FROM module_kb.kb_source_items i
  WHERE ((i.id = kb_source_item_media.source_item_id) AND (i.tenant_id = core.current_tenant_id()) AND core.has_scope(i.scope_id)))));

--
-- Name: kb_source_item_media kb_source_item_media_insert_own_scope; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY kb_source_item_media_insert_own_scope ON module_kb.kb_source_item_media FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM module_kb.kb_source_items i
  WHERE ((i.id = kb_source_item_media.source_item_id) AND (i.tenant_id = core.current_tenant_id()) AND core.has_scope(i.scope_id)))));

--
-- Name: kb_source_item_media kb_source_item_media_own_scope; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY kb_source_item_media_own_scope ON module_kb.kb_source_item_media USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id))) WITH CHECK (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: kb_source_item_media kb_source_item_media_read_own_scope; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY kb_source_item_media_read_own_scope ON module_kb.kb_source_item_media FOR SELECT USING ((EXISTS ( SELECT 1
   FROM module_kb.kb_source_items i
  WHERE ((i.id = kb_source_item_media.source_item_id) AND (i.tenant_id = core.current_tenant_id()) AND core.has_scope(i.scope_id)))));

--
-- Name: kb_source_item_sections; Type: ROW SECURITY; Schema: module_kb; Owner: -
--

ALTER TABLE module_kb.kb_source_item_sections ENABLE ROW LEVEL SECURITY;

--
-- Name: kb_source_item_sections kb_source_item_sections_delete_own_scope; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY kb_source_item_sections_delete_own_scope ON module_kb.kb_source_item_sections FOR DELETE USING ((EXISTS ( SELECT 1
   FROM module_kb.kb_source_items i
  WHERE ((i.id = kb_source_item_sections.source_item_id) AND (i.tenant_id = core.current_tenant_id()) AND core.has_scope(i.scope_id)))));

--
-- Name: kb_source_item_sections kb_source_item_sections_insert_own_scope; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY kb_source_item_sections_insert_own_scope ON module_kb.kb_source_item_sections FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM module_kb.kb_source_items i
  WHERE ((i.id = kb_source_item_sections.source_item_id) AND (i.tenant_id = core.current_tenant_id()) AND core.has_scope(i.scope_id)))));

--
-- Name: kb_source_item_sections kb_source_item_sections_own_scope; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY kb_source_item_sections_own_scope ON module_kb.kb_source_item_sections USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id))) WITH CHECK (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: kb_source_item_sections kb_source_item_sections_read_own_scope; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY kb_source_item_sections_read_own_scope ON module_kb.kb_source_item_sections FOR SELECT USING ((EXISTS ( SELECT 1
   FROM module_kb.kb_source_items i
  WHERE ((i.id = kb_source_item_sections.source_item_id) AND (i.tenant_id = core.current_tenant_id()) AND core.has_scope(i.scope_id)))));

--
-- Name: kb_source_items; Type: ROW SECURITY; Schema: module_kb; Owner: -
--

ALTER TABLE module_kb.kb_source_items ENABLE ROW LEVEL SECURITY;

--
-- Name: kb_source_items kb_source_items_delete_own_scope; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY kb_source_items_delete_own_scope ON module_kb.kb_source_items FOR DELETE USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: kb_source_items kb_source_items_insert_own_scope; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY kb_source_items_insert_own_scope ON module_kb.kb_source_items FOR INSERT WITH CHECK (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: kb_source_items kb_source_items_read_own_scope; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY kb_source_items_read_own_scope ON module_kb.kb_source_items FOR SELECT USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: kb_source_items kb_source_items_update_own_scope; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY kb_source_items_update_own_scope ON module_kb.kb_source_items FOR UPDATE USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: kb_source_runs; Type: ROW SECURITY; Schema: module_kb; Owner: -
--

ALTER TABLE module_kb.kb_source_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: kb_source_runs kb_source_runs_delete_own_scope; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY kb_source_runs_delete_own_scope ON module_kb.kb_source_runs FOR DELETE USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: kb_source_runs kb_source_runs_insert_own_scope; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY kb_source_runs_insert_own_scope ON module_kb.kb_source_runs FOR INSERT WITH CHECK (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: kb_source_runs kb_source_runs_read_own_scope; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY kb_source_runs_read_own_scope ON module_kb.kb_source_runs FOR SELECT USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: kb_source_runs kb_source_runs_update_own_scope; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY kb_source_runs_update_own_scope ON module_kb.kb_source_runs FOR UPDATE USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: kb_sources; Type: ROW SECURITY; Schema: module_kb; Owner: -
--

ALTER TABLE module_kb.kb_sources ENABLE ROW LEVEL SECURITY;

--
-- Name: kb_sources kb_sources_delete_own_scope; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY kb_sources_delete_own_scope ON module_kb.kb_sources FOR DELETE USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: kb_sources kb_sources_insert_own_scope; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY kb_sources_insert_own_scope ON module_kb.kb_sources FOR INSERT WITH CHECK (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: kb_sources kb_sources_read_own_scope; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY kb_sources_read_own_scope ON module_kb.kb_sources FOR SELECT USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: kb_sources kb_sources_update_own_scope; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY kb_sources_update_own_scope ON module_kb.kb_sources FOR UPDATE USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: knowledge_bases kb_update_own_scope; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY kb_update_own_scope ON module_kb.knowledge_bases FOR UPDATE USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: knowledge_bases; Type: ROW SECURITY; Schema: module_kb; Owner: -
--

ALTER TABLE module_kb.knowledge_bases ENABLE ROW LEVEL SECURITY;

--
-- Name: source_references; Type: ROW SECURITY; Schema: module_kb; Owner: -
--

ALTER TABLE module_kb.source_references ENABLE ROW LEVEL SECURITY;

--
-- Name: source_references source_references_delete_own_scope; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY source_references_delete_own_scope ON module_kb.source_references FOR DELETE USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: source_references source_references_insert_own_scope; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY source_references_insert_own_scope ON module_kb.source_references FOR INSERT WITH CHECK (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: source_references source_references_read_own_scope; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY source_references_read_own_scope ON module_kb.source_references FOR SELECT USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: source_references source_references_update_own_scope; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY source_references_update_own_scope ON module_kb.source_references FOR UPDATE USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: article_comments srv_tenant_isolation; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_kb.article_comments TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: article_tags srv_tenant_isolation; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_kb.article_tags TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: article_templates srv_tenant_isolation; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_kb.article_templates TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: article_versions srv_tenant_isolation; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_kb.article_versions TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: articles srv_tenant_isolation; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_kb.articles TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: attachments srv_tenant_isolation; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_kb.attachments TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: categories srv_tenant_isolation; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_kb.categories TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: faq_tags srv_tenant_isolation; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_kb.faq_tags TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: faq_versions srv_tenant_isolation; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_kb.faq_versions TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: faqs srv_tenant_isolation; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_kb.faqs TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: inbox_items srv_tenant_isolation; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_kb.inbox_items TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: kb_activity_log srv_tenant_isolation; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_kb.kb_activity_log TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: kb_settings srv_tenant_isolation; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_kb.kb_settings TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: kb_source_item_links srv_tenant_isolation; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_kb.kb_source_item_links TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: kb_source_item_media srv_tenant_isolation; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_kb.kb_source_item_media TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: kb_source_item_sections srv_tenant_isolation; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_kb.kb_source_item_sections TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: kb_source_items srv_tenant_isolation; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_kb.kb_source_items TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: kb_source_runs srv_tenant_isolation; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_kb.kb_source_runs TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: kb_sources srv_tenant_isolation; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_kb.kb_sources TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: knowledge_bases srv_tenant_isolation; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_kb.knowledge_bases TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: source_references srv_tenant_isolation; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_kb.source_references TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: tags srv_tenant_isolation; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_kb.tags TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: tags; Type: ROW SECURITY; Schema: module_kb; Owner: -
--

ALTER TABLE module_kb.tags ENABLE ROW LEVEL SECURITY;

--
-- Name: tags tags_delete_own_scope; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY tags_delete_own_scope ON module_kb.tags FOR DELETE USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: tags tags_insert_own_scope; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY tags_insert_own_scope ON module_kb.tags FOR INSERT WITH CHECK (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: tags tags_read_own_scope; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY tags_read_own_scope ON module_kb.tags FOR SELECT USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: tags tags_update_own_scope; Type: POLICY; Schema: module_kb; Owner: -
--

CREATE POLICY tags_update_own_scope ON module_kb.tags FOR UPDATE USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: SCHEMA module_kb; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA module_kb TO service_role;
GRANT USAGE ON SCHEMA module_kb TO authenticated;
GRANT USAGE ON SCHEMA module_kb TO engenty_server;

--
-- Name: FUNCTION kb_articles_fts_search(p_tenant_id uuid, p_scope_id text, p_kb_id text, p_query text, p_limit integer, p_offset integer, p_parent_article_id text, p_top_level_only boolean, p_status text); Type: ACL; Schema: module_kb; Owner: -
--

GRANT ALL ON FUNCTION module_kb.kb_articles_fts_search(p_tenant_id uuid, p_scope_id text, p_kb_id text, p_query text, p_limit integer, p_offset integer, p_parent_article_id text, p_top_level_only boolean, p_status text) TO service_role;

--
-- Name: FUNCTION kb_articles_fts_suggest(p_tenant_id uuid, p_scope_id text, p_kb_id text, p_query text, p_limit integer); Type: ACL; Schema: module_kb; Owner: -
--

GRANT ALL ON FUNCTION module_kb.kb_articles_fts_suggest(p_tenant_id uuid, p_scope_id text, p_kb_id text, p_query text, p_limit integer) TO service_role;

--
-- Name: FUNCTION kb_seed_default_category(); Type: ACL; Schema: module_kb; Owner: -
--

GRANT ALL ON FUNCTION module_kb.kb_seed_default_category() TO service_role;

--
-- Name: TABLE article_comments; Type: ACL; Schema: module_kb; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_kb.article_comments TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_kb.article_comments TO engenty_server;

--
-- Name: TABLE article_tags; Type: ACL; Schema: module_kb; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_kb.article_tags TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_kb.article_tags TO engenty_server;

--
-- Name: TABLE article_templates; Type: ACL; Schema: module_kb; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_kb.article_templates TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_kb.article_templates TO engenty_server;

--
-- Name: TABLE article_versions; Type: ACL; Schema: module_kb; Owner: -
--

GRANT SELECT,INSERT ON TABLE module_kb.article_versions TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_kb.article_versions TO engenty_server;

--
-- Name: TABLE articles; Type: ACL; Schema: module_kb; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_kb.articles TO service_role;
GRANT SELECT ON TABLE module_kb.articles TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_kb.articles TO engenty_server;

--
-- Name: TABLE attachments; Type: ACL; Schema: module_kb; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_kb.attachments TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_kb.attachments TO engenty_server;

--
-- Name: TABLE categories; Type: ACL; Schema: module_kb; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_kb.categories TO service_role;
GRANT SELECT ON TABLE module_kb.categories TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_kb.categories TO engenty_server;

--
-- Name: TABLE faq_tags; Type: ACL; Schema: module_kb; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_kb.faq_tags TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_kb.faq_tags TO engenty_server;

--
-- Name: TABLE faq_versions; Type: ACL; Schema: module_kb; Owner: -
--

GRANT SELECT,INSERT ON TABLE module_kb.faq_versions TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_kb.faq_versions TO engenty_server;

--
-- Name: TABLE faqs; Type: ACL; Schema: module_kb; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_kb.faqs TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_kb.faqs TO engenty_server;

--
-- Name: TABLE inbox_items; Type: ACL; Schema: module_kb; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_kb.inbox_items TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_kb.inbox_items TO engenty_server;

--
-- Name: TABLE kb_activity_log; Type: ACL; Schema: module_kb; Owner: -
--

GRANT SELECT,INSERT ON TABLE module_kb.kb_activity_log TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_kb.kb_activity_log TO engenty_server;

--
-- Name: TABLE kb_settings; Type: ACL; Schema: module_kb; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_kb.kb_settings TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_kb.kb_settings TO engenty_server;

--
-- Name: TABLE kb_source_item_links; Type: ACL; Schema: module_kb; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_kb.kb_source_item_links TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_kb.kb_source_item_links TO engenty_server;

--
-- Name: TABLE kb_source_item_media; Type: ACL; Schema: module_kb; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_kb.kb_source_item_media TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_kb.kb_source_item_media TO engenty_server;

--
-- Name: TABLE kb_source_item_sections; Type: ACL; Schema: module_kb; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_kb.kb_source_item_sections TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_kb.kb_source_item_sections TO engenty_server;

--
-- Name: TABLE kb_source_items; Type: ACL; Schema: module_kb; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_kb.kb_source_items TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_kb.kb_source_items TO engenty_server;

--
-- Name: TABLE kb_source_runs; Type: ACL; Schema: module_kb; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_kb.kb_source_runs TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_kb.kb_source_runs TO engenty_server;

--
-- Name: TABLE kb_sources; Type: ACL; Schema: module_kb; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_kb.kb_sources TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_kb.kb_sources TO engenty_server;

--
-- Name: TABLE knowledge_bases; Type: ACL; Schema: module_kb; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_kb.knowledge_bases TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_kb.knowledge_bases TO engenty_server;

--
-- Name: TABLE source_references; Type: ACL; Schema: module_kb; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_kb.source_references TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_kb.source_references TO engenty_server;

--
-- Name: TABLE tags; Type: ACL; Schema: module_kb; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_kb.tags TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_kb.tags TO engenty_server;

--
--

-- Rows these migrations seeded.

SET check_function_bodies = false;

--
-- Data for Name: knowledge_bases; Type: TABLE DATA; Schema: module_kb; Owner: postgres
--


--
-- Data for Name: article_templates; Type: TABLE DATA; Schema: module_kb; Owner: postgres
--


--
-- Data for Name: categories; Type: TABLE DATA; Schema: module_kb; Owner: postgres
--


--
-- Data for Name: articles; Type: TABLE DATA; Schema: module_kb; Owner: postgres
--


--
-- Data for Name: article_comments; Type: TABLE DATA; Schema: module_kb; Owner: postgres
--


--
-- Data for Name: tags; Type: TABLE DATA; Schema: module_kb; Owner: postgres
--


--
-- Data for Name: article_tags; Type: TABLE DATA; Schema: module_kb; Owner: postgres
--


--
-- Data for Name: article_versions; Type: TABLE DATA; Schema: module_kb; Owner: postgres
--


--
-- Data for Name: attachments; Type: TABLE DATA; Schema: module_kb; Owner: postgres
--


--
-- Data for Name: faqs; Type: TABLE DATA; Schema: module_kb; Owner: postgres
--


--
-- Data for Name: faq_tags; Type: TABLE DATA; Schema: module_kb; Owner: postgres
--


--
-- Data for Name: faq_versions; Type: TABLE DATA; Schema: module_kb; Owner: postgres
--


--
-- Data for Name: inbox_items; Type: TABLE DATA; Schema: module_kb; Owner: postgres
--


--
-- Data for Name: kb_activity_log; Type: TABLE DATA; Schema: module_kb; Owner: postgres
--


--
-- Data for Name: kb_settings; Type: TABLE DATA; Schema: module_kb; Owner: postgres
--


--
-- Data for Name: kb_sources; Type: TABLE DATA; Schema: module_kb; Owner: postgres
--


--
-- Data for Name: kb_source_items; Type: TABLE DATA; Schema: module_kb; Owner: postgres
--


--
-- Data for Name: kb_source_item_links; Type: TABLE DATA; Schema: module_kb; Owner: postgres
--


--
-- Data for Name: kb_source_item_media; Type: TABLE DATA; Schema: module_kb; Owner: postgres
--


--
-- Data for Name: kb_source_item_sections; Type: TABLE DATA; Schema: module_kb; Owner: postgres
--


--
-- Data for Name: kb_source_runs; Type: TABLE DATA; Schema: module_kb; Owner: postgres
--


--
-- Data for Name: source_references; Type: TABLE DATA; Schema: module_kb; Owner: postgres
--


--
--

RESET check_function_bodies;
