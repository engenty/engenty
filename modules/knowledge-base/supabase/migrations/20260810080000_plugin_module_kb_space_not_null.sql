-- A knowledge base belongs to exactly one space (PLAN-spaces.md Phase 6/6b).
--
-- This REVERSES the Phase 4 decision. That migration deliberately left space_id
-- nullable and said NULL meant "tenant-wide", so a shared handbook could appear
-- in every space's Drive, and it deliberately did not backfill. The product call
-- is the opposite: a knowledge base is part of a space's file tree, so it lives
-- in a space the same way its goals, tasks and projects do. There is no
-- tenant-wide library tier.
--
-- What that costs, stated plainly rather than discovered later: a library that
-- several spaces used to share now belongs to ONE of them. The backfill puts
-- every existing library in the tenant's default (Company) space, because that
-- is where a pre-spaces library was authored and it is the one space every
-- tenant has. Moving one somewhere else is a UI action from here on, not a
-- migration.
--
-- Same FK shape as the tasks/projects companions: `on delete restrict`, since
-- `set null` cannot coexist with `not null`. Note this replaces the
-- `set null (space_id)` form that 20260810070200 had just introduced — that
-- migration fixed a real defect (a bare composite SET NULL also nulls
-- tenant_id), and it stays in history as the record of it; the column simply
-- stops being nullable one migration later.
--
-- Idempotent: re-runnable backfill, guarded constraint swap.

update module_kb.knowledge_bases k
set space_id = s.id
from core.spaces s
where s.tenant_id = k.tenant_id and s.is_default and k.space_id is null;

do $$
declare
  orphaned bigint;
begin
  select count(*) into orphaned
  from module_kb.knowledge_bases where space_id is null;
  if orphaned > 0 then
    raise exception
      'space_id backfill incomplete: % knowledge base(s) have no space. Their tenants are missing a default space — check core.spaces (is_default) before rerunning.',
      orphaned;
  end if;
end
$$;

alter table module_kb.knowledge_bases
  drop constraint if exists kb_knowledge_bases_space_tenant_fkey;
alter table module_kb.knowledge_bases
  add constraint kb_knowledge_bases_space_tenant_fkey
  foreign key (space_id, tenant_id) references core.spaces (id, tenant_id)
  on delete restrict;

alter table module_kb.knowledge_bases alter column space_id set not null;

-- The Phase 4 index was partial on `space_id is not null`, which is now every
-- live row; keep the `deleted_at` half, which still discriminates.
drop index if exists module_kb.idx_module_kb_knowledge_bases_space;
create index if not exists idx_module_kb_knowledge_bases_space
  on module_kb.knowledge_bases (tenant_id, space_id)
  where deleted_at is null;

notify pgrst, 'reload schema';
