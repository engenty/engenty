-- Consolidated knowledge-base baseline (pre-launch).

-- >>> from 20260322120000_plugin_kb.sql
-- Squashed knowledge-base module schema (pre-launch baseline).

-- >>> from 20260322120000_plugin_kb.sql
-- Knowledge Base module: knowledge_bases, categories (tree), articles, tags, faqs, attachments, embeddings.

create schema if not exists module_kb;

-- Enable pgvector for embeddings
create extension if not exists vector;

-- ── Knowledge Bases ──
create table if not exists module_kb.knowledge_bases (
  id text primary key,
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  scope_id text not null,
  name text not null,
  slug text not null,
  description text,
  is_default boolean not null default false,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (tenant_id, scope_id, slug)
);

create index if not exists idx_module_kb_knowledge_bases_scope
  on module_kb.knowledge_bases (tenant_id, scope_id) where deleted_at is null;

-- ── Categories (tree) ──
create table if not exists module_kb.categories (
  id text primary key,
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  scope_id text not null,
  kb_id text not null references module_kb.knowledge_bases(id) on delete cascade,
  parent_id text references module_kb.categories(id) on delete set null,
  name text not null,
  slug text not null,
  description text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_module_kb_categories_kb
  on module_kb.categories (kb_id, parent_id, sort_order);

create index if not exists idx_module_kb_categories_scope
  on module_kb.categories (tenant_id, scope_id);

-- ── Tags ──
create table if not exists module_kb.tags (
  id text primary key,
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  scope_id text not null,
  kb_id text not null references module_kb.knowledge_bases(id) on delete cascade,
  name text not null,
  slug text not null,
  color text,
  created_at timestamptz not null default now(),
  unique (kb_id, slug)
);

create index if not exists idx_module_kb_tags_kb
  on module_kb.tags (kb_id);

-- ── Articles ──
create table if not exists module_kb.articles (
  id text primary key,
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  scope_id text not null,
  kb_id text not null references module_kb.knowledge_bases(id) on delete cascade,
  category_id text references module_kb.categories(id) on delete set null,
  title text not null,
  slug text not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  content_json jsonb,
  content_markdown text,
  summary text,
  questions_answered jsonb default '[]'::jsonb,
  original_document_url text,
  original_document_name text,
  created_by text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  deleted_at timestamptz,
  unique (kb_id, slug)
);

create index if not exists idx_module_kb_articles_kb
  on module_kb.articles (kb_id, category_id, sort_order) where deleted_at is null;

create index if not exists idx_module_kb_articles_scope
  on module_kb.articles (tenant_id, scope_id, updated_at desc) where deleted_at is null;

create index if not exists idx_module_kb_articles_status
  on module_kb.articles (status) where deleted_at is null;

-- Full-text search index on articles
create index if not exists idx_module_kb_articles_fts
  on module_kb.articles using gin (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content_markdown, '')))
  where deleted_at is null;

-- ── Article Tags (M:N) ──
create table if not exists module_kb.article_tags (
  article_id text not null references module_kb.articles(id) on delete cascade,
  tag_id text not null references module_kb.tags(id) on delete cascade,
  primary key (article_id, tag_id)
);

create index if not exists idx_module_kb_article_tags_tag
  on module_kb.article_tags (tag_id);

-- ── Attachments ──
create table if not exists module_kb.attachments (
  id text primary key,
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  scope_id text not null,
  article_id text not null references module_kb.articles(id) on delete cascade,
  filename text not null,
  storage_key text not null,
  mime_type text not null default 'application/octet-stream',
  size_bytes bigint not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_module_kb_attachments_article
  on module_kb.attachments (article_id);

-- ── FAQs ──
create table if not exists module_kb.faqs (
  id text primary key,
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  scope_id text not null,
  kb_id text not null references module_kb.knowledge_bases(id) on delete cascade,
  category_id text references module_kb.categories(id) on delete set null,
  question text not null,
  answer_json jsonb,
  answer_markdown text,
  sort_order integer not null default 0,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_module_kb_faqs_kb
  on module_kb.faqs (kb_id, category_id, sort_order) where deleted_at is null;

create index if not exists idx_module_kb_faqs_scope
  on module_kb.faqs (tenant_id, scope_id) where deleted_at is null;

-- ── FAQ Tags (M:N) ──
create table if not exists module_kb.faq_tags (
  faq_id text not null references module_kb.faqs(id) on delete cascade,
  tag_id text not null references module_kb.tags(id) on delete cascade,
  primary key (faq_id, tag_id)
);

-- ── Article Embeddings (pgvector) ──
create table if not exists module_kb.article_embeddings (
  id text primary key,
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  article_id text not null references module_kb.articles(id) on delete cascade,
  chunk_index integer not null,
  chunk_text text not null,
  embedding vector(1536),
  created_at timestamptz not null default now(),
  unique (article_id, chunk_index)
);

create index if not exists idx_module_kb_article_embeddings_article
  on module_kb.article_embeddings (article_id);

-- HNSW index for fast approximate nearest neighbour search
create index if not exists idx_module_kb_article_embeddings_vector
  on module_kb.article_embeddings using hnsw (embedding vector_cosine_ops);

-- ── KB Settings ──
create table if not exists module_kb.kb_settings (
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  scope_id text not null,
  default_kb_id text references module_kb.knowledge_bases(id) on delete set null,
  embedding_model text not null default 'openai/text-embedding-3-small',
  auto_generate_summary boolean not null default true,
  auto_generate_questions boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, scope_id)
);

-- ── Grants ──
grant usage on schema module_kb to service_role;
grant select, insert, update, delete on module_kb.knowledge_bases to service_role;
grant select, insert, update, delete on module_kb.categories to service_role;
grant select, insert, update, delete on module_kb.tags to service_role;
grant select, insert, update, delete on module_kb.articles to service_role;
grant select, insert, update, delete on module_kb.article_tags to service_role;
grant select, insert, update, delete on module_kb.attachments to service_role;
grant select, insert, update, delete on module_kb.faqs to service_role;
grant select, insert, update, delete on module_kb.faq_tags to service_role;
grant select, insert, update, delete on module_kb.article_embeddings to service_role;
grant select, insert, update, delete on module_kb.kb_settings to service_role;

-- ── Row Level Security ──
alter table module_kb.knowledge_bases enable row level security;
alter table module_kb.categories enable row level security;
alter table module_kb.tags enable row level security;
alter table module_kb.articles enable row level security;
alter table module_kb.article_tags enable row level security;
alter table module_kb.attachments enable row level security;
alter table module_kb.faqs enable row level security;
alter table module_kb.faq_tags enable row level security;
alter table module_kb.article_embeddings enable row level security;
alter table module_kb.kb_settings enable row level security;

-- ── RLS Policies: knowledge_bases ──
create policy kb_read_own_scope on module_kb.knowledge_bases
for select using (tenant_id = core.current_tenant_id() and core.has_scope(scope_id));

create policy kb_insert_own_scope on module_kb.knowledge_bases
for insert with check (tenant_id = core.current_tenant_id() and core.has_scope(scope_id));

create policy kb_update_own_scope on module_kb.knowledge_bases
for update using (tenant_id = core.current_tenant_id() and core.has_scope(scope_id));

create policy kb_delete_own_scope on module_kb.knowledge_bases
for delete using (tenant_id = core.current_tenant_id() and core.has_scope(scope_id));

-- ── RLS Policies: categories ──
create policy categories_read_own_scope on module_kb.categories
for select using (tenant_id = core.current_tenant_id() and core.has_scope(scope_id));

create policy categories_insert_own_scope on module_kb.categories
for insert with check (tenant_id = core.current_tenant_id() and core.has_scope(scope_id));

create policy categories_update_own_scope on module_kb.categories
for update using (tenant_id = core.current_tenant_id() and core.has_scope(scope_id));

create policy categories_delete_own_scope on module_kb.categories
for delete using (tenant_id = core.current_tenant_id() and core.has_scope(scope_id));

-- ── RLS Policies: tags ──
create policy tags_read_own_scope on module_kb.tags
for select using (tenant_id = core.current_tenant_id() and core.has_scope(scope_id));

create policy tags_insert_own_scope on module_kb.tags
for insert with check (tenant_id = core.current_tenant_id() and core.has_scope(scope_id));

create policy tags_update_own_scope on module_kb.tags
for update using (tenant_id = core.current_tenant_id() and core.has_scope(scope_id));

create policy tags_delete_own_scope on module_kb.tags
for delete using (tenant_id = core.current_tenant_id() and core.has_scope(scope_id));

-- ── RLS Policies: articles ──
create policy articles_read_own_scope on module_kb.articles
for select using (tenant_id = core.current_tenant_id() and core.has_scope(scope_id));

create policy articles_insert_own_scope on module_kb.articles
for insert with check (tenant_id = core.current_tenant_id() and core.has_scope(scope_id));

create policy articles_update_own_scope on module_kb.articles
for update using (tenant_id = core.current_tenant_id() and core.has_scope(scope_id));

create policy articles_delete_own_scope on module_kb.articles
for delete using (tenant_id = core.current_tenant_id() and core.has_scope(scope_id));

-- ── RLS Policies: article_tags (via parent article) ──
create policy article_tags_read_own_scope on module_kb.article_tags
for select using (exists (
  select 1 from module_kb.articles a where a.id = article_tags.article_id
  and a.tenant_id = core.current_tenant_id() and core.has_scope(a.scope_id)
));

create policy article_tags_insert_own_scope on module_kb.article_tags
for insert with check (exists (
  select 1 from module_kb.articles a where a.id = article_tags.article_id
  and a.tenant_id = core.current_tenant_id() and core.has_scope(a.scope_id)
));

create policy article_tags_delete_own_scope on module_kb.article_tags
for delete using (exists (
  select 1 from module_kb.articles a where a.id = article_tags.article_id
  and a.tenant_id = core.current_tenant_id() and core.has_scope(a.scope_id)
));

-- ── RLS Policies: attachments (via parent article) ──
create policy attachments_read_own_scope on module_kb.attachments
for select using (tenant_id = core.current_tenant_id() and core.has_scope(scope_id));

create policy attachments_insert_own_scope on module_kb.attachments
for insert with check (tenant_id = core.current_tenant_id() and core.has_scope(scope_id));

create policy attachments_delete_own_scope on module_kb.attachments
for delete using (tenant_id = core.current_tenant_id() and core.has_scope(scope_id));

-- ── RLS Policies: faqs ──
create policy faqs_read_own_scope on module_kb.faqs
for select using (tenant_id = core.current_tenant_id() and core.has_scope(scope_id));

create policy faqs_insert_own_scope on module_kb.faqs
for insert with check (tenant_id = core.current_tenant_id() and core.has_scope(scope_id));

create policy faqs_update_own_scope on module_kb.faqs
for update using (tenant_id = core.current_tenant_id() and core.has_scope(scope_id));

create policy faqs_delete_own_scope on module_kb.faqs
for delete using (tenant_id = core.current_tenant_id() and core.has_scope(scope_id));

-- ── RLS Policies: faq_tags (via parent faq) ──
create policy faq_tags_read_own_scope on module_kb.faq_tags
for select using (exists (
  select 1 from module_kb.faqs f where f.id = faq_tags.faq_id
  and f.tenant_id = core.current_tenant_id() and core.has_scope(f.scope_id)
));

create policy faq_tags_insert_own_scope on module_kb.faq_tags
for insert with check (exists (
  select 1 from module_kb.faqs f where f.id = faq_tags.faq_id
  and f.tenant_id = core.current_tenant_id() and core.has_scope(f.scope_id)
));

create policy faq_tags_delete_own_scope on module_kb.faq_tags
for delete using (exists (
  select 1 from module_kb.faqs f where f.id = faq_tags.faq_id
  and f.tenant_id = core.current_tenant_id() and core.has_scope(f.scope_id)
));

-- ── RLS Policies: article_embeddings (via parent article) ──
create policy embeddings_read_own_scope on module_kb.article_embeddings
for select using (exists (
  select 1 from module_kb.articles a where a.id = article_embeddings.article_id
  and a.tenant_id = core.current_tenant_id() and core.has_scope(a.scope_id)
));

create policy embeddings_insert_own_scope on module_kb.article_embeddings
for insert with check (exists (
  select 1 from module_kb.articles a where a.id = article_embeddings.article_id
  and a.tenant_id = core.current_tenant_id() and core.has_scope(a.scope_id)
));

create policy embeddings_delete_own_scope on module_kb.article_embeddings
for delete using (exists (
  select 1 from module_kb.articles a where a.id = article_embeddings.article_id
  and a.tenant_id = core.current_tenant_id() and core.has_scope(a.scope_id)
));

-- ── RLS Policies: kb_settings ──
create policy kb_settings_read_own_scope on module_kb.kb_settings
for select using (tenant_id = core.current_tenant_id() and core.has_scope(scope_id));

create policy kb_settings_insert_own_scope on module_kb.kb_settings
for insert with check (tenant_id = core.current_tenant_id() and core.has_scope(scope_id));

create policy kb_settings_update_own_scope on module_kb.kb_settings
for update using (tenant_id = core.current_tenant_id() and core.has_scope(scope_id));

-- >>> from 20260322213659_plugin_kb_unique_fix.sql
-- Fix unique constraint on knowledge_bases slug to allow reuse of deleted slugs
alter table module_kb.knowledge_bases drop constraint if exists knowledge_bases_tenant_id_scope_id_slug_key;

create unique index if not exists idx_module_kb_knowledge_bases_slug_unique
  on module_kb.knowledge_bases (tenant_id, scope_id, slug)
  where deleted_at is null;

-- Also fix articles unique constraint which has the same issue
alter table module_kb.articles drop constraint if exists articles_kb_id_slug_key;

create unique index if not exists idx_module_kb_articles_slug_unique
  on module_kb.articles (kb_id, slug)
  where deleted_at is null;

-- >>> from 20260417120000_plugin_kb_parent_article.sql
-- Article-to-article hierarchy (nested pages).

alter table module_kb.articles
  add column if not exists parent_article_id text references module_kb.articles(id) on delete set null;

create index if not exists idx_module_kb_articles_parent_siblings
  on module_kb.articles (kb_id, parent_article_id, category_id, sort_order, title)
  where deleted_at is null;

-- >>> from 20260417120100_plugin_kb_fts.sql
-- Full-text search helpers (Postgres tsvector + ts_rank_cd).

create or replace function module_kb.kb_articles_fts_search(
  p_tenant_id uuid,
  p_scope_id text,
  p_kb_id text,
  p_query text,
  p_limit int,
  p_offset int,
  p_category_id text default null,
  p_parent_article_id text default null,
  p_top_level_only boolean default false,
  p_status text default null
)
returns jsonb
language sql
stable
as $$
  with q as (
    select websearch_to_tsquery('english', nullif(trim(p_query), '')) as tsq
  ),
  base as (
    select
      a.id,
      ts_rank_cd(
        to_tsvector('english', coalesce(a.title, '') || ' ' || coalesce(a.content_markdown, '')),
        q.tsq
      ) as rank
    from module_kb.articles a
    cross join q
    where a.tenant_id = p_tenant_id
      and a.scope_id = p_scope_id
      and a.kb_id = p_kb_id
      and a.deleted_at is null
      and q.tsq is not null
      and to_tsvector('english', coalesce(a.title, '') || ' ' || coalesce(a.content_markdown, '')) @@ q.tsq
      and (p_category_id is null or a.category_id = p_category_id)
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

create or replace function module_kb.kb_articles_fts_suggest(
  p_tenant_id uuid,
  p_scope_id text,
  p_kb_id text,
  p_query text,
  p_limit int
)
returns jsonb
language sql
stable
as $$
  with q as (
    select websearch_to_tsquery('english', nullif(trim(p_query), '')) as tsq
  ),
  base as (
    select
      a.id,
      a.title,
      a.kb_id,
      ts_rank_cd(
        to_tsvector('english', coalesce(a.title, '') || ' ' || coalesce(a.content_markdown, '')),
        q.tsq
      ) as rank,
      ts_headline(
        'english',
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
      and to_tsvector('english', coalesce(a.title, '') || ' ' || coalesce(a.content_markdown, '')) @@ q.tsq
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

grant execute on function module_kb.kb_articles_fts_search(uuid, text, text, text, int, int, text, text, boolean, text) to service_role;
grant execute on function module_kb.kb_articles_fts_suggest(uuid, text, text, text, int) to service_role;

-- >>> from 20260418120000_plugin_kb_article_updated_by.sql
-- Track who last updated an article (core user id / principal).

alter table module_kb.articles
  add column if not exists updated_by text;

comment on column module_kb.articles.updated_by is
  'Principal (core user) id of the last editor; set by API on create/update.';

-- >>> from 20260502120000_plugin_kb_inbox_llm_wiki.sql
-- KB LLM Wiki: inbox (raw capture), source provenance, activity log, vector search RPC.

-- ── Inbox items (immutable-ish raw layer; edits allowed until promoted/discarded) ──
create table if not exists module_kb.inbox_items (
  id text primary key,
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  scope_id text not null,
  kb_id text not null references module_kb.knowledge_bases(id) on delete cascade,
  title text not null,
  source_type text not null default 'paste'
    check (source_type in ('paste', 'url', 'file', 'chat', 'other')),
  source_url text,
  raw_markdown text,
  raw_text text,
  metadata jsonb not null default '{}'::jsonb,
  triage_summary text,
  triage_metadata jsonb,
  status text not null default 'new'
    check (status in ('new', 'triaged', 'needs_review', 'promoted', 'discarded', 'failed')),
  captured_at timestamptz not null default now(),
  processed_at timestamptz,
  promoted_article_id text references module_kb.articles(id) on delete set null,
  promoted_faq_id text references module_kb.faqs(id) on delete set null,
  discarded_at timestamptz,
  original_storage_path text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_module_kb_inbox_items_kb_status
  on module_kb.inbox_items (kb_id, status, captured_at desc);

create index if not exists idx_module_kb_inbox_items_scope
  on module_kb.inbox_items (tenant_id, scope_id);

-- ── Source references (compiled article/FAQ → raw inbox or external source) ──
create table if not exists module_kb.source_references (
  id text primary key,
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  scope_id text not null,
  article_id text references module_kb.articles(id) on delete cascade,
  faq_id text references module_kb.faqs(id) on delete cascade,
  inbox_item_id text references module_kb.inbox_items(id) on delete set null,
  excerpt text,
  locator text,
  source_url text,
  original_storage_path text,
  created_at timestamptz not null default now(),
  check (
    (article_id is not null and faq_id is null)
    or (faq_id is not null and article_id is null)
  )
);

create index if not exists idx_module_kb_source_references_article
  on module_kb.source_references (article_id) where article_id is not null;

create index if not exists idx_module_kb_source_references_faq
  on module_kb.source_references (faq_id) where faq_id is not null;

create index if not exists idx_module_kb_source_references_inbox
  on module_kb.source_references (inbox_item_id) where inbox_item_id is not null;

-- ── Append-only activity log ──
create table if not exists module_kb.kb_activity_log (
  id text primary key,
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  scope_id text not null,
  kb_id text references module_kb.knowledge_bases(id) on delete set null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  actor_id text,
  created_at timestamptz not null default now()
);

create index if not exists idx_module_kb_activity_log_scope_time
  on module_kb.kb_activity_log (tenant_id, scope_id, created_at desc);

create index if not exists idx_module_kb_activity_log_kb
  on module_kb.kb_activity_log (kb_id, created_at desc) where kb_id is not null;

-- ── Grants ──
grant select, insert, update, delete on module_kb.inbox_items to service_role;
grant select, insert, update, delete on module_kb.source_references to service_role;
grant select, insert on module_kb.kb_activity_log to service_role;

-- ── RLS ──
alter table module_kb.inbox_items enable row level security;
alter table module_kb.source_references enable row level security;
alter table module_kb.kb_activity_log enable row level security;

create policy inbox_items_read_own_scope on module_kb.inbox_items
for select using (tenant_id = core.current_tenant_id() and core.has_scope(scope_id));

create policy inbox_items_insert_own_scope on module_kb.inbox_items
for insert with check (tenant_id = core.current_tenant_id() and core.has_scope(scope_id));

create policy inbox_items_update_own_scope on module_kb.inbox_items
for update using (tenant_id = core.current_tenant_id() and core.has_scope(scope_id));

create policy inbox_items_delete_own_scope on module_kb.inbox_items
for delete using (tenant_id = core.current_tenant_id() and core.has_scope(scope_id));

create policy source_references_read_own_scope on module_kb.source_references
for select using (tenant_id = core.current_tenant_id() and core.has_scope(scope_id));

create policy source_references_insert_own_scope on module_kb.source_references
for insert with check (tenant_id = core.current_tenant_id() and core.has_scope(scope_id));

create policy source_references_update_own_scope on module_kb.source_references
for update using (tenant_id = core.current_tenant_id() and core.has_scope(scope_id));

create policy source_references_delete_own_scope on module_kb.source_references
for delete using (tenant_id = core.current_tenant_id() and core.has_scope(scope_id));

create policy kb_activity_log_read_own_scope on module_kb.kb_activity_log
for select using (tenant_id = core.current_tenant_id() and core.has_scope(scope_id));

create policy kb_activity_log_insert_own_scope on module_kb.kb_activity_log
for insert with check (tenant_id = core.current_tenant_id() and core.has_scope(scope_id));

-- ── Vector search over article_embeddings (scoped by tenant + KB) ──
create or replace function module_kb.search_kb_embeddings(
  p_tenant_id uuid,
  p_scope_id text,
  p_kb_id text,
  p_embedding text,
  p_match_threshold double precision default 0.7,
  p_match_count integer default 5
)
returns table (
  article_id text,
  title text,
  chunk_text text,
  similarity double precision
)
language plpgsql
stable
as $$
declare
  qemb vector(1536);
begin
  if p_embedding is null or btrim(p_embedding) = '' or p_embedding = '[]' then
    return;
  end if;
  begin
    qemb := p_embedding::vector;
  exception when others then
    return;
  end;

  return query
  select
    ae.article_id,
    a.title::text,
    ae.chunk_text::text,
    (1.0 - (ae.embedding <=> qemb))::double precision as similarity
  from module_kb.article_embeddings ae
  inner join module_kb.articles a
    on a.id = ae.article_id
    and a.deleted_at is null
    and a.tenant_id = p_tenant_id
    and a.scope_id = p_scope_id
    and a.kb_id = p_kb_id
  where ae.tenant_id = p_tenant_id
    and ae.embedding is not null
    and (1.0 - (ae.embedding <=> qemb)) >= p_match_threshold
  order by ae.embedding <=> qemb
  limit greatest(1, least(p_match_count, 50));
end;
$$;

grant execute on function module_kb.search_kb_embeddings(uuid, text, text, text, double precision, integer) to service_role;

-- >>> from 20260503140000_plugin_kb_article_custom_properties.sql
-- Article custom properties (flat key/value for YAML frontmatter export).
ALTER TABLE module_kb.articles
  ADD COLUMN IF NOT EXISTS custom_properties jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Per-KB schema for custom article property definitions.
ALTER TABLE module_kb.knowledge_bases
  ADD COLUMN IF NOT EXISTS article_property_definitions jsonb NOT NULL DEFAULT '[]'::jsonb;

-- >>> from 20260503180000_plugin_kb_sidebar_article_tree_defaults.sql
-- Per-KB article sidebar tree defaults live on `kb_settings` (one row per tenant/scope), not on `knowledge_bases`.
ALTER TABLE module_kb.kb_settings
  ADD COLUMN IF NOT EXISTS sidebar_article_tree_defaults_by_kb jsonb NOT null default '{}'::jsonb;

ALTER TABLE module_kb.knowledge_bases
  DROP COLUMN IF EXISTS sidebar_article_tree_defaults;

-- >>> from 20260504103000_plugin_kb_article_removed_locked.sql
-- Article trash status + page lock (soft-delete still sets deleted_at).

alter table module_kb.articles drop constraint if exists articles_status_check;

alter table module_kb.articles
  add constraint articles_status_check
  check (status in ('draft', 'published', 'archived', 'removed'));

alter table module_kb.articles
  add column if not exists locked_at timestamptz null;

-- >>> from 20260504140000_plugin_kb_article_faq_versions.sql
-- Version history snapshots for KB articles and FAQs (edit history).

create table if not exists module_kb.article_versions (
  id text primary key,
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  scope_id text not null,
  article_id text not null references module_kb.articles(id) on delete cascade,
  version integer not null,
  snapshot jsonb not null,
  created_by text,
  created_at timestamptz not null default now(),
  unique (article_id, version)
);

create index if not exists idx_module_kb_article_versions_lookup
  on module_kb.article_versions (tenant_id, scope_id, article_id, version desc);

create table if not exists module_kb.faq_versions (
  id text primary key,
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  scope_id text not null,
  faq_id text not null references module_kb.faqs(id) on delete cascade,
  version integer not null,
  snapshot jsonb not null,
  created_by text,
  created_at timestamptz not null default now(),
  unique (faq_id, version)
);

create index if not exists idx_module_kb_faq_versions_lookup
  on module_kb.faq_versions (tenant_id, scope_id, faq_id, version desc);

grant select, insert on module_kb.article_versions to service_role;
grant select, insert on module_kb.faq_versions to service_role;

-- >>> from 20260504153000_plugin_kb_dynamic_sources.sql
-- KB dynamic sources: persistent web sources, retrieved items, run history.

create table if not exists module_kb.kb_sources (
  id text primary key,
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  scope_id text not null,
  kb_id text not null references module_kb.knowledge_bases(id) on delete cascade,
  adapter_id text not null check (adapter_id in ('url', 'sitemap', 'web_index')),
  name text not null,
  settings jsonb not null default '{}'::jsonb,
  schedule jsonb not null default '{"enabled": false, "interval_minutes": null, "timezone": "UTC"}'::jsonb,
  enabled boolean not null default true,
  status text not null default 'active' check (status in ('active', 'paused', 'failed')),
  missing_item_strategy text not null default 'ignore'
    check (missing_item_strategy in ('ignore', 'mark_missing', 'set_draft', 'delete')),
  webhook_token_hash text,
  last_run_at timestamptz,
  last_run_status text check (last_run_status in ('running', 'succeeded', 'skipped', 'failed')),
  last_error text,
  next_run_at timestamptz,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_module_kb_sources_kb_status
  on module_kb.kb_sources (kb_id, status, updated_at desc);

create index if not exists idx_module_kb_sources_due
  on module_kb.kb_sources (tenant_id, scope_id, enabled, next_run_at)
  where enabled = true and next_run_at is not null;

create table if not exists module_kb.kb_source_items (
  id text primary key,
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  scope_id text not null,
  kb_id text not null references module_kb.knowledge_bases(id) on delete cascade,
  source_id text not null references module_kb.kb_sources(id) on delete cascade,
  adapter_item_key text not null,
  title text,
  source_url text,
  locator text,
  metadata jsonb not null default '{}'::jsonb,
  content_hash text,
  status text not null default 'active'
    check (status in ('active', 'ignored', 'missing', 'draft', 'deleted')),
  inbox_item_id text references module_kb.inbox_items(id) on delete set null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz,
  missing_since timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_id, adapter_item_key)
);

create index if not exists idx_module_kb_source_items_source_status
  on module_kb.kb_source_items (source_id, status, updated_at desc);

create index if not exists idx_module_kb_source_items_inbox
  on module_kb.kb_source_items (inbox_item_id) where inbox_item_id is not null;

create table if not exists module_kb.kb_source_runs (
  id text primary key,
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  scope_id text not null,
  kb_id text not null references module_kb.knowledge_bases(id) on delete cascade,
  source_id text not null references module_kb.kb_sources(id) on delete cascade,
  trigger text not null check (trigger in ('manual', 'schedule', 'webhook')),
  status text not null default 'running'
    check (status in ('running', 'succeeded', 'skipped', 'failed')),
  created_items integer not null default 0,
  updated_items integer not null default 0,
  skipped_items integer not null default 0,
  error text,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists idx_module_kb_source_runs_source_time
  on module_kb.kb_source_runs (source_id, started_at desc);

grant select, insert, update, delete on module_kb.kb_sources to service_role;
grant select, insert, update, delete on module_kb.kb_source_items to service_role;
grant select, insert, update, delete on module_kb.kb_source_runs to service_role;

alter table module_kb.kb_sources enable row level security;
alter table module_kb.kb_source_items enable row level security;
alter table module_kb.kb_source_runs enable row level security;

create policy kb_sources_read_own_scope on module_kb.kb_sources
for select using (tenant_id = core.current_tenant_id() and core.has_scope(scope_id));

create policy kb_sources_insert_own_scope on module_kb.kb_sources
for insert with check (tenant_id = core.current_tenant_id() and core.has_scope(scope_id));

create policy kb_sources_update_own_scope on module_kb.kb_sources
for update using (tenant_id = core.current_tenant_id() and core.has_scope(scope_id));

create policy kb_sources_delete_own_scope on module_kb.kb_sources
for delete using (tenant_id = core.current_tenant_id() and core.has_scope(scope_id));

create policy kb_source_items_read_own_scope on module_kb.kb_source_items
for select using (tenant_id = core.current_tenant_id() and core.has_scope(scope_id));

create policy kb_source_items_insert_own_scope on module_kb.kb_source_items
for insert with check (tenant_id = core.current_tenant_id() and core.has_scope(scope_id));

create policy kb_source_items_update_own_scope on module_kb.kb_source_items
for update using (tenant_id = core.current_tenant_id() and core.has_scope(scope_id));

create policy kb_source_items_delete_own_scope on module_kb.kb_source_items
for delete using (tenant_id = core.current_tenant_id() and core.has_scope(scope_id));

create policy kb_source_runs_read_own_scope on module_kb.kb_source_runs
for select using (tenant_id = core.current_tenant_id() and core.has_scope(scope_id));

create policy kb_source_runs_insert_own_scope on module_kb.kb_source_runs
for insert with check (tenant_id = core.current_tenant_id() and core.has_scope(scope_id));

create policy kb_source_runs_update_own_scope on module_kb.kb_source_runs
for update using (tenant_id = core.current_tenant_id() and core.has_scope(scope_id));

create policy kb_source_runs_delete_own_scope on module_kb.kb_source_runs
for delete using (tenant_id = core.current_tenant_id() and core.has_scope(scope_id));

-- >>> from 20260504180000_plugin_kb_firecrawl_url_adapter.sql
-- Allow dedicated Firecrawl URL document source (separate from HTTP fetch `url` adapter).

alter table module_kb.kb_sources
  drop constraint if exists kb_sources_adapter_id_check;

alter table module_kb.kb_sources
  add constraint kb_sources_adapter_id_check
  check (adapter_id in ('url', 'sitemap', 'web_index', 'firecrawl_url'));

-- >>> from 20260505120000_plugin_kb_manual_file_upload_adapters.sql
-- Allow manual entry and file-upload KB sources (no scheduled fetch; registry supplies schemas).

alter table module_kb.kb_sources
  drop constraint if exists kb_sources_adapter_id_check;

alter table module_kb.kb_sources
  add constraint kb_sources_adapter_id_check
  check (
    adapter_id in (
      'url',
      'sitemap',
      'web_index',
      'firecrawl_url',
      'manual',
      'file_upload'
    )
  );

-- >>> from 20260505130000_plugin_kb_source_item_media_model.sql
-- KB source item structured capture: sections, media assets, and links.

create table if not exists module_kb.kb_source_item_sections (
  id text primary key,
  source_item_id text not null references module_kb.kb_source_items(id) on delete cascade,
  kind text not null check (kind in ('html', 'markdown', 'text')),
  title text,
  locator text,
  position integer not null default 0,
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_module_kb_source_item_sections_item_position
  on module_kb.kb_source_item_sections (source_item_id, position);

create table if not exists module_kb.kb_source_item_media (
  id text primary key,
  source_item_id text not null references module_kb.kb_source_items(id) on delete cascade,
  source_url text not null,
  storage_object_key text,
  media_type text not null check (media_type in ('image', 'video', 'audio', 'iframe', 'document', 'other')),
  content_type text,
  title text,
  description text,
  alt_text text,
  width integer,
  height integer,
  size_bytes bigint,
  content_hash text,
  position integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  download_status text not null default 'external'
    check (download_status in ('external', 'pending', 'downloaded', 'skipped', 'failed')),
  created_at timestamptz not null default now()
);

create index if not exists idx_module_kb_source_item_media_item_position
  on module_kb.kb_source_item_media (source_item_id, position);

create index if not exists idx_module_kb_source_item_media_storage_object_key
  on module_kb.kb_source_item_media (storage_object_key)
  where storage_object_key is not null;

create table if not exists module_kb.kb_source_item_links (
  id text primary key,
  source_item_id text not null references module_kb.kb_source_items(id) on delete cascade,
  href text not null,
  normalized_href text not null,
  link_type text not null check (link_type in ('internal', 'external', 'anchor', 'asset')),
  text text,
  title text,
  rel text,
  position integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_module_kb_source_item_links_item_position
  on module_kb.kb_source_item_links (source_item_id, position);

create index if not exists idx_module_kb_source_item_links_normalized
  on module_kb.kb_source_item_links (normalized_href);

grant select, insert, update, delete on module_kb.kb_source_item_sections to service_role;
grant select, insert, update, delete on module_kb.kb_source_item_media to service_role;
grant select, insert, update, delete on module_kb.kb_source_item_links to service_role;

alter table module_kb.kb_source_item_sections enable row level security;
alter table module_kb.kb_source_item_media enable row level security;
alter table module_kb.kb_source_item_links enable row level security;

create policy kb_source_item_sections_read_own_scope on module_kb.kb_source_item_sections
for select using (
  exists (
    select 1
    from module_kb.kb_source_items i
    where i.id = source_item_id
      and i.tenant_id = core.current_tenant_id()
      and core.has_scope(i.scope_id)
  )
);

create policy kb_source_item_sections_insert_own_scope on module_kb.kb_source_item_sections
for insert with check (
  exists (
    select 1
    from module_kb.kb_source_items i
    where i.id = source_item_id
      and i.tenant_id = core.current_tenant_id()
      and core.has_scope(i.scope_id)
  )
);

create policy kb_source_item_sections_delete_own_scope on module_kb.kb_source_item_sections
for delete using (
  exists (
    select 1
    from module_kb.kb_source_items i
    where i.id = source_item_id
      and i.tenant_id = core.current_tenant_id()
      and core.has_scope(i.scope_id)
  )
);

create policy kb_source_item_media_read_own_scope on module_kb.kb_source_item_media
for select using (
  exists (
    select 1
    from module_kb.kb_source_items i
    where i.id = source_item_id
      and i.tenant_id = core.current_tenant_id()
      and core.has_scope(i.scope_id)
  )
);

create policy kb_source_item_media_insert_own_scope on module_kb.kb_source_item_media
for insert with check (
  exists (
    select 1
    from module_kb.kb_source_items i
    where i.id = source_item_id
      and i.tenant_id = core.current_tenant_id()
      and core.has_scope(i.scope_id)
  )
);

create policy kb_source_item_media_delete_own_scope on module_kb.kb_source_item_media
for delete using (
  exists (
    select 1
    from module_kb.kb_source_items i
    where i.id = source_item_id
      and i.tenant_id = core.current_tenant_id()
      and core.has_scope(i.scope_id)
  )
);

create policy kb_source_item_links_read_own_scope on module_kb.kb_source_item_links
for select using (
  exists (
    select 1
    from module_kb.kb_source_items i
    where i.id = source_item_id
      and i.tenant_id = core.current_tenant_id()
      and core.has_scope(i.scope_id)
  )
);

create policy kb_source_item_links_insert_own_scope on module_kb.kb_source_item_links
for insert with check (
  exists (
    select 1
    from module_kb.kb_source_items i
    where i.id = source_item_id
      and i.tenant_id = core.current_tenant_id()
      and core.has_scope(i.scope_id)
  )
);

create policy kb_source_item_links_delete_own_scope on module_kb.kb_source_item_links
for delete using (
  exists (
    select 1
    from module_kb.kb_source_items i
    where i.id = source_item_id
      and i.tenant_id = core.current_tenant_id()
      and core.has_scope(i.scope_id)
  )
);

-- >>> from 20260512090000_plugin_kb_search_quality_settings.sql
-- Configurable KB semantic search quality defaults.

ALTER TABLE module_kb.kb_settings
  ADD COLUMN IF NOT EXISTS search_vector_min_similarity double precision NOT NULL DEFAULT 0.45,
  ADD COLUMN IF NOT EXISTS search_verifier_min_query_terms integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS search_verifier_max_candidates integer NOT NULL DEFAULT 6;

ALTER TABLE module_kb.kb_settings
  DROP CONSTRAINT IF EXISTS kb_settings_search_vector_min_similarity_range,
  ADD CONSTRAINT kb_settings_search_vector_min_similarity_range
    CHECK (search_vector_min_similarity >= 0 and search_vector_min_similarity <= 1);

ALTER TABLE module_kb.kb_settings
  DROP CONSTRAINT IF EXISTS kb_settings_search_verifier_min_query_terms_range,
  ADD CONSTRAINT kb_settings_search_verifier_min_query_terms_range
    CHECK (search_verifier_min_query_terms >= 1 and search_verifier_min_query_terms <= 20);

ALTER TABLE module_kb.kb_settings
  DROP CONSTRAINT IF EXISTS kb_settings_search_verifier_max_candidates_range,
  ADD CONSTRAINT kb_settings_search_verifier_max_candidates_range
    CHECK (search_verifier_max_candidates >= 1 and search_verifier_max_candidates <= 20);

-- >>> from 20260512140000_plugin_kb_embedding_index_status.sql
-- Dev / operator tooling: aggregate Knowledge Base article embedding index health (tenant + scope).

create or replace function module_kb.kb_embedding_index_status(
  p_tenant_id uuid,
  p_scope_id text,
  p_track_limit integer
)
returns jsonb
language sql
stable
as $$
  with arts as (
    select id, kb_id, title, updated_at
    from module_kb.articles
    where tenant_id = p_tenant_id
      and scope_id = p_scope_id
      and deleted_at is null
  ),
  emb as (
    select ae.article_id, max(ae.created_at) as last_embed_at
    from module_kb.article_embeddings ae
    inner join arts a on a.id = ae.article_id
    where ae.tenant_id = p_tenant_id
    group by ae.article_id
  ),
  summary as (
    select
      (select count(*)::bigint from arts) as total_articles,
      (select count(*)::bigint from emb) as indexed_articles,
      (
        select count(*)::bigint
        from arts x
        where not exists (select 1 from emb e where e.article_id = x.id)
      ) as missing_count,
      (
        select count(*)::bigint
        from arts a
        inner join emb e on e.article_id = a.id
        where a.updated_at > e.last_embed_at
      ) as stale_count,
      (select max(last_embed_at) from emb) as last_embedded_at
  ),
  tracked as (
    select
      a.id as article_id,
      a.kb_id,
      a.title,
      case
        when e.article_id is null then 'missing'
        else 'stale'
      end as index_state,
      e.last_embed_at as last_embedded_at,
      a.updated_at,
      case when e.article_id is null then 0 else 1 end as sort_ord
    from arts a
    left join emb e on e.article_id = a.id
    where e.article_id is null or a.updated_at > e.last_embed_at
    order by sort_ord, a.updated_at desc
    limit greatest(coalesce(nullif(p_track_limit, 0), 20), 1)
  )
  select jsonb_build_object(
    'total_articles', s.total_articles,
    'indexed_articles', s.indexed_articles,
    'missing_count', s.missing_count,
    'stale_count', s.stale_count,
    'last_embedded_at', to_jsonb(s.last_embedded_at),
    'tracked_articles', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'article_id', t.article_id,
            'kb_id', t.kb_id,
            'title', t.title,
            'index_state', t.index_state,
            'last_embedded_at', to_jsonb(t.last_embedded_at),
            'updated_at', to_jsonb(t.updated_at)
          )
          order by t.sort_ord, t.updated_at desc
        )
        from tracked t
      ),
      '[]'::jsonb
    )
  )
  from summary s;
$$;

grant execute on function module_kb.kb_embedding_index_status(uuid, text, integer) to service_role;

-- >>> from 20260513180000_plugin_kb_search_nn.sql
-- KB vector search: optional similarity floor + optional max cosine distance; null floor = pure k-NN.

drop function if exists module_kb.search_kb_embeddings(uuid, text, text, text, double precision, integer);

create or replace function module_kb.search_kb_embeddings(
  p_tenant_id uuid,
  p_scope_id text,
  p_kb_id text,
  p_embedding text,
  p_match_threshold double precision default null,
  p_match_count integer default 10,
  p_max_cosine_distance double precision default null
)
returns table (
  article_id text,
  title text,
  chunk_text text,
  similarity double precision
)
language plpgsql
stable
as $$
declare
  qemb vector(1536);
begin
  if p_embedding is null or btrim(p_embedding) = '' or p_embedding = '[]' then
    return;
  end if;
  begin
    qemb := p_embedding::vector;
  exception when others then
    return;
  end;

  return query
  select
    ae.article_id,
    a.title::text,
    ae.chunk_text::text,
    (1.0 - (ae.embedding <=> qemb))::double precision as similarity
  from module_kb.article_embeddings ae
  inner join module_kb.articles a
    on a.id = ae.article_id
    and a.deleted_at is null
    and a.tenant_id = p_tenant_id
    and a.scope_id = p_scope_id
    and a.kb_id = p_kb_id
  where ae.tenant_id = p_tenant_id
    and ae.embedding is not null
    and (
      p_match_threshold is null
      or (1.0 - (ae.embedding <=> qemb)) >= p_match_threshold
    )
    and (
      p_max_cosine_distance is null
      or (ae.embedding <=> qemb) <= p_max_cosine_distance
    )
  order by ae.embedding <=> qemb
  limit greatest(1, least(p_match_count, 50));
end;
$$;

grant execute on function module_kb.search_kb_embeddings(uuid, text, text, text, double precision, integer, double precision) to service_role;

-- >>> from 20260513190000_plugin_kb_fts_simple_config.sql
-- Align KB FTS with contacts hybrid search: `simple` text config works across
-- languages without English-only stemming (websearch_to_tsquery('english', …) was
-- a poor fit for German article bodies).

create or replace function module_kb.kb_articles_fts_search(
  p_tenant_id uuid,
  p_scope_id text,
  p_kb_id text,
  p_query text,
  p_limit int,
  p_offset int,
  p_category_id text default null,
  p_parent_article_id text default null,
  p_top_level_only boolean default false,
  p_status text default null
)
returns jsonb
language sql
stable
as $$
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
      and (p_category_id is null or a.category_id = p_category_id)
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

create or replace function module_kb.kb_articles_fts_suggest(
  p_tenant_id uuid,
  p_scope_id text,
  p_kb_id text,
  p_query text,
  p_limit int
)
returns jsonb
language sql
stable
as $$
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

grant execute on function module_kb.kb_articles_fts_search(uuid, text, text, text, int, int, text, text, boolean, text) to service_role;
grant execute on function module_kb.kb_articles_fts_suggest(uuid, text, text, text, int) to service_role;

-- >>> from 20260513200000_plugin_kb_icon_cover.sql
-- Per-KB display preferences (icon, cover) live on `kb_settings` keyed by KB id,
-- following the same pattern as `sidebar_article_tree_defaults_by_kb`.
ALTER TABLE module_kb.kb_settings
  ADD COLUMN IF NOT EXISTS kb_display_by_id jsonb NOT NULL DEFAULT '{}'::jsonb;

-- >>> from 20260514120000_plugin_kb_remove_categories.sql
-- Remove KB categories: articles/faqs no longer reference folders; FTS helper drops category filter.

drop function if exists module_kb.kb_articles_fts_search(uuid, text, text, text, int, int, text, text, boolean, text);

create or replace function module_kb.kb_articles_fts_search(
  p_tenant_id uuid,
  p_scope_id text,
  p_kb_id text,
  p_query text,
  p_limit int,
  p_offset int,
  p_parent_article_id text default null,
  p_top_level_only boolean default false,
  p_status text default null
)
returns jsonb
language sql
stable
as $$
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

grant execute on function module_kb.kb_articles_fts_search(uuid, text, text, text, int, int, text, boolean, text) to service_role;

drop index if exists module_kb.idx_module_kb_articles_kb;
drop index if exists module_kb.idx_module_kb_articles_parent_siblings;
drop index if exists module_kb.idx_module_kb_faqs_kb;

alter table module_kb.articles drop column if exists category_id;
alter table module_kb.faqs drop column if exists category_id;

drop policy if exists categories_read_own_scope on module_kb.categories;
drop policy if exists categories_insert_own_scope on module_kb.categories;
drop policy if exists categories_update_own_scope on module_kb.categories;
drop policy if exists categories_delete_own_scope on module_kb.categories;

drop table if exists module_kb.categories;

create index if not exists idx_module_kb_articles_kb
  on module_kb.articles (kb_id, sort_order) where deleted_at is null;

create index if not exists idx_module_kb_articles_parent_siblings
  on module_kb.articles (kb_id, parent_article_id, sort_order, title)
  where deleted_at is null;

create index if not exists idx_module_kb_faqs_kb
  on module_kb.faqs (kb_id, sort_order) where deleted_at is null;

-- >>> from 20260515143000_plugin_kb_settings_kv.sql
-- Reshape kb_settings to typed KV (+ context jsonb), matching core.tenant_settings value columns.
-- New keys can be added in application code without further ALTERs.

ALTER TABLE module_kb.kb_settings RENAME TO kb_settings_legacy;

CREATE TABLE module_kb.kb_settings (
  tenant_id uuid NOT NULL REFERENCES core.tenants (id) ON DELETE CASCADE,
  scope_id text NOT NULL,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('string', 'numeric', 'boolean', 'json')),
  value_string text,
  value_jsonb jsonb,
  value_numeric numeric,
  value_boolean boolean,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, scope_id, context, name),
  CONSTRAINT kb_settings_value_consistency CHECK (
    (type = 'string' AND value_string IS NOT NULL)
    OR (type = 'numeric' AND value_numeric IS NOT NULL)
    OR (type = 'boolean' AND value_boolean IS NOT NULL)
    OR (type = 'json' AND value_jsonb IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_module_kb_kb_settings_tenant_scope
  ON module_kb.kb_settings (tenant_id, scope_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON module_kb.kb_settings TO service_role;

ALTER TABLE module_kb.kb_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY kb_settings_read_own_scope ON module_kb.kb_settings
FOR SELECT USING (
  tenant_id = core.current_tenant_id() AND core.has_scope(scope_id)
);

CREATE POLICY kb_settings_insert_own_scope ON module_kb.kb_settings
FOR INSERT WITH CHECK (
  tenant_id = core.current_tenant_id() AND core.has_scope(scope_id)
);

CREATE POLICY kb_settings_update_own_scope ON module_kb.kb_settings
FOR UPDATE USING (
  tenant_id = core.current_tenant_id() AND core.has_scope(scope_id)
);

CREATE POLICY kb_settings_delete_own_scope ON module_kb.kb_settings
FOR DELETE USING (
  tenant_id = core.current_tenant_id() AND core.has_scope(scope_id)
);

-- Scope-wide string: default KB id
INSERT INTO module_kb.kb_settings (
  tenant_id,
  scope_id,
  context,
  name,
  type,
  value_string,
  value_jsonb,
  value_numeric,
  value_boolean,
  updated_at
)
SELECT
  tenant_id,
  scope_id,
  '{}'::jsonb,
  'kb.default_kb_id',
  'string',
  default_kb_id,
  NULL,
  NULL,
  NULL,
  updated_at
FROM module_kb.kb_settings_legacy
WHERE
  default_kb_id IS NOT NULL;

INSERT INTO module_kb.kb_settings (
  tenant_id,
  scope_id,
  context,
  name,
  type,
  value_string,
  value_jsonb,
  value_numeric,
  value_boolean,
  updated_at
)
SELECT
  tenant_id,
  scope_id,
  '{}'::jsonb,
  'kb.embedding_model',
  'string',
  embedding_model,
  NULL,
  NULL,
  NULL,
  updated_at
FROM module_kb.kb_settings_legacy;

INSERT INTO module_kb.kb_settings (
  tenant_id,
  scope_id,
  context,
  name,
  type,
  value_string,
  value_jsonb,
  value_numeric,
  value_boolean,
  updated_at
)
SELECT
  tenant_id,
  scope_id,
  '{}'::jsonb,
  'kb.auto_generate_summary',
  'boolean',
  NULL,
  NULL,
  NULL,
  auto_generate_summary,
  updated_at
FROM module_kb.kb_settings_legacy;

INSERT INTO module_kb.kb_settings (
  tenant_id,
  scope_id,
  context,
  name,
  type,
  value_string,
  value_jsonb,
  value_numeric,
  value_boolean,
  updated_at
)
SELECT
  tenant_id,
  scope_id,
  '{}'::jsonb,
  'kb.auto_generate_questions',
  'boolean',
  NULL,
  NULL,
  NULL,
  auto_generate_questions,
  updated_at
FROM module_kb.kb_settings_legacy;

INSERT INTO module_kb.kb_settings (
  tenant_id,
  scope_id,
  context,
  name,
  type,
  value_string,
  value_jsonb,
  value_numeric,
  value_boolean,
  updated_at
)
SELECT
  tenant_id,
  scope_id,
  '{}'::jsonb,
  'kb.search_vector_min_similarity',
  'numeric',
  NULL,
  NULL,
  search_vector_min_similarity,
  NULL,
  updated_at
FROM module_kb.kb_settings_legacy;

INSERT INTO module_kb.kb_settings (
  tenant_id,
  scope_id,
  context,
  name,
  type,
  value_string,
  value_jsonb,
  value_numeric,
  value_boolean,
  updated_at
)
SELECT
  tenant_id,
  scope_id,
  '{}'::jsonb,
  'kb.search_verifier_min_query_terms',
  'numeric',
  NULL,
  NULL,
  search_verifier_min_query_terms,
  NULL,
  updated_at
FROM module_kb.kb_settings_legacy;

INSERT INTO module_kb.kb_settings (
  tenant_id,
  scope_id,
  context,
  name,
  type,
  value_string,
  value_jsonb,
  value_numeric,
  value_boolean,
  updated_at
)
SELECT
  tenant_id,
  scope_id,
  '{}'::jsonb,
  'kb.search_verifier_max_candidates',
  'numeric',
  NULL,
  NULL,
  search_verifier_max_candidates,
  NULL,
  updated_at
FROM module_kb.kb_settings_legacy;

INSERT INTO module_kb.kb_settings (
  tenant_id,
  scope_id,
  context,
  name,
  type,
  value_string,
  value_jsonb,
  value_numeric,
  value_boolean,
  updated_at
)
SELECT
  l.tenant_id,
  l.scope_id,
  jsonb_build_object ('kb_id', e.key),
  'kb.display',
  'json',
  NULL,
  e.value,
  NULL,
  NULL,
  l.updated_at
FROM
  module_kb.kb_settings_legacy l
  CROSS JOIN LATERAL jsonb_each (l.kb_display_by_id) AS e (key, value)
WHERE
  l.kb_display_by_id IS NOT NULL
  AND l.kb_display_by_id <> '{}'::jsonb;

INSERT INTO module_kb.kb_settings (
  tenant_id,
  scope_id,
  context,
  name,
  type,
  value_string,
  value_jsonb,
  value_numeric,
  value_boolean,
  updated_at
)
SELECT
  l.tenant_id,
  l.scope_id,
  jsonb_build_object ('kb_id', e.key),
  'kb.sidebar_article_tree.defaults',
  'json',
  NULL,
  e.value,
  NULL,
  NULL,
  l.updated_at
FROM
  module_kb.kb_settings_legacy l
  CROSS JOIN LATERAL jsonb_each (l.sidebar_article_tree_defaults_by_kb) AS e (key, value)
WHERE
  l.sidebar_article_tree_defaults_by_kb IS NOT NULL
  AND l.sidebar_article_tree_defaults_by_kb <> '{}'::jsonb;

DROP TABLE module_kb.kb_settings_legacy;

-- >>> from 20260526180000_plugin_kb_categories_restore.sql
-- Reintroduce mandatory hierarchical KB categories.
--
-- The squashed baseline (`20260322120000_plugin_kb.sql`) ends with the
-- 2026-05-14 cleanup that dropped the `module_kb.categories` table and the
-- `category_id` columns on `articles` / `faqs`. This migration brings them
-- back as the canonical folder layer and enforces:
--   1. one mandatory `general` category per knowledge base, seeded by trigger,
--   2. every article carries a NOT NULL `category_id`,
--   3. categories nest via `parent_id` (tree, no orphan parents),
--   4. on-delete restrict so we never drop a folder while it still owns rows.
--
-- Pre-launch / no production data: any pre-existing article/FAQ row gets
-- assigned to its KB's `general` row during the backfill below.

-- ── 1. Categories table ───────────────────────────────────────────────────

create table if not exists module_kb.categories (
  id text primary key,
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  scope_id text not null,
  kb_id text not null references module_kb.knowledge_bases(id) on delete cascade,
  parent_id text references module_kb.categories(id) on delete set null,
  name text not null,
  slug text not null,
  description text,
  sort_order integer not null default 0,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_module_kb_categories_kb
  on module_kb.categories (kb_id, parent_id, sort_order);

create index if not exists idx_module_kb_categories_scope
  on module_kb.categories (tenant_id, scope_id);

-- Slug must be unique per KB so the route key /<kb-slug>/<cat-slug> is stable.
create unique index if not exists idx_module_kb_categories_kb_slug_unique
  on module_kb.categories (kb_id, slug);

-- Exactly one default ("general") row per KB; the trigger relies on this.
create unique index if not exists idx_module_kb_categories_kb_default
  on module_kb.categories (kb_id) where is_default;

grant select, insert, update, delete on module_kb.categories to service_role;

alter table module_kb.categories enable row level security;

drop policy if exists categories_read_own_scope on module_kb.categories;
create policy categories_read_own_scope on module_kb.categories
  for select using (tenant_id = core.current_tenant_id() and core.has_scope(scope_id));

drop policy if exists categories_insert_own_scope on module_kb.categories;
create policy categories_insert_own_scope on module_kb.categories
  for insert with check (tenant_id = core.current_tenant_id() and core.has_scope(scope_id));

drop policy if exists categories_update_own_scope on module_kb.categories;
create policy categories_update_own_scope on module_kb.categories
  for update using (tenant_id = core.current_tenant_id() and core.has_scope(scope_id));

drop policy if exists categories_delete_own_scope on module_kb.categories;
create policy categories_delete_own_scope on module_kb.categories
  for delete using (tenant_id = core.current_tenant_id() and core.has_scope(scope_id));

-- ── 2. Re-add category_id columns ─────────────────────────────────────────

alter table module_kb.articles
  add column if not exists category_id text;

alter table module_kb.faqs
  add column if not exists category_id text;

-- ── 3. Seed a `general` category per existing KB ──────────────────────────

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
select
  'kb-cat-default-' || kb.id,
  kb.tenant_id,
  kb.scope_id,
  kb.id,
  null,
  'General',
  'general',
  null,
  0,
  true,
  now(),
  now()
from module_kb.knowledge_bases kb
where kb.deleted_at is null
  and not exists (
    select 1 from module_kb.categories c
    where c.kb_id = kb.id and c.is_default = true
  );

-- ── 4. Backfill articles.category_id and faqs.category_id ────────────────

update module_kb.articles a
set category_id = c.id
from module_kb.categories c
where c.kb_id = a.kb_id
  and c.is_default = true
  and a.category_id is null;

update module_kb.faqs f
set category_id = c.id
from module_kb.categories c
where c.kb_id = f.kb_id
  and c.is_default = true
  and f.category_id is null;

-- ── 5. Enforce NOT NULL + on-delete restrict for articles.category_id ────

alter table module_kb.articles
  alter column category_id set not null;

alter table module_kb.articles
  drop constraint if exists articles_category_id_fkey;

alter table module_kb.articles
  add constraint articles_category_id_fkey
    foreign key (category_id) references module_kb.categories(id)
    on delete restrict;

-- FAQs keep `on delete set null` for now — the UI does not surface FAQ
-- categories yet, so a folder delete should not refuse over an FAQ row.
alter table module_kb.faqs
  drop constraint if exists faqs_category_id_fkey;

alter table module_kb.faqs
  add constraint faqs_category_id_fkey
    foreign key (category_id) references module_kb.categories(id)
    on delete set null;

-- ── 6. Trigger: seed `general` for every new KB ──────────────────────────

create or replace function module_kb.kb_seed_default_category()
returns trigger
language plpgsql
as $$
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

drop trigger if exists kb_seed_default_category on module_kb.knowledge_bases;
create trigger kb_seed_default_category
  after insert on module_kb.knowledge_bases
  for each row execute function module_kb.kb_seed_default_category();

grant execute on function module_kb.kb_seed_default_category() to service_role;

-- >>> from 20260527090000_plugin_kb_category_view.sql
-- Category view pages: cover, inline intro/outro (TipTap json + markdown),
-- view type (collection / folder), and a freeform `page_settings` jsonb that
-- carries dynamic sections (sub-category teasers, article list source / style).
--
-- Categories already exist (see 20260526180000_plugin_kb_categories_restore.sql).
-- This migration only adds the new columns and is idempotent.

alter table module_kb.categories
  add column if not exists cover jsonb,
  add column if not exists intro_json jsonb,
  add column if not exists intro_markdown text,
  add column if not exists outro_json jsonb,
  add column if not exists outro_markdown text,
  add column if not exists view_type text not null default 'collection',
  add column if not exists page_settings jsonb not null default '{}'::jsonb;

-- Only `collection` and `folder` are accepted for now; new variants need a new value.
alter table module_kb.categories
  drop constraint if exists categories_view_type_check;

alter table module_kb.categories
  add constraint categories_view_type_check
    check (view_type in ('collection', 'folder'));

-- >>> from 20260527093000_plugin_kb_realtime.sql
-- Realtime: authenticated SELECT + publication for KB sidebar live-cache signals.
--
-- Only the tree-visible tables (categories + articles) are published. The full
-- article body / embeddings / settings stay off the realtime channel — clients
-- treat realtime as a signal, then refetch through Hono for full data.
--
-- RLS already restricts reads to `tenant_id = core.current_tenant_id()`
-- via `categories_read_own_scope` / `articles_read_own_scope` (see the initial
-- KB plugin migration), so granting authenticated SELECT does not leak data.

grant usage on schema module_kb to authenticated;

grant select on table module_kb.articles to authenticated;
grant select on table module_kb.categories to authenticated;

do $$
begin
  alter publication supabase_realtime add table module_kb.articles;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table module_kb.categories;
exception
  when duplicate_object then null;
end $$;

-- >>> from 20260531120000_plugin_kb_source_ingest_config.sql
-- Persist default ingest options (category, etc.) per KB source.

alter table module_kb.kb_sources
  add column if not exists ingest_config jsonb not null default '{}'::jsonb;

-- >>> from 20260531140000_plugin_kb_version_history_grants.sql
-- article_versions / faq_versions were added after initial module_kb grants;
-- without these, service_role cannot list or record version history.

grant select, insert on module_kb.article_versions to service_role;
grant select, insert on module_kb.faq_versions to service_role;

-- >>> from 20260531170000_plugin_kb_article_templates.sql
-- KB article templates: template-scoped metadata properties and optional TipTap skeletons.

create table if not exists module_kb.article_templates (
  id text primary key,
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  scope_id text not null,
  kb_id text not null references module_kb.knowledge_bases(id) on delete cascade,
  name text not null,
  description text,
  property_definitions jsonb not null default '[]'::jsonb,
  content_json jsonb,
  content_markdown text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_module_kb_article_templates_kb
  on module_kb.article_templates (tenant_id, scope_id, kb_id, name)
  where deleted_at is null;

alter table module_kb.articles
  add column if not exists template_mode text not null default 'inherit'
    check (template_mode in ('inherit', 'none', 'template')),
  add column if not exists template_id text references module_kb.article_templates(id) on delete set null;

alter table module_kb.categories
  add column if not exists template_mode text not null default 'inherit'
    check (template_mode in ('inherit', 'none', 'template')),
  add column if not exists template_id text references module_kb.article_templates(id) on delete set null;

create index if not exists idx_module_kb_articles_template
  on module_kb.articles (tenant_id, scope_id, kb_id, template_id)
  where deleted_at is null;

create index if not exists idx_module_kb_categories_template
  on module_kb.categories (tenant_id, scope_id, kb_id, template_id);

grant select, insert, update, delete on module_kb.article_templates to service_role;

alter table module_kb.article_templates enable row level security;

create policy article_templates_read_own_scope on module_kb.article_templates
for select using (tenant_id = core.current_tenant_id() and core.has_scope(scope_id));

create policy article_templates_insert_own_scope on module_kb.article_templates
for insert with check (tenant_id = core.current_tenant_id() and core.has_scope(scope_id));

create policy article_templates_update_own_scope on module_kb.article_templates
for update using (tenant_id = core.current_tenant_id() and core.has_scope(scope_id));

create policy article_templates_delete_own_scope on module_kb.article_templates
for delete using (tenant_id = core.current_tenant_id() and core.has_scope(scope_id));

-- >>> from 20260531180000_plugin_kb_category_icon.sql
-- Optional emoji icon on KB categories (sidebar + category page header).

alter table module_kb.categories
  add column if not exists icon text;

-- >>> from 20260601120000_plugin_kb_comments.sql
-- Article comments + inherited comments_mode settings.

create table if not exists module_kb.article_comments (
  id text primary key,
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  scope_id text not null,
  article_id text not null references module_kb.articles(id) on delete cascade,
  content text not null,
  created_by uuid references core.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_kb_article_comments_scope
  on module_kb.article_comments (tenant_id, scope_id);

create index if not exists idx_kb_article_comments_article
  on module_kb.article_comments (article_id, created_at asc);

alter table module_kb.knowledge_bases
  add column if not exists comments_mode text not null default 'enabled'
    check (comments_mode in ('none', 'enabled', 'closed'));

alter table module_kb.categories
  add column if not exists comments_mode text not null default 'inherit'
    check (comments_mode in ('inherit', 'none', 'enabled', 'closed'));

alter table module_kb.articles
  add column if not exists comments_mode text not null default 'inherit'
    check (comments_mode in ('inherit', 'none', 'enabled', 'closed'));

grant select, insert, update, delete on module_kb.article_comments to service_role;

alter table module_kb.article_comments enable row level security;

create policy article_comments_read_own_scope on module_kb.article_comments
for select using (tenant_id = core.current_tenant_id() and core.has_scope(scope_id));

create policy article_comments_insert_own_scope on module_kb.article_comments
for insert with check (tenant_id = core.current_tenant_id() and core.has_scope(scope_id));

create policy article_comments_update_own_scope on module_kb.article_comments
for update using (tenant_id = core.current_tenant_id() and core.has_scope(scope_id));

create policy article_comments_delete_own_scope on module_kb.article_comments
for delete using (tenant_id = core.current_tenant_id() and core.has_scope(scope_id));

-- >>> from 20260602120100_plugin_kb_category_cover_inheritance.sql
-- Category cover inheritance: whether a category cover applies to direct
-- articles only or to all descendant categories and their articles.

alter table module_kb.categories
  add column if not exists cover_inheritance text not null default 'none';

alter table module_kb.categories
  drop constraint if exists categories_cover_inheritance_check;

alter table module_kb.categories
  add constraint categories_cover_inheritance_check
    check (cover_inheritance in ('none', 'direct_articles', 'all_children'));

-- >>> from 20260602120200_plugin_kb_comments_grants.sql
-- Follow-up for environments that applied 20260601120000 before grants/RLS were added.

grant select, insert, update, delete on module_kb.article_comments to service_role;

alter table module_kb.article_comments enable row level security;

do $$
begin
  create policy article_comments_read_own_scope on module_kb.article_comments
  for select using (tenant_id = core.current_tenant_id() and core.has_scope(scope_id));
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create policy article_comments_insert_own_scope on module_kb.article_comments
  for insert with check (tenant_id = core.current_tenant_id() and core.has_scope(scope_id));
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create policy article_comments_update_own_scope on module_kb.article_comments
  for update using (tenant_id = core.current_tenant_id() and core.has_scope(scope_id));
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create policy article_comments_delete_own_scope on module_kb.article_comments
  for delete using (tenant_id = core.current_tenant_id() and core.has_scope(scope_id));
exception
  when duplicate_object then null;
end $$;

-- >>> from 20260613200000_plugin_kb_fts_simple_index.sql
-- Fix FTS GIN index config mismatch.
--
-- The original index at `idx_module_kb_articles_fts` was created with
-- `to_tsvector('english', …)`, but migration 20260513190000 changed all FTS
-- queries to use `to_tsvector('simple', …)` for cross-language support.
-- Postgres cannot use an expression index when the text config differs →
-- every FTS query falls back to a sequential scan.
--
-- This migration drops the dead 'english' index and creates a matching
-- 'simple' one.

DROP INDEX IF EXISTS module_kb.idx_module_kb_articles_fts;

CREATE INDEX IF NOT EXISTS idx_module_kb_articles_fts_simple
  ON module_kb.articles
  USING gin (to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(content_markdown, '')))
  WHERE deleted_at IS NULL;
