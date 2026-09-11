-- Space link on knowledge bases (PLAN-spaces.md Phase 4).
--
-- The Drive projects a space's KB pages, so something has to say which pages
-- belong to which space. The column goes on the KNOWLEDGE BASE, not on each
-- article: a knowledge base is a steady thing like a space is, and tagging
-- every article would be a per-row answer to a per-library question.
--
-- NULL means TENANT-WIDE, and that is a feature rather than a gap: a shared
-- handbook that every space's Drive should show has no single space to belong
-- to. Same shape as `commons`, which keeps its meaning at both roots.
--
-- Composite FK on (space_id, tenant_id) for the reason the tasks/projects
-- companions give: the module DAL runs partly on a service-role client, so a
-- plain reference to core.spaces(id) would accept another tenant's space and
-- RLS would not be there to catch it.
--
-- Idempotent: guarded column add, guarded constraint add, no backfill.

alter table module_kb.knowledge_bases
  add column if not exists space_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'kb_knowledge_bases_space_tenant_fkey'
      and conrelid = 'module_kb.knowledge_bases'::regclass
  ) then
    alter table module_kb.knowledge_bases
      add constraint kb_knowledge_bases_space_tenant_fkey
      foreign key (space_id, tenant_id) references core.spaces (id, tenant_id)
      on delete set null;
  end if;
end
$$;

-- Deliberately NOT backfilled to the default space, unlike goals/tasks/projects.
-- Those are work containers and the plan says every one of them belongs to
-- exactly one space; a knowledge base is a library, and the libraries that exist
-- today were written for the whole tenant. Pinning them to Company on migration
-- would silently narrow what every other space can see.

create index if not exists idx_module_kb_knowledge_bases_space
  on module_kb.knowledge_bases (tenant_id, space_id)
  where space_id is not null and deleted_at is null;

notify pgrst, 'reload schema';
