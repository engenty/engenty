-- Companion to the tasks/projects space-delete CASCADE. A knowledge base
-- belongs to exactly one space; deleting that space deletes the library.
--
-- Guarded so a database without the KB module can still apply this.

do $$
begin
  if to_regclass('module_kb.knowledge_bases') is null then
    return;
  end if;
  alter table module_kb.knowledge_bases
    drop constraint if exists kb_knowledge_bases_space_tenant_fkey;
  alter table module_kb.knowledge_bases
    add constraint kb_knowledge_bases_space_tenant_fkey
    foreign key (space_id, tenant_id) references core.spaces (id, tenant_id)
    on delete cascade;
end
$$;

notify pgrst, 'reload schema';
