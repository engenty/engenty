-- One knowledge base per space (decision 2026-09-05).
--
-- A space is the unit people think in; a second library inside it only ever
-- created the question "which one?" — in the URL, the sidebar switcher, the
-- chat scope picker, and every agent call. So the URL no longer names a
-- library (`/s/<key>/knowledge-base/...`), the pickers are gone, and the row
-- rule follows: at most one live knowledge base per (tenant, space).
--
-- This migration REFUSES to run while any space still has several. Picking a
-- survivor is a product decision made in the UI (delete the others), not a
-- migration's guess. Local stacks: delete the extra libraries first.
--
-- Idempotent.

do $$
declare
  offender record;
begin
  for offender in
    select tenant_id, space_id, count(*) as n
    from module_kb.knowledge_bases
    where deleted_at is null
    group by tenant_id, space_id
    having count(*) > 1
  loop
    raise exception
      'space % (tenant %) has % knowledge bases; a space has exactly one — delete the extra libraries before rerunning',
      offender.space_id, offender.tenant_id, offender.n;
  end loop;
end
$$;

create unique index if not exists idx_module_kb_knowledge_bases_one_per_space
  on module_kb.knowledge_bases (tenant_id, space_id)
  where deleted_at is null;

notify pgrst, 'reload schema';
