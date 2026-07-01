-- Consolidated contacts baseline (pre-launch).

-- >>> from 20260223190000_plugin_module_contacts.sql
-- Squashed contacts baseline (pre-launch).

-- >>> from 20260223190000_plugin_module_contacts.sql
-- Contacts module: single-table contacts (organisation | person), contact_relations, contact_roles, contact_settings.
-- Replaces legacy entities + people contacts + contact_organisation. No data migration.

create schema if not exists module_contacts;

-- Single contacts table: type = organisation | person
create table if not exists module_contacts.contacts (
  id text primary key,
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  scope_id text not null,
  type text not null check (type in ('organisation', 'person')),
  display_name text not null,
  legal_name text,
  contact_name text default '',
  email text,
  billing_email text,
  phone text,
  position text,
  department text,
  role text,
  gender text,
  salutation text,
  language text,
  internal_note text,
  vat_id text,
  tax_id text,
  registration_number text,
  court_of_registration text,
  legal_form text,
  address_street text,
  address_info text,
  address_zip text,
  address_city text,
  address_country text,
  website_contact text,
  website_impress text,
  logo_url text,
  reference_id text,
  notes text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_module_contacts_contacts_scope
  on module_contacts.contacts (tenant_id, scope_id, updated_at desc);

create index if not exists idx_module_contacts_contacts_display_name
  on module_contacts.contacts (display_name);

create index if not exists idx_module_contacts_contacts_type
  on module_contacts.contacts (type) where deleted_at is null;

-- Typed relations between contacts (replaces contact_organisation)
create table if not exists module_contacts.contact_relations (
  id text primary key,
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  scope_id text not null,
  from_contact_id text not null references module_contacts.contacts(id) on delete cascade,
  to_contact_id text not null references module_contacts.contacts(id) on delete cascade,
  relation_type text not null check (relation_type in ('works_at', 'member_of', 'client_of')),
  label text,
  position text,
  department text,
  role text,
  is_primary boolean not null default false,
  valid_from date,
  valid_to date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (from_contact_id, to_contact_id, relation_type)
);

create index if not exists idx_module_contacts_contact_relations_scope
  on module_contacts.contact_relations (tenant_id, scope_id);

create index if not exists idx_module_contacts_contact_relations_from
  on module_contacts.contact_relations (from_contact_id);

create index if not exists idx_module_contacts_contact_relations_to
  on module_contacts.contact_relations (to_contact_id);

-- Roles on contacts
create table if not exists module_contacts.contact_roles (
  contact_id text not null references module_contacts.contacts(id) on delete cascade,
  role text not null
    check (
      char_length(role) between 1 and 64
      and role ~ '^[a-z0-9][a-z0-9_-]*$'
    ),
  primary key (contact_id, role)
);

create index if not exists idx_module_contacts_contact_roles_role
  on module_contacts.contact_roles(role);

-- Tenant settings
create table if not exists module_contacts.contact_settings (
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  scope_id text not null,
  id_prefix text not null default 'C-{year}-',
  id_offset integer not null default 1000,
  id_postfix text not null default '',
  salutations_json text not null default '[]',
  languages_json text not null default '["Deutsch","English"]',
  default_language text not null default 'Deutsch',
  updated_at timestamptz not null default now(),
  primary key (tenant_id, scope_id)
);

grant usage on schema module_contacts to service_role;
grant select, insert, update, delete on module_contacts.contacts to service_role;
grant select, insert, update, delete on module_contacts.contact_relations to service_role;
grant select, insert, update, delete on module_contacts.contact_roles to service_role;
grant select, insert, update, delete on module_contacts.contact_settings to service_role;

alter table module_contacts.contacts enable row level security;
alter table module_contacts.contact_relations enable row level security;
alter table module_contacts.contact_roles enable row level security;
alter table module_contacts.contact_settings enable row level security;

create policy contacts_read_own_scope on module_contacts.contacts
for select using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy contacts_insert_own_scope on module_contacts.contacts
for insert with check (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy contacts_update_own_scope on module_contacts.contacts
for update using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy contacts_delete_own_scope on module_contacts.contacts
for delete using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy contact_relations_read_own_scope on module_contacts.contact_relations
for select using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy contact_relations_insert_own_scope on module_contacts.contact_relations
for insert with check (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy contact_relations_update_own_scope on module_contacts.contact_relations
for update using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy contact_relations_delete_own_scope on module_contacts.contact_relations
for delete using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy contact_roles_read_own_scope on module_contacts.contact_roles
for select using (
  exists (
    select 1 from module_contacts.contacts c
    where c.id = contact_roles.contact_id
    and c.tenant_id = core.current_tenant_id()
    and core.has_scope(c.scope_id)
  )
);

create policy contact_roles_insert_own_scope on module_contacts.contact_roles
for insert with check (
  exists (
    select 1 from module_contacts.contacts c
    where c.id = contact_roles.contact_id
    and c.tenant_id = core.current_tenant_id()
    and core.has_scope(c.scope_id)
  )
);

create policy contact_roles_delete_own_scope on module_contacts.contact_roles
for delete using (
  exists (
    select 1 from module_contacts.contacts c
    where c.id = contact_roles.contact_id
    and c.tenant_id = core.current_tenant_id()
    and core.has_scope(c.scope_id)
  )
);

create policy contact_settings_read_own_scope on module_contacts.contact_settings
for select using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy contact_settings_insert_own_scope on module_contacts.contact_settings
for insert with check (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy contact_settings_update_own_scope on module_contacts.contact_settings
for update using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

-- >>> from 20260305120000_plugin_contacts_import_fields.sql
-- Add import_id and last_imported_at for importer upsert and tracking.

alter table module_contacts.contacts
  add column if not exists import_id text,
  add column if not exists last_imported_at timestamptz;

create index if not exists idx_module_contacts_contacts_import_id
  on module_contacts.contacts (tenant_id, scope_id, import_id)
  where import_id is not null and deleted_at is null;

-- >>> from 20260408120000_plugin_contacts_drop_unused_contact_columns.sql
-- Remove columns on module_contacts.contacts that were never exposed via API/UI.
-- Employment-style fields belong on contact_relations; tenant salutation/language lists live in contact_settings.

alter table module_contacts.contacts
  drop column if exists position,
  drop column if exists department,
  drop column if exists role,
  drop column if exists gender,
  drop column if exists salutation,
  drop column if exists language,
  drop column if exists internal_note;

-- >>> from 20260507221500_plugin_contacts_hybrid_search.sql
-- Contacts hybrid search: FTS + trigram + optional one-vector-per-contact signal.

create extension if not exists pg_trgm;
create extension if not exists vector;

create index if not exists idx_module_contacts_contacts_search_fts
  on module_contacts.contacts using gin (
    (
      setweight(to_tsvector('simple', coalesce(display_name, '')), 'A') ||
      setweight(to_tsvector('simple', coalesce(legal_name, '') || ' ' || coalesce(contact_name, '')), 'A') ||
      setweight(to_tsvector('simple', coalesce(email, '') || ' ' || coalesce(billing_email, '') || ' ' || coalesce(website_contact, '') || ' ' || coalesce(website_impress, '')), 'B') ||
      setweight(to_tsvector('simple', coalesce(address_city, '') || ' ' || coalesce(address_country, '') || ' ' || coalesce(legal_form, '')), 'B') ||
      setweight(to_tsvector('simple', coalesce(reference_id, '') || ' ' || coalesce(vat_id, '') || ' ' || coalesce(tax_id, '') || ' ' || coalesce(registration_number, '')), 'C') ||
      setweight(to_tsvector('simple', coalesce(notes, '')), 'D')
    )
  )
  where deleted_at is null;

create index if not exists idx_module_contacts_contacts_search_trgm
  on module_contacts.contacts using gin (
    lower(
      coalesce(display_name, '') || ' ' ||
      coalesce(legal_name, '') || ' ' ||
      coalesce(contact_name, '') || ' ' ||
      coalesce(email, '') || ' ' ||
      coalesce(billing_email, '') || ' ' ||
      coalesce(phone, '') || ' ' ||
      coalesce(reference_id, '') || ' ' ||
      coalesce(vat_id, '') || ' ' ||
      coalesce(tax_id, '') || ' ' ||
      coalesce(registration_number, '') || ' ' ||
      coalesce(legal_form, '') || ' ' ||
      coalesce(address_street, '') || ' ' ||
      coalesce(address_zip, '') || ' ' ||
      coalesce(address_city, '') || ' ' ||
      coalesce(address_country, '') || ' ' ||
      coalesce(website_contact, '') || ' ' ||
      coalesce(website_impress, '') || ' ' ||
      coalesce(notes, '')
    ) gin_trgm_ops
  )
  where deleted_at is null;

create index if not exists idx_module_contacts_contact_roles_role_contact
  on module_contacts.contact_roles (role, contact_id);

create table if not exists module_contacts.contact_search_embeddings (
  contact_id text primary key references module_contacts.contacts(id) on delete cascade,
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  scope_id text not null,
  document_text text not null,
  embedding vector(1536),
  embedding_model text,
  updated_at timestamptz not null default now()
);

create index if not exists idx_module_contacts_contact_search_embeddings_scope
  on module_contacts.contact_search_embeddings (tenant_id, scope_id);

create index if not exists idx_module_contacts_contact_search_embeddings_vector
  on module_contacts.contact_search_embeddings using hnsw (embedding vector_cosine_ops);

grant select, insert, update, delete on module_contacts.contact_search_embeddings to service_role;

alter table module_contacts.contact_search_embeddings enable row level security;

create policy contact_search_embeddings_read_own_scope on module_contacts.contact_search_embeddings
for select using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy contact_search_embeddings_insert_own_scope on module_contacts.contact_search_embeddings
for insert with check (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy contact_search_embeddings_update_own_scope on module_contacts.contact_search_embeddings
for update using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy contact_search_embeddings_delete_own_scope on module_contacts.contact_search_embeddings
for delete using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create or replace function module_contacts.search_contacts(
  p_tenant_id uuid,
  p_scope_id text,
  p_query text,
  p_limit int,
  p_offset int,
  p_type text default null,
  p_role text default null,
  p_query_embedding text default null,
  p_vector_threshold double precision default 0.72,
  p_trigram_threshold double precision default 0.18
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
    role_docs as (
      select
        cr.contact_id,
        string_agg(cr.role, ' ' order by cr.role) as roles_text,
        array_agg(cr.role order by cr.role) as roles
      from module_contacts.contact_roles cr
      group by cr.contact_id
    ),
    relation_docs as (
      select
        contact_id,
        string_agg(relation_text, ' ') as relations_text
      from (
        select
          from_contact_id as contact_id,
          concat_ws(' ', label, position, department, role) as relation_text
        from module_contacts.contact_relations
        where tenant_id = p_tenant_id and scope_id = p_scope_id
        union all
        select
          to_contact_id as contact_id,
          concat_ws(' ', label, position, department, role) as relation_text
        from module_contacts.contact_relations
        where tenant_id = p_tenant_id and scope_id = p_scope_id
      ) rel
      group by contact_id
    ),
    docs as (
      select
        c.id,
        c.display_name,
        c.type,
        coalesce(rd.roles, array[]::text[]) as roles,
        concat_ws(
          ' ',
          c.display_name,
          c.legal_name,
          c.contact_name,
          c.email,
          c.billing_email,
          c.phone,
          c.reference_id,
          c.vat_id,
          c.tax_id,
          c.registration_number,
          c.legal_form,
          c.address_street,
          c.address_zip,
          c.address_city,
          c.address_country,
          c.website_contact,
          c.website_impress,
          c.notes,
          rd.roles_text,
          rld.relations_text
        ) as document_text,
        (
          setweight(to_tsvector('simple', coalesce(c.display_name, '')), 'A') ||
          setweight(to_tsvector('simple', coalesce(c.legal_name, '') || ' ' || coalesce(c.contact_name, '')), 'A') ||
          setweight(to_tsvector('simple', coalesce(c.email, '') || ' ' || coalesce(c.billing_email, '') || ' ' || coalesce(c.website_contact, '') || ' ' || coalesce(c.website_impress, '')), 'B') ||
          setweight(to_tsvector('simple', coalesce(c.address_city, '') || ' ' || coalesce(c.address_country, '') || ' ' || coalesce(c.legal_form, '') || ' ' || coalesce(rd.roles_text, '') || ' ' || coalesce(rld.relations_text, '')), 'B') ||
          setweight(to_tsvector('simple', coalesce(c.reference_id, '') || ' ' || coalesce(c.vat_id, '') || ' ' || coalesce(c.tax_id, '') || ' ' || coalesce(c.registration_number, '')), 'C') ||
          setweight(to_tsvector('simple', coalesce(c.notes, '')), 'D')
        ) as search_vector,
        lower(concat_ws(' ', c.display_name, c.legal_name, c.contact_name, c.email, c.billing_email, c.phone, c.reference_id, c.vat_id, c.tax_id, c.registration_number, c.legal_form, c.address_city, c.address_country, rd.roles_text, rld.relations_text)) as fuzzy_text,
        e.embedding
      from module_contacts.contacts c
      left join role_docs rd on rd.contact_id = c.id
      left join relation_docs rld on rld.contact_id = c.id
      left join module_contacts.contact_search_embeddings e on e.contact_id = c.id
      where c.tenant_id = p_tenant_id
        and c.scope_id = p_scope_id
        and c.deleted_at is null
        and (p_type is null or c.type = p_type)
        and (p_role is null or p_role = any(coalesce(rd.roles, array[]::text[])))
    ),
    scored as (
      select
        d.id,
        d.display_name,
        d.type,
        d.roles,
        case
          when params.tsq is null then 0::double precision
          else ts_rank_cd(d.search_vector, params.tsq)::double precision
        end as fts_score,
        case
          when params.query_lower is null then 0::double precision
          else greatest(
            similarity(d.fuzzy_text, params.query_lower),
            word_similarity(params.query_lower, d.fuzzy_text)
          )
        end as trigram_score,
        case
          when qemb is null or d.embedding is null then 0::double precision
          else (1.0 - (d.embedding <=> qemb))::double precision
        end as vector_score,
        case
          when p_role is not null and p_role = any(d.roles) then 1::double precision
          else 0::double precision
        end as role_score,
        array_remove(array[
          case when params.query_lower is not null and position(params.query_lower in lower(d.display_name)) > 0 then 'display_name' end,
          case when p_type is not null and d.type = p_type then 'type' end,
          case when p_role is not null and p_role = any(d.roles) then 'role' end,
          case when params.tsq is not null and d.search_vector @@ params.tsq then 'text' end,
          case when params.query_lower is not null and greatest(similarity(d.fuzzy_text, params.query_lower), word_similarity(params.query_lower, d.fuzzy_text)) >= p_trigram_threshold then 'fuzzy' end,
          case when qemb is not null and d.embedding is not null and (1.0 - (d.embedding <=> qemb)) >= p_vector_threshold then 'semantic' end
        ], null) as matched_fields
      from docs d
      cross join params
    ),
    validated as (
      select
        *,
        (
          fts_score * 2.0 +
          trigram_score +
          vector_score +
          role_score
        ) as score
      from scored
      where
        nullif(trim(coalesce(p_query, '')), '') is null
        or fts_score > 0
        or trigram_score >= p_trigram_threshold
        or vector_score >= p_vector_threshold
        or role_score > 0
    ),
    ordered as (
      select
        *,
        row_number() over (order by score desc, display_name asc, id asc) as rn
      from validated
    )
    select jsonb_build_object(
      'total', (select count(*)::bigint from validated),
      'ids', coalesce(
        (
          select jsonb_agg(id order by rn)
          from ordered
          where rn > p_offset and rn <= p_offset + p_limit
        ),
        '[]'::jsonb
      ),
      'matches', coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', id,
              'score', score,
              'matched_fields', to_jsonb(matched_fields),
              'match_reason',
                case
                  when role_score > 0 then 'role'
                  when fts_score > 0 then 'text'
                  when trigram_score >= p_trigram_threshold then 'fuzzy'
                  when vector_score >= p_vector_threshold then 'semantic'
                  else 'filtered'
                end,
              'source_scores', jsonb_build_object(
                'fts', fts_score,
                'trigram', trigram_score,
                'vector', vector_score,
                'role', role_score
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

grant execute on function module_contacts.search_contacts(uuid, text, text, int, int, text, text, text, double precision, double precision) to service_role;

-- >>> from 20260507225200_plugin_contacts_multi_query_hybrid_search.sql
-- Let one contact search fan out into multiple lexical/BM25-style query variants
-- and multiple query embeddings. This catches German compounds such as
-- "Anwalt" -> "Rechtsanwälte" without relying on the agent to retry manually.

create or replace function module_contacts.search_contacts(
  p_tenant_id uuid,
  p_scope_id text,
  p_query text,
  p_limit int,
  p_offset int,
  p_type text default null,
  p_role text default null,
  p_query_embedding text default null,
  p_query_embeddings text default null,
  p_query_variants text[] default null,
  p_vector_threshold double precision default 0.72,
  p_trigram_threshold double precision default 0.18
)
returns jsonb
language plpgsql
stable
as $$
declare
  qembs vector(1536)[];
begin
  if p_query_embeddings is not null and btrim(p_query_embeddings) <> '' and p_query_embeddings <> '[]' then
    begin
      select array_agg(value::text::vector)
      into qembs
      from jsonb_array_elements(p_query_embeddings::jsonb);
    exception when others then
      qembs := null;
    end;
  elsif p_query_embedding is not null and btrim(p_query_embedding) <> '' and p_query_embedding <> '[]' then
    begin
      qembs := array[p_query_embedding::vector];
    exception when others then
      qembs := null;
    end;
  end if;

  return (
    with params as (
      select array(
        select distinct trim(query_variant)
        from unnest(coalesce(p_query_variants, array[p_query])) as variants(query_variant)
        where nullif(trim(query_variant), '') is not null
      ) as queries
    ),
    query_params as (
      select
        queries,
        array(select lower(query_value) from unnest(queries) as query_values(query_value)) as query_lowers,
        array(select websearch_to_tsquery('simple', query_value) from unnest(queries) as query_values(query_value)) as ts_queries
      from params
    ),
    role_docs as (
      select
        cr.contact_id,
        string_agg(cr.role, ' ' order by cr.role) as roles_text,
        array_agg(cr.role order by cr.role) as roles
      from module_contacts.contact_roles cr
      group by cr.contact_id
    ),
    relation_docs as (
      select
        contact_id,
        string_agg(relation_text, ' ') as relations_text
      from (
        select
          from_contact_id as contact_id,
          concat_ws(' ', label, position, department, role) as relation_text
        from module_contacts.contact_relations
        where tenant_id = p_tenant_id and scope_id = p_scope_id
        union all
        select
          to_contact_id as contact_id,
          concat_ws(' ', label, position, department, role) as relation_text
        from module_contacts.contact_relations
        where tenant_id = p_tenant_id and scope_id = p_scope_id
      ) rel
      group by contact_id
    ),
    docs as (
      select
        c.id,
        c.display_name,
        c.type,
        coalesce(rd.roles, array[]::text[]) as roles,
        concat_ws(
          ' ',
          c.display_name,
          c.legal_name,
          c.contact_name,
          c.email,
          c.billing_email,
          c.phone,
          c.reference_id,
          c.vat_id,
          c.tax_id,
          c.registration_number,
          c.legal_form,
          c.address_street,
          c.address_zip,
          c.address_city,
          c.address_country,
          c.website_contact,
          c.website_impress,
          c.notes,
          rd.roles_text,
          rld.relations_text
        ) as document_text,
        (
          setweight(to_tsvector('simple', coalesce(c.display_name, '')), 'A') ||
          setweight(to_tsvector('simple', coalesce(c.legal_name, '') || ' ' || coalesce(c.contact_name, '')), 'A') ||
          setweight(to_tsvector('simple', coalesce(c.email, '') || ' ' || coalesce(c.billing_email, '') || ' ' || coalesce(c.website_contact, '') || ' ' || coalesce(c.website_impress, '')), 'B') ||
          setweight(to_tsvector('simple', coalesce(c.address_city, '') || ' ' || coalesce(c.address_country, '') || ' ' || coalesce(c.legal_form, '') || ' ' || coalesce(rd.roles_text, '') || ' ' || coalesce(rld.relations_text, '')), 'B') ||
          setweight(to_tsvector('simple', coalesce(c.reference_id, '') || ' ' || coalesce(c.vat_id, '') || ' ' || coalesce(c.tax_id, '') || ' ' || coalesce(c.registration_number, '')), 'C') ||
          setweight(to_tsvector('simple', coalesce(c.notes, '')), 'D')
        ) as search_vector,
        lower(concat_ws(' ', c.display_name, c.legal_name, c.contact_name, c.email, c.billing_email, c.phone, c.reference_id, c.vat_id, c.tax_id, c.registration_number, c.legal_form, c.address_city, c.address_country, rd.roles_text, rld.relations_text)) as fuzzy_text,
        e.embedding
      from module_contacts.contacts c
      left join role_docs rd on rd.contact_id = c.id
      left join relation_docs rld on rld.contact_id = c.id
      left join module_contacts.contact_search_embeddings e on e.contact_id = c.id
      where c.tenant_id = p_tenant_id
        and c.scope_id = p_scope_id
        and c.deleted_at is null
        and (p_type is null or c.type = p_type)
        and (p_role is null or p_role = any(coalesce(rd.roles, array[]::text[])))
    ),
    scored as (
      select
        d.id,
        d.display_name,
        d.type,
        d.roles,
        case
          when cardinality(params.ts_queries) = 0 then 0::double precision
          else coalesce((
            select max(ts_rank_cd(d.search_vector, ts_query)::double precision)
            from unnest(params.ts_queries) as ts_queries(ts_query)
          ), 0::double precision)
        end as fts_score,
        case
          when cardinality(params.query_lowers) = 0 then 0::double precision
          else coalesce((
            select max(greatest(similarity(d.fuzzy_text, query_lower), word_similarity(query_lower, d.fuzzy_text)))
            from unnest(params.query_lowers) as query_lowers(query_lower)
          ), 0::double precision)
        end as trigram_score,
        case
          when qembs is null or d.embedding is null then 0::double precision
          else coalesce((
            select max((1.0 - (d.embedding <=> qemb))::double precision)
            from unnest(qembs) as query_embeddings(qemb)
          ), 0::double precision)
        end as vector_score,
        case
          when p_role is not null and p_role = any(d.roles) then 1::double precision
          else 0::double precision
        end as role_score,
        array_remove(array[
          case when exists (
            select 1
            from unnest(params.query_lowers) as query_lowers(query_lower)
            where position(query_lower in lower(d.display_name)) > 0
          ) then 'display_name' end,
          case when p_type is not null and d.type = p_type then 'type' end,
          case when p_role is not null and p_role = any(d.roles) then 'role' end,
          case when exists (
            select 1
            from unnest(params.ts_queries) as ts_queries(ts_query)
            where d.search_vector @@ ts_query
          ) then 'text' end,
          case when coalesce((
            select max(greatest(similarity(d.fuzzy_text, query_lower), word_similarity(query_lower, d.fuzzy_text)))
            from unnest(params.query_lowers) as query_lowers(query_lower)
          ), 0::double precision) >= p_trigram_threshold then 'fuzzy' end,
          case when qembs is not null and d.embedding is not null and coalesce((
            select max((1.0 - (d.embedding <=> qemb))::double precision)
            from unnest(qembs) as query_embeddings(qemb)
          ), 0::double precision) >= p_vector_threshold then 'semantic' end
        ], null) as matched_fields
      from docs d
      cross join query_params params
    ),
    validated as (
      select
        *,
        (
          fts_score * 2.0 +
          trigram_score +
          vector_score +
          role_score
        ) as score
      from scored
      cross join query_params params
      where
        cardinality(params.query_lowers) = 0
        or fts_score > 0
        or trigram_score >= p_trigram_threshold
        or vector_score >= p_vector_threshold
        or role_score > 0
    ),
    ordered as (
      select
        *,
        row_number() over (order by score desc, display_name asc, id asc) as rn
      from validated
    )
    select jsonb_build_object(
      'total', (select count(*)::bigint from validated),
      'ids', coalesce(
        (
          select jsonb_agg(id order by rn)
          from ordered
          where rn > p_offset and rn <= p_offset + p_limit
        ),
        '[]'::jsonb
      ),
      'matches', coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', id,
              'score', score,
              'matched_fields', to_jsonb(matched_fields),
              'match_reason',
                case
                  when role_score > 0 then 'role'
                  when fts_score > 0 then 'text'
                  when trigram_score >= p_trigram_threshold then 'fuzzy'
                  when vector_score >= p_vector_threshold then 'semantic'
                  else 'filtered'
                end,
              'source_scores', jsonb_build_object(
                'fts', fts_score,
                'trigram', trigram_score,
                'vector', vector_score,
                'role', role_score
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

grant execute on function module_contacts.search_contacts(uuid, text, text, int, int, text, text, text, text, text[], double precision, double precision) to service_role;

-- >>> from 20260604130000_plugin_contacts_person_name_parts.sql
-- Structured person name parts + derived display_name (team module parity).

alter table module_contacts.contacts
  add column if not exists name_prefix text,
  add column if not exists first_name text,
  add column if not exists middle_name text,
  add column if not exists last_name text,
  add column if not exists name_suffix text,
  add column if not exists phonetic_name text,
  add column if not exists birth_name text,
  add column if not exists display_name_override text;

update module_contacts.contacts c
set
  last_name = coalesce(
    nullif(trim(c.last_name), ''),
    nullif(
      trim(
        split_part(
          trim(coalesce(nullif(trim(c.legal_name), ''), c.display_name)),
          ' ',
          array_length(
            string_to_array(
              trim(coalesce(nullif(trim(c.legal_name), ''), c.display_name)),
              ' '
            ),
            1
          )
        )
      ),
      ''
    ),
    trim(coalesce(nullif(trim(c.legal_name), ''), c.display_name))
  ),
  first_name = coalesce(
    nullif(trim(c.first_name), ''),
    case
      when array_length(
        string_to_array(
          trim(coalesce(nullif(trim(c.legal_name), ''), c.display_name)),
          ' '
        ),
        1
      ) >= 2 then
        trim(
          split_part(
            trim(coalesce(nullif(trim(c.legal_name), ''), c.display_name)),
            ' ',
            1
          )
        )
      else null
    end
  )
where c.type = 'person'
  and trim(coalesce(c.display_name, '')) <> ''
  and (c.last_name is null or trim(c.last_name) = '');

drop index if exists module_contacts.idx_module_contacts_contacts_search_fts;
drop index if exists module_contacts.idx_module_contacts_contacts_search_trgm;

create index if not exists idx_module_contacts_contacts_search_fts
  on module_contacts.contacts using gin (
    (
      setweight(to_tsvector('simple', coalesce(display_name, '')), 'A') ||
      setweight(
        to_tsvector(
          'simple',
          coalesce(legal_name, '') || ' ' || coalesce(contact_name, '') || ' ' ||
          coalesce(name_prefix, '') || ' ' || coalesce(first_name, '') || ' ' ||
          coalesce(middle_name, '') || ' ' || coalesce(last_name, '') || ' ' ||
          coalesce(name_suffix, '') || ' ' || coalesce(phonetic_name, '') || ' ' ||
          coalesce(birth_name, '')
        ),
        'A'
      ) ||
      setweight(to_tsvector('simple', coalesce(email, '') || ' ' || coalesce(billing_email, '') || ' ' || coalesce(website_contact, '') || ' ' || coalesce(website_impress, '')), 'B') ||
      setweight(to_tsvector('simple', coalesce(address_city, '') || ' ' || coalesce(address_country, '') || ' ' || coalesce(legal_form, '')), 'B') ||
      setweight(to_tsvector('simple', coalesce(reference_id, '') || ' ' || coalesce(vat_id, '') || ' ' || coalesce(tax_id, '') || ' ' || coalesce(registration_number, '')), 'C') ||
      setweight(to_tsvector('simple', coalesce(notes, '')), 'D')
    )
  )
  where deleted_at is null;

create index if not exists idx_module_contacts_contacts_search_trgm
  on module_contacts.contacts using gin (
    lower(
      coalesce(display_name, '') || ' ' ||
      coalesce(legal_name, '') || ' ' ||
      coalesce(contact_name, '') || ' ' ||
      coalesce(name_prefix, '') || ' ' ||
      coalesce(first_name, '') || ' ' ||
      coalesce(middle_name, '') || ' ' ||
      coalesce(last_name, '') || ' ' ||
      coalesce(name_suffix, '') || ' ' ||
      coalesce(phonetic_name, '') || ' ' ||
      coalesce(birth_name, '') || ' ' ||
      coalesce(email, '') || ' ' ||
      coalesce(billing_email, '') || ' ' ||
      coalesce(phone, '') || ' ' ||
      coalesce(reference_id, '') || ' ' ||
      coalesce(vat_id, '') || ' ' ||
      coalesce(tax_id, '') || ' ' ||
      coalesce(registration_number, '') || ' ' ||
      coalesce(legal_form, '') || ' ' ||
      coalesce(address_street, '') || ' ' ||
      coalesce(address_zip, '') || ' ' ||
      coalesce(address_city, '') || ' ' ||
      coalesce(address_country, '') || ' ' ||
      coalesce(website_contact, '') || ' ' ||
      coalesce(website_impress, '') || ' ' ||
      coalesce(notes, '')
    ) gin_trgm_ops
  )
  where deleted_at is null;
