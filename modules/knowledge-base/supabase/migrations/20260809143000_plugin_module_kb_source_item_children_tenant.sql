-- Give the three kb_source_item child tables a tenant boundary.
--
-- kb_source_item_sections / _media / _links hold the extracted content of an
-- ingested source item: section text, media URLs and storage keys, outbound
-- links. Each hangs off kb_source_items, which is tenant-scoped, and today all
-- reads go through a source_item_id that came from an already-scoped query.
--
-- So unlike the tag joins fixed alongside this, there is no known leak here.
-- This is the consistency half of the same change, and it is worth doing for
-- one specific reason: these tables hold the *content*, which is exactly what
-- a future cross-module reader (retrieval, context-graph, an AI face) would
-- reach for — and such a reader has no local convention telling it to join
-- through the parent first. Closing it now costs a backfill; closing it after
-- that reader exists costs an incident.
--
-- Composite FK as everywhere else, so the denormalised columns cannot drift
-- from the parent item.

-- 0. Drop the composite FKs first if a previous run created them — they depend
--    on the parent unique index recreated in step 1. Only matters on a re-run.
alter table module_kb.kb_source_item_sections
  drop constraint if exists kb_source_item_sections_item_tenant_fkey;
alter table module_kb.kb_source_item_media
  drop constraint if exists kb_source_item_media_item_tenant_fkey;
alter table module_kb.kb_source_item_links
  drop constraint if exists kb_source_item_links_item_tenant_fkey;

-- 1. Parent key for the composite FKs.
alter table module_kb.kb_source_items
  drop constraint if exists kb_source_items_id_tenant_scope_key;
alter table module_kb.kb_source_items
  add constraint kb_source_items_id_tenant_scope_key
    unique (id, tenant_id, scope_id);

-- 2. Add, backfill, enforce — identical for all three.
do $$
declare
  child text;
  unresolved int;
begin
  foreach child in array array[
    'kb_source_item_sections',
    'kb_source_item_media',
    'kb_source_item_links'
  ] loop
    execute format(
      'alter table module_kb.%I
         add column if not exists tenant_id uuid,
         add column if not exists scope_id text', child);

    execute format(
      'update module_kb.%I c
          set tenant_id = i.tenant_id, scope_id = i.scope_id
         from module_kb.kb_source_items i
        where i.id = c.source_item_id
          and (c.tenant_id is null or c.scope_id is null)', child);

    -- source_item_id already had an ON DELETE CASCADE parent, so orphans
    -- cannot exist and the backfill must be total. Fail rather than quietly
    -- discard ingested content.
    execute format(
      'select count(*) from module_kb.%I where tenant_id is null or scope_id is null',
      child) into unresolved;
    if unresolved > 0 then
      raise exception '% backfill left % row(s) with no tenant/scope', child, unresolved;
    end if;

    execute format(
      'alter table module_kb.%I
         alter column tenant_id set not null,
         alter column scope_id set not null', child);
  end loop;
end $$;

-- 3. Composite FKs replacing the single-column ones.
alter table module_kb.kb_source_item_sections
  drop constraint if exists kb_source_item_sections_source_item_id_fkey;
alter table module_kb.kb_source_item_sections
  add constraint kb_source_item_sections_item_tenant_fkey
    foreign key (source_item_id, tenant_id, scope_id)
    references module_kb.kb_source_items (id, tenant_id, scope_id)
    on delete cascade on update cascade;

alter table module_kb.kb_source_item_media
  drop constraint if exists kb_source_item_media_source_item_id_fkey;
alter table module_kb.kb_source_item_media
  add constraint kb_source_item_media_item_tenant_fkey
    foreign key (source_item_id, tenant_id, scope_id)
    references module_kb.kb_source_items (id, tenant_id, scope_id)
    on delete cascade on update cascade;

alter table module_kb.kb_source_item_links
  drop constraint if exists kb_source_item_links_source_item_id_fkey;
alter table module_kb.kb_source_item_links
  add constraint kb_source_item_links_item_tenant_fkey
    foreign key (source_item_id, tenant_id, scope_id)
    references module_kb.kb_source_items (id, tenant_id, scope_id)
    on delete cascade on update cascade;

create index if not exists idx_module_kb_source_item_sections_tenant
  on module_kb.kb_source_item_sections (tenant_id, scope_id);
create index if not exists idx_module_kb_source_item_media_tenant
  on module_kb.kb_source_item_media (tenant_id, scope_id);
create index if not exists idx_module_kb_source_item_links_tenant
  on module_kb.kb_source_item_links (tenant_id, scope_id);

-- 4. Direct predicates. These tables are service-role only (no `authenticated`
--    grants), so the policies are belt-and-braces — but they should say the
--    same thing as every other table in the schema.
do $$
declare
  child text;
begin
  foreach child in array array[
    'kb_source_item_sections',
    'kb_source_item_media',
    'kb_source_item_links'
  ] loop
    execute format('alter table module_kb.%I enable row level security', child);
    execute format('drop policy if exists %I on module_kb.%I',
      child || '_own_scope', child);
    execute format(
      'create policy %I on module_kb.%I for all
         using (tenant_id = core.current_tenant_id() and core.has_scope(scope_id))
         with check (tenant_id = core.current_tenant_id() and core.has_scope(scope_id))',
      child || '_own_scope', child);
  end loop;
end $$;
