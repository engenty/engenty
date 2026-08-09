-- Give module_kb.article_tags and module_kb.faq_tags a tenant boundary.
--
-- These two differ from the other join tables fixed today (project_team,
-- task_collaborators, contact_roles) in a way that matters: they have TWO
-- tenant-scoped parents, not one. article_tags joins an article to a tag, and
-- both carry their own tenant_id/scope_id. Nothing in the schema said the two
-- had to agree, so an article in tenant A could be tagged with tenant B's tag
-- — and the RLS policies only ever checked the article side, so reading it
-- back would happily expose the foreign tag's name.
--
-- Adding a tenant column alone would not close that. Pointing BOTH composite
-- foreign keys at the same (tenant_id, scope_id) pair on the row does: the
-- article and the tag must now resolve to the same tenant and scope, or
-- Postgres rejects the row. That is the actual fix here; the column is what
-- makes it expressible.
--
-- Application side: getTagsForIds (src/dal/shared.ts) already takes a
-- `tenantId` parameter and never uses it — the filter had nowhere to go. It
-- does now.

-- 0. Drop the composite FKs first if a previous run created them. They depend
--    on the parent unique indexes recreated in step 1, so dropping those while
--    the FKs exist fails. Only matters when re-running; harmless on a fresh DB.
alter table module_kb.article_tags
  drop constraint if exists article_tags_article_tenant_fkey,
  drop constraint if exists article_tags_tag_tenant_fkey;

alter table module_kb.faq_tags
  drop constraint if exists faq_tags_faq_tenant_fkey,
  drop constraint if exists faq_tags_tag_tenant_fkey;

-- 1. Parent keys for the composite FKs.
alter table module_kb.articles
  drop constraint if exists articles_id_tenant_scope_key;
alter table module_kb.articles
  add constraint articles_id_tenant_scope_key unique (id, tenant_id, scope_id);

alter table module_kb.faqs
  drop constraint if exists faqs_id_tenant_scope_key;
alter table module_kb.faqs
  add constraint faqs_id_tenant_scope_key unique (id, tenant_id, scope_id);

alter table module_kb.tags
  drop constraint if exists tags_id_tenant_scope_key;
alter table module_kb.tags
  add constraint tags_id_tenant_scope_key unique (id, tenant_id, scope_id);

-- 2. article_tags: add, backfill, enforce.
alter table module_kb.article_tags
  add column if not exists tenant_id uuid,
  add column if not exists scope_id text;

update module_kb.article_tags at
set tenant_id = a.tenant_id,
    scope_id = a.scope_id
from module_kb.articles a
where a.id = at.article_id
  and (at.tenant_id is null or at.scope_id is null);

alter table module_kb.faq_tags
  add column if not exists tenant_id uuid,
  add column if not exists scope_id text;

update module_kb.faq_tags ft
set tenant_id = f.tenant_id,
    scope_id = f.scope_id
from module_kb.faqs f
where f.id = ft.faq_id
  and (ft.tenant_id is null or ft.scope_id is null);

-- Both sides had ON DELETE CASCADE parents, so orphans cannot exist and the
-- backfill must be total. A cross-tenant row that predates this migration,
-- however, CAN exist — it is exactly what the constraints below forbid, and
-- the backfill resolves it to the article/faq side. Report those separately:
-- silently rewriting one is fine (the tag reference simply becomes invalid and
-- the FK will reject it), but it should not happen unnoticed.
do $$
declare
  unresolved int;
  mismatched int;
begin
  select
    (select count(*) from module_kb.article_tags where tenant_id is null or scope_id is null)
    + (select count(*) from module_kb.faq_tags where tenant_id is null or scope_id is null)
  into unresolved;

  if unresolved > 0 then
    raise exception 'kb tag-join backfill left % row(s) with no tenant/scope', unresolved;
  end if;

  select
    (select count(*) from module_kb.article_tags j
       join module_kb.tags t on t.id = j.tag_id
      where t.tenant_id <> j.tenant_id or t.scope_id <> j.scope_id)
    + (select count(*) from module_kb.faq_tags j
         join module_kb.tags t on t.id = j.tag_id
        where t.tenant_id <> j.tenant_id or t.scope_id <> j.scope_id)
  into mismatched;

  if mismatched > 0 then
    raise exception
      'kb tag-join has % cross-tenant row(s) — an article/faq is tagged with another tenant''s tag; resolve before enforcing', mismatched;
  end if;
end $$;

alter table module_kb.article_tags
  alter column tenant_id set not null,
  alter column scope_id set not null;

alter table module_kb.faq_tags
  alter column tenant_id set not null,
  alter column scope_id set not null;

-- 3. Both FKs on each table reference the SAME (tenant_id, scope_id) columns,
--    which is what forces owner and tag into the same tenant and scope.
--
--    They must be DEFERRABLE INITIALLY DEFERRED, and that is not incidental.
--    Two ON UPDATE CASCADE constraints sharing a column pair fight each other:
--    moving an article to another scope cascades article_tags.scope_id
--    immediately, and the row then points at a tag that has not moved yet, so
--    the tag FK fails mid-statement and the scope move becomes impossible.
--    Deferring both means "article and tag agree" is checked once at COMMIT,
--    after the transaction has moved both. Enforcement is unchanged —
--    PostgREST wraps every request in a transaction, so a bad row still cannot
--    be committed; it is only the moment of checking that shifts.
alter table module_kb.article_tags
  drop constraint if exists article_tags_article_id_fkey,
  drop constraint if exists article_tags_tag_id_fkey;

alter table module_kb.article_tags
  add constraint article_tags_article_tenant_fkey
    foreign key (article_id, tenant_id, scope_id)
    references module_kb.articles (id, tenant_id, scope_id)
    on delete cascade on update cascade
    deferrable initially deferred,
  add constraint article_tags_tag_tenant_fkey
    foreign key (tag_id, tenant_id, scope_id)
    references module_kb.tags (id, tenant_id, scope_id)
    on delete cascade on update cascade
    deferrable initially deferred;

alter table module_kb.faq_tags
  drop constraint if exists faq_tags_faq_id_fkey,
  drop constraint if exists faq_tags_tag_id_fkey;

alter table module_kb.faq_tags
  add constraint faq_tags_faq_tenant_fkey
    foreign key (faq_id, tenant_id, scope_id)
    references module_kb.faqs (id, tenant_id, scope_id)
    on delete cascade on update cascade
    deferrable initially deferred,
  add constraint faq_tags_tag_tenant_fkey
    foreign key (tag_id, tenant_id, scope_id)
    references module_kb.tags (id, tenant_id, scope_id)
    on delete cascade on update cascade
    deferrable initially deferred;

create index if not exists idx_module_kb_article_tags_tenant
  on module_kb.article_tags (tenant_id, scope_id);
create index if not exists idx_module_kb_faq_tags_tenant
  on module_kb.faq_tags (tenant_id, scope_id);

-- 4. Direct predicates instead of exists-subqueries through the owner. Note
--    the old policies checked only the article/faq — never the tag — so this
--    is a tightening, not just a rewrite.
drop policy if exists article_tags_read_own_scope on module_kb.article_tags;
create policy article_tags_read_own_scope on module_kb.article_tags
for select using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

drop policy if exists article_tags_insert_own_scope on module_kb.article_tags;
create policy article_tags_insert_own_scope on module_kb.article_tags
for insert with check (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

drop policy if exists article_tags_delete_own_scope on module_kb.article_tags;
create policy article_tags_delete_own_scope on module_kb.article_tags
for delete using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

drop policy if exists faq_tags_read_own_scope on module_kb.faq_tags;
create policy faq_tags_read_own_scope on module_kb.faq_tags
for select using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

drop policy if exists faq_tags_insert_own_scope on module_kb.faq_tags;
create policy faq_tags_insert_own_scope on module_kb.faq_tags
for insert with check (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

drop policy if exists faq_tags_delete_own_scope on module_kb.faq_tags;
create policy faq_tags_delete_own_scope on module_kb.faq_tags
for delete using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);
