-- Space Pages are markdown artifacts (ai.artifact), not knowledge-base articles.
-- Folders nest via parent_id. Pages written through the always-visible KB adapter
-- in spaces that never mounted knowledge-base are copied here so they keep a home.

alter table ai.artifact
  add column if not exists parent_id uuid references ai.artifact (id) on delete cascade;

create index if not exists artifact_parent_idx
  on ai.artifact (tenant_id, scope_type, scope_id, parent_id)
  where status = 'active';

grant select, insert, update, delete on table ai.artifact to engenty_server;
grant select, insert, update, delete on table ai.artifact_version to engenty_server;

drop policy if exists srv_tenant_isolation on ai.artifact;
create policy srv_tenant_isolation on ai.artifact
  as permissive for all to engenty_server
  using (tenant_id = (select core.current_tenant_id()))
  with check (tenant_id = (select core.current_tenant_id()));

drop policy if exists srv_tenant_isolation on ai.artifact_version;
create policy srv_tenant_isolation on ai.artifact_version
  as permissive for all to engenty_server
  using (tenant_id = (select core.current_tenant_id()))
  with check (tenant_id = (select core.current_tenant_id()));

-- Fake Pages: kb.articles created while the KB adapter was alwaysVisible, in
-- spaces that do not mount knowledge-base. Do not flatten a mounted library.
with source as (
  select
    a.tenant_id,
    a.title,
    kb.space_id,
    a.created_by,
    a.created_at,
    a.updated_at,
    coalesce(a.content_markdown, '') as content,
    case
      when a.id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then a.id::uuid
      else public.uuidv7()
    end as artifact_id
  from module_kb.articles a
  join module_kb.knowledge_bases kb
    on kb.id = a.kb_id
    and kb.tenant_id = a.tenant_id
  where a.deleted_at is null
    and kb.space_id is not null
    and not exists (
      select 1
      from core.space_mount m
      where m.tenant_id = kb.tenant_id
        and m.space_id = kb.space_id
        and m.resource_type = 'module'
        and m.resource_key = 'knowledge-base'
    )
),
inserted as (
  insert into ai.artifact (
    id,
    tenant_id,
    type,
    title,
    scope_type,
    scope_id,
    created_by_kind,
    created_by,
    current_version,
    storage,
    status,
    created_at,
    updated_at
  )
  select
    s.artifact_id,
    s.tenant_id,
    'markdown',
    s.title,
    'space',
    s.space_id::text,
    'user',
    case
      when s.created_by ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then s.created_by::uuid
      else null
    end,
    1,
    'inline',
    'active',
    s.created_at,
    s.updated_at
  from source s
  where not exists (
    select 1 from ai.artifact existing
    where existing.id = s.artifact_id
  )
  returning id, tenant_id
)
insert into ai.artifact_version (
  tenant_id,
  artifact_id,
  version,
  content,
  created_by_kind,
  created_at
)
select
  i.tenant_id,
  i.id,
  1,
  s.content,
  'user',
  s.created_at
from inserted i
join source s on s.artifact_id = i.id
where not exists (
  select 1 from ai.artifact_version v
  where v.artifact_id = i.id
    and v.version = 1
);
